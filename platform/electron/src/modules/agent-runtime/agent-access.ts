import crypto from 'node:crypto';
import {AGENT_AUDIT_KEEP,agentRevoked,channelDefaultGrants,grantActive,readAgentIdentity,readGrant,askGrant,askGrantAuditEntry,boardGrant,boardGrantAuditEntry,conversationGrant,conversationGrantAuditEntry,linkGrant,linkGrantAuditEntry,githubDraftGrant,githubDraftGrantAuditEntry,githubWriteGrant,githubWriteGrantAuditEntry,githubWriteGrants,githubWriteGrantId,serviceGrantAuditEntry,serviceReadGrant,reportGrant,reportGrantAuditEntry} from '../../../../../core/agent/index.ts';
import {GITHUB_WRITE_LIMITS} from '../../../../../contracts/github-drafts.ts';
import type {AgentAuditEntry,AgentIdentity,Grant} from '../../../../../contracts/agent-identity.ts';
import {readAgentSetting,writeAgentSetting} from '../../store/agent-settings.ts';
import type {AgentAccess,VaultService} from '../../host/services.ts';
import type {Row} from './types.ts';

// Per-Agent identity, Grants and audit (core/agent/GRANTS.md). Core decides; this keeps the records: identities and
// Grants with Fox's setup choices (`agent_settings`, so they follow the World and its backups), the hash of each Agent's
// token for this run in the vault (the token itself only ever goes into that Agent's owner-only endpoint file), and
// each decision in the World's ledger as `agent.audit`, the newest AGENT_AUDIT_KEEP per Agent.

const SETTING='agent-access';
const tokenKey=(agentId:string)=>'agent-token:'+agentId;
const hash=(token:string)=>crypto.createHash('sha256').update(token).digest('hex');
type Stored={identities:AgentIdentity[];grants:Grant[]};
/** The World's ledger, while it is the person's own World (not the practice World) and writable. */
export type AuditLedger={recordAgentAudit(entry:Row,keep:number):boolean;agentAudit(agent:string,limit?:number):Row[]};

export function createAgentAccess({root,vault,ledger,now=()=>new Date().toISOString()}:{root:string;vault:VaultService;ledger:()=>AuditLedger|null;now?:()=>string}):AgentAccess {
 const load=():Stored=>{
  let value:Row|null=null;try{value=readAgentSetting(root,SETTING);}catch{}
  const list=(key:string)=>Array.isArray(value?.[key])?value![key] as unknown[]:[];
  return {identities:list('identities').flatMap(row=>{const v=readAgentIdentity(row);return v?[v]:[];}),grants:list('grants').flatMap(row=>{const v=readGrant(row);return v?[v]:[];})};
 };
 const save=(stored:Stored)=>writeAgentSetting(root,SETTING,stored as unknown as Row);
 // Hash of this run's token → Agent; the vault keeps the same hash, so a token is checked against it.
 const tokens=new Map<string,string>();
 const listeners:((agentId:string)=>void)[]=[];
 // Last use is written at most once a minute per Agent.
 const seen=new Map<string,number>();
 const access:AgentAccess={
  ensure(agent){
   const stored=load(),at=now();
   let identity=stored.identities.find(item=>item.id===agent.id);
   if(!identity){identity={id:agent.id,name:agent.name,harness:agent.harness,kind:agent.kind,createdAt:at};stored.identities.push(identity);}
   // The default Grants follow today's World actions (new Applet sources included); one the person revoked stays revoked.
   if(!identity.revokedAt)for(const grant of channelDefaultGrants(identity.id,at)){
    const previous=stored.grants.find(item=>item.id===grant.id);
    if(previous?.revokedAt)continue;
    const next={...grant,grantedAt:previous?.grantedAt??grant.grantedAt};
    stored.grants=[...stored.grants.filter(item=>item.id!==grant.id),next];
   }
   save(stored);
   return identity;
  },
  issueToken(agentId){
   const identity=access.identity(agentId);
   if(!identity||agentRevoked(identity,now()))return null;
   const token=crypto.randomBytes(32).toString('hex'),digest=hash(token);
   for(const [key,id] of tokens)if(id===agentId)tokens.delete(key);
   vault.set(tokenKey(agentId),digest);tokens.set(digest,agentId);
   return token;
  },
  identify(token){
   if(typeof token!=='string'||!token)return null;
   const digest=hash(token),agentId=tokens.get(digest);
   if(!agentId)return null;
   const kept=vault.get(tokenKey(agentId));
   if(!kept||kept.length!==digest.length||!crypto.timingSafeEqual(Buffer.from(kept),Buffer.from(digest)))return null;
   const identity=access.identity(agentId);
   return identity&&!agentRevoked(identity,now())?identity:null;
  },
  identity(agentId){return load().identities.find(item=>item.id===agentId)??null;},
  grants(agentId){return load().grants.filter(item=>item.agentId===agentId);},
  audit(entry){
   try{ledger()?.recordAgentAudit(entry as unknown as Row,AGENT_AUDIT_KEEP);}catch{}
   const at=Date.parse(entry.at),last=seen.get(entry.agentId)??0;
   if(!Number.isFinite(at)||at-last<60_000)return;
   seen.set(entry.agentId,at);
   try{const stored=load(),identity=stored.identities.find(item=>item.id===entry.agentId);if(identity){identity.lastSeenAt=entry.at;save(stored);}}catch{}
  },
  list(auditLimit=20){
   const stored=load(),log=ledger();
   const last=(identity:AgentIdentity)=>Date.parse(identity.lastSeenAt??identity.createdAt)||0;
   return [...stored.identities].sort((a,b)=>last(b)-last(a)).map(identity=>{
    let audit:AgentAuditEntry[]=[];try{audit=(log?.agentAudit(identity.id,auditLimit)??[]) as unknown as AgentAuditEntry[];}catch{}
    return {identity,grants:stored.grants.filter(grant=>grant.agentId===identity.id),audit};
   });
  },
  revoke(agentId){
   const stored=load(),identity=stored.identities.find(item=>item.id===agentId);
   if(!identity)return;
   const at=now();
   if(!identity.revokedAt)identity.revokedAt=at;
   for(const grant of stored.grants)if(grant.agentId===agentId&&!grant.revokedAt)grant.revokedAt=at;
   save(stored);
   vault.delete(tokenKey(agentId));
   for(const [key,id] of tokens)if(id===agentId)tokens.delete(key);
   for(const listener of listeners)try{listener(agentId);}catch{}
  },
  grantService(agentId,provider){return give(agentId,serviceReadGrant(agentId,provider,now()),at=>serviceGrantAuditEntry(agentId,provider,true,at));},
  ungrantService(agentId,provider){return takeBack(agentId,serviceReadGrant(agentId,provider,now()),at=>serviceGrantAuditEntry(agentId,provider,false,at));},
  grantAsks(agentId,kind){return give(agentId,askGrant(agentId,kind,now()),at=>askGrantAuditEntry(agentId,kind,true,at));},
  ungrantAsks(agentId,kind){return takeBack(agentId,askGrant(agentId,kind,now()),at=>askGrantAuditEntry(agentId,kind,false,at));},
  grantBoard(agentId,kind){return give(agentId,boardGrant(agentId,kind,now()),at=>boardGrantAuditEntry(agentId,kind,true,at));},
  ungrantBoard(agentId,kind){return takeBack(agentId,boardGrant(agentId,kind,now()),at=>boardGrantAuditEntry(agentId,kind,false,at));},
  grantGithubDrafts(agentId){return give(agentId,githubDraftGrant(agentId,now()),at=>githubDraftGrantAuditEntry(agentId,true,at));},
  ungrantGithubDrafts(agentId){return takeBack(agentId,githubDraftGrant(agentId,now()),at=>githubDraftGrantAuditEntry(agentId,false,at));},
  grantConversations(agentId,kind){return give(agentId,conversationGrant(agentId,kind,now()),at=>conversationGrantAuditEntry(agentId,kind,true,at));},
  ungrantConversations(agentId,kind){return takeBack(agentId,conversationGrant(agentId,kind,now()),at=>conversationGrantAuditEntry(agentId,kind,false,at));},
  grantLinks(agentId,kind){return give(agentId,linkGrant(agentId,kind,now()),at=>linkGrantAuditEntry(agentId,kind,true,at));},
  ungrantLinks(agentId,kind){return takeBack(agentId,linkGrant(agentId,kind,now()),at=>linkGrantAuditEntry(agentId,kind,false,at));},
  grantReports(agentId,kind){return give(agentId,reportGrant(agentId,kind,now()),at=>reportGrantAuditEntry(agentId,kind,true,at));},
  ungrantReports(agentId,kind){return takeBack(agentId,reportGrant(agentId,kind,now()),at=>reportGrantAuditEntry(agentId,kind,false,at));},
  grantGithubWrites(agentId,repo,choice,labelPrefix){
   const at=now(),grant=githubWriteGrant(agentId,repo,choice,labelPrefix,at);
   // At most GITHUB_WRITE_LIMITS.grantsPerAgent repositories; choosing again for one of them replaces its Grant.
   if(!grant||githubWriteGrants(agentId,load().grants,at).filter(item=>item.id!==grant.id).length>=GITHUB_WRITE_LIMITS.grantsPerAgent)return false;
   return give(agentId,grant,at=>githubWriteGrantAuditEntry(agentId,grant.github!,true,at));
  },
  ungrantGithubWrites(agentId,repo){
   const at=now(),found=typeof repo==='string'?githubWriteGrants(agentId,load().grants,at).find(item=>item.id===githubWriteGrantId(agentId,repo)):undefined;
   if(!found)return typeof repo==='string'&&load().identities.some(item=>item.id===agentId);
   return takeBack(agentId,found,at=>githubWriteGrantAuditEntry(agentId,found.github!,false,at));
  },
  onRevoke(listener){listeners.push(listener);}
 };
 // A Grant the person gives or takes back in Settings (Core builds it from a name only: a Service, or ask or work), each
 // change audited. False for an unknown Agent, a name Core does not know or, when giving, a revoked Agent.
 function give(agentId:string,grant:Grant|null,entry:(at:string)=>AgentAuditEntry):boolean {
  const stored=load(),identity=stored.identities.find(item=>item.id===agentId),at=now();
  if(!identity||agentRevoked(identity,at)||!grant)return false;
  // The same Grant already active (a standing GitHub write Grant's reach included) changes nothing.
  if(stored.grants.some(item=>item.id===grant.id&&item.agentId===agentId&&grantActive(item,at)&&JSON.stringify(item.github)===JSON.stringify(grant.github)))return true;
  stored.grants=[...stored.grants.filter(item=>item.id!==grant.id),{...grant,grantedAt:at}];
  save(stored);
  try{ledger()?.recordAgentAudit(entry(at) as unknown as Row,AGENT_AUDIT_KEEP);}catch{}
  return true;
 }
 function takeBack(agentId:string,grant:Grant|null,entry:(at:string)=>AgentAuditEntry):boolean {
  const stored=load(),at=now();
  if(!stored.identities.some(item=>item.id===agentId)||!grant)return false;
  const active=stored.grants.find(item=>item.id===grant.id&&item.agentId===agentId&&grantActive(item,at));
  if(!active)return true;
  active.revokedAt=at;
  save(stored);
  try{ledger()?.recordAgentAudit(entry(at) as unknown as Row,AGENT_AUDIT_KEEP);}catch{}
  return true;
 }
 return access;
}
