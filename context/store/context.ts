// The one way in to Context (#676): every Context domain is read, written and searched through this entry. Records keep
// the formats they are stored in today; the envelope (id, kind, origin, times, revision, derivedFrom) is read from each
// stored record, not written beside it. Platform persists (it gives a `ContextStorage`); this decides who may write what.
// An Agent reaches Context only in a call the entry admitted against its Grants (`agentContext`), and each decision is
// audited here; the host injects the Grants and the audit (`ContextGuard`), so Context never imports Agent.
// Rules (scripts/architecture-boundaries.ts): UI only reads Context, so `ui/` never imports `contextWriter`; only
// Connectors write the Synced kind, so only `context/connectors/` imports `syncedWriter`; only the standing World tools
// server admits an Agent, so only it imports `agentContext`.

type Row=Record<string,any>;
export const CONTEXT_KINDS=['synced','recorded','made','known'] as const;
export type ContextKind=typeof CONTEXT_KINDS[number];
/** Who a record came from: a Service, an Agent (by its agentId), the person, Fox or the World itself. */
export type ContextOrigin={by:'service'|'agent'|'person'|'fox'|'world';id?:string};
/** The envelope every Context record has, whatever its domain. Times are milliseconds since 1970, or null when the
 * stored record has none. */
export type ContextEnvelope={id:string;kind:ContextKind;domain:ContextDomainId;origin:ContextOrigin;createdAt:number|null;updatedAt:number|null;revision:number|null;derivedFrom:string[]};
/** One record through the entry: its envelope, and the record exactly as it is stored. */
export type ContextRecord<T=Row>=ContextEnvelope&{body:T};

/** Every Context domain, its kind and where it is kept today (context/store/STORAGE.md#four-kinds). */
export const CONTEXT_DOMAINS=[
 {id:'service-sync',kind:'synced',label:'Service sync',storage:'state.service-sync-snapshots'},
 {id:'source-facts',kind:'synced',label:'Source collection facts',storage:'state.attention-context'},
 {id:'sources',kind:'synced',label:'Sources',storage:'sources table and sources/ files'},
 {id:'conversations',kind:'recorded',label:'Conversations',storage:'companion_turns, companion_notes'},
 {id:'chat-by-place',kind:'recorded',label:'Chat by place',storage:'companion_cards, companion_views'},
 {id:'history',kind:'recorded',label:'History and execution journal',storage:'entries, execution_payloads'},
 {id:'execution',kind:'recorded',label:'Execution',storage:'state.runs, state.attention-budget'},
 {id:'attention-reviews',kind:'recorded',label:'Attention decisions',storage:'state.reviews'},
 {id:'agent-asks',kind:'recorded',label:'Agent asks',storage:'state.agent-asks, agent_ask_attachments'},
 {id:'agent-reports',kind:'recorded',label:'Agent reports',storage:'state.agent-reports'},
 {id:'service-requests',kind:'recorded',label:'Service requests',storage:'state.service-requests'},
 {id:'web-recordings',kind:'recorded',label:'Website recordings',storage:'web_visits, web_records'},
 {id:'browser-visits',kind:'recorded',label:'Browsing history',storage:'browser_visits'},
 {id:'brought-agents',kind:'recorded',label:'Brought Agents',storage:'brought_skills, brought_routines'},
 {id:'artifacts',kind:'made',label:'Artifacts',storage:'artifacts'},
 {id:'artifact-pages',kind:'made',label:'Artifact pages',storage:'artifact_pages'},
 {id:'widgets',kind:'made',label:'Moment Applets',storage:'my_applets (page)'},
 {id:'made-games',kind:'made',label:'Made games',storage:'made_games, made_game_versions'},
 {id:'ongoing',kind:'made',label:'Ongoing things',storage:'my_applets (conversation)'},
 {id:'calendar-events',kind:'made',label:'Local calendar events',storage:'calendar_events'},
 {id:'board',kind:'made',label:'Board',storage:'state.board'},
 {id:'service-presets',kind:'made',label:'Service presets',storage:'state.service-presets'},
 {id:'github-drafts',kind:'made',label:'GitHub drafts',storage:'state.github-drafts'},
 {id:'service-drafts',kind:'made',label:'PostHog and Notion drafts',storage:'state.service-drafts'},
 {id:'mail-reviews',kind:'made',label:'Email drafts',storage:'mail_reviews'},
 {id:'coding-tasks',kind:'made',label:'Codex coding tasks',storage:'coding_tasks'},
 {id:'companion',kind:'known',label:'Companion',storage:'companion_profile'},
 {id:'attention-items',kind:'known',label:'Attention items',storage:'state.items'},
 {id:'knowledge',kind:'known',label:'Knowledge',storage:'knowledge table'},
] as const satisfies readonly {id:string;kind:ContextKind;label:string;storage:string}[];
export type ContextDomainId=typeof CONTEXT_DOMAINS[number]['id'];
export type ContextDomain=typeof CONTEXT_DOMAINS[number];

/** A change to one domain, in its stored shape: records to save, ids to forget, and what goes with them (a page, its
 * state, the Attention item of a draft). `operation` names a domain's own change when it is more than a save (an
 * Attention item's status, a review, an archive), with its arguments in `with`. */
export type ContextChange={save?:Row[];forget?:string[];with?:Row;operation?:string};
/** How Platform keeps one domain. `rows` lists its records as stored; `search` is a domain's own index (conversations,
 * website recordings) when listing every row would be too much; `query` answers a domain's own named reads (a thread's
 * turns, a visit's records); `write` applies a change as one save, told who writes it, and answers what the domain's
 * change answers. */
export type ContextDomainStore={rows?():Row[];get?(id:string):Row|null;search?(terms:string[],limit:number):Row[];
 query?(name:string,args:Row):unknown;write?(change:ContextChange,author:ContextOrigin):unknown};
/** What Platform gives the entry: the domains it keeps, and a transaction when several writes must land together. */
export type ContextStorage={domains:Partial<Record<ContextDomainId,ContextDomainStore>>;transaction?<T>(work:()=>T):T};

export function contextDomain(id:string):ContextDomain {
 const domain=CONTEXT_DOMAINS.find(item=>item.id===id);
 if(!domain)throw Error(`Unknown Context domain: ${id}.`);
 return domain;
}
const store=(storage:ContextStorage,id:ContextDomainId)=>{
 contextDomain(id);
 const kept=storage.domains[id];
 if(!kept)throw Error(`This World does not keep ${contextDomain(id).label.toLowerCase()} here.`);
 return kept;
};

const ID_FIELDS:Partial<Record<ContextDomainId,string>>={'agent-reports':'agentId'};
const SERVICE_FIELDS=['provider','origin','service','source'];
/** A stored time as milliseconds: seconds and milliseconds since 1970 and ISO strings are all used today. */
export function contextTime(value:unknown):number|null {
 if(typeof value==='number'&&Number.isFinite(value)&&value>0)return value<1e11?Math.round(value*1000):Math.round(value);
 if(typeof value==='string'&&value){const parsed=Date.parse(value);return Number.isFinite(parsed)?parsed:null;}
 return null;
}
function origin(kind:ContextKind,row:Row):ContextOrigin {
 const text=(value:unknown)=>typeof value==='string'&&value?value:undefined;
 if(kind==='synced'){const id=SERVICE_FIELDS.map(field=>text(row[field])).find(Boolean);return id?{by:'service',id}:{by:'service'};}
 const agent=text(row.agentId)??text(row.agent);
 if(agent)return {by:'agent',id:agent};
 const by=text(row.origin)??text(row.by)??text(row.author);
 if(by==='user'||by==='person')return {by:'person'};
 if(by==='fox')return {by:'fox'};
 if(by==='agent')return {by:'agent'};
 return {by:'world'};
}
function derivedFrom(row:Row):string[] {
 const out:string[]=[];
 const add=(value:unknown)=>{if(typeof value==='string'&&value&&!out.includes(value))out.push(value);};
 for(const field of ['derivedFrom','sourceIds','sourceIDs'])if(Array.isArray(row[field]))row[field].forEach(add);
 if(Array.isArray(row.sources))for(const source of row.sources)add(typeof source==='string'?source:source?.id??source?.sourceId);
 for(const field of ['artifact','sourceId','sourceID'])add(row[field]);
 return out;
}
/** The envelope of one stored record of a domain, read from the fields it already has. */
export function contextEnvelope(domain:ContextDomainId,row:Row):ContextEnvelope {
 const {kind}=contextDomain(domain),field=ID_FIELDS[domain]??'id';
 const revision=[row.revision,row.version].find(value=>typeof value==='number'&&Number.isFinite(value));
 return {id:String(row[field]??row.id??row.key??''),kind,domain,origin:origin(kind,row),
  createdAt:contextTime(row.createdAt??row.startedAt??row.madeAt),updatedAt:contextTime(row.updatedAt??row.savedAt??row.collectedAt??row.at??row.createdAt),
  revision:revision??null,derivedFrom:derivedFrom(row)};
}
const record=<T extends Row>(domain:ContextDomainId,row:T):ContextRecord<T>=>({...contextEnvelope(domain,row),body:row});

/** One hit of the search across kinds. */
export type ContextHit={record:ContextRecord;title:string;snippet:string;score:number};
export type ContextQuery={kinds?:readonly ContextKind[];domains?:readonly ContextDomainId[];limit?:number};
export const CONTEXT_SEARCH_LIMITS={results:50,rowText:20_000,snippet:160,terms:12};
/** The words a search looks for: lower case, at most a dozen, each at least two characters. */
export function contextTerms(query:string):string[] {
 return [...new Set(String(query??'').toLowerCase().split(/\s+/).filter(term=>term.length>1))].slice(0,CONTEXT_SEARCH_LIMITS.terms);
}
function rowText(row:unknown,limit=CONTEXT_SEARCH_LIMITS.rowText):string {
 const parts:string[]=[];let size=0;
 const walk=(value:unknown,depth:number)=>{
  if(size>=limit||depth>6)return;
  if(typeof value==='string'){parts.push(value);size+=value.length+1;}
  else if(Array.isArray(value))for(const item of value)walk(item,depth+1);
  else if(value&&typeof value==='object')for(const item of Object.values(value))walk(item,depth+1);
 };
 walk(row,0);
 return parts.join(' ').slice(0,limit);
}
const titleOf=(row:Row,id:string)=>String([row.title,row.name,row.label,row.question,row.text].find(value=>typeof value==='string'&&value.trim())??id).slice(0,200);
function snippet(text:string,terms:string[]):string {
 const lower=text.toLowerCase(),at=Math.max(0,Math.min(...terms.map(term=>{const index=lower.indexOf(term);return index<0?Infinity:index;}))-40);
 const clipped=text.slice(Number.isFinite(at)?at:0).replace(/\s+/g,' ').trim();
 return clipped.length>CONTEXT_SEARCH_LIMITS.snippet?clipped.slice(0,CONTEXT_SEARCH_LIMITS.snippet-1)+'…':clipped;
}
function score(text:string,title:string,terms:string[]):number {
 const lower=text.toLowerCase(),heading=title.toLowerCase();let total=0;
 for(const term of terms){
  let count=0;for(let at=lower.indexOf(term);at>=0&&count<50;at=lower.indexOf(term,at+term.length))count++;
  if(!count)return 0;
  total+=count+(heading.includes(term)?5:0);
 }
 return total;
}

/** Reading Context: every domain, one record or the search across kinds. Anyone may read; Grants decide what an Agent
 * sees before it gets here. */
export function contextReader(storage:ContextStorage) {
 const rows=(domain:ContextDomainId):Row[]=>{const kept=store(storage,domain);return kept.rows?kept.rows():[];};
 return {
  domains:()=>CONTEXT_DOMAINS.filter(domain=>storage.domains[domain.id]),
  has:(domain:ContextDomainId)=>!!storage.domains[domain],
  /** One of a domain's own named reads, as the domain answers it. */
  query:<T=unknown>(domain:ContextDomainId,name:string,args:Row={}):T=>{
   const kept=store(storage,domain);
   if(!kept.query)throw Error(`${contextDomain(domain).label} has no ${name} here.`);
   return kept.query(name,args) as T;
  },
  /** Every record of a domain, as stored, in the order the domain keeps them. */
  read:<T extends Row=Row>(domain:ContextDomainId):ContextRecord<T>[]=>rows(domain).map(row=>record(domain,row as T)),
  /** The stored records alone, for callers that only need what they always read. */
  bodies:<T extends Row=Row>(domain:ContextDomainId):T[]=>rows(domain) as T[],
  get:<T extends Row=Row>(domain:ContextDomainId,id:string):ContextRecord<T>|null=>{
   const kept=store(storage,domain);
   const row=kept.get?kept.get(id):(kept.rows?kept.rows():[]).find(item=>contextEnvelope(domain,item).id===id)??null;
   return row?record(domain,row as T):null;
  },
  /** Full text across kinds: every term must appear; title matches and repeated terms rank first, then the newest. */
  search:(query:string,{kinds,domains,limit=20}:ContextQuery={}):ContextHit[]=>{
   const terms=contextTerms(query);
   if(!terms.length)return [];
   const max=Math.max(1,Math.min(CONTEXT_SEARCH_LIMITS.results,Math.floor(limit)||20)),hits:ContextHit[]=[];
   for(const domain of CONTEXT_DOMAINS){
    if(kinds&&!kinds.includes(domain.kind)||domains&&!domains.includes(domain.id))continue;
    const kept=storage.domains[domain.id];
    if(!kept)continue;
    let candidates:Row[]=[];
    try{candidates=kept.search?kept.search(terms,max):kept.rows?kept.rows():[];}catch{continue;}
    for(const row of candidates){
     const found=record(domain.id,row),title=titleOf(row,found.id),text=rowText(row),value=score(text,title,terms);
     if(value>0||kept.search)hits.push({record:found,title,snippet:snippet(text,terms),score:Math.max(value,1)});
    }
   }
   return hits.sort((a,b)=>b.score-a.score||(b.record.updatedAt??0)-(a.record.updatedAt??0)).slice(0,max);
  },
 };
}
export type ContextReader=ReturnType<typeof contextReader>;

/** Who writes, as the entry hands it to the domain: an author named by kind alone becomes `{by}`. */
export function contextAuthor(author:ContextOrigin['by']|ContextOrigin):ContextOrigin {
 const value=typeof author==='string'?{by:author}:author;
 if(!value||!['service','agent','person','fox','world'].includes(value.by))throw Error('Say who writes this Context.');
 return value.id?{by:value.by,id:String(value.id)}:{by:value.by};
}
function writer(storage:ContextStorage,author:ContextOrigin,check:(domain:ContextDomain)=>void) {
 const change=(domain:ContextDomainId,work:ContextChange):unknown=>{
  const found=contextDomain(domain);
  check(found);
  const kept=store(storage,domain);
  if(!kept.write)throw Error(`${found.label} cannot be changed here.`);
  return kept.write(work,author);
 };
 return {
  author,
  /** Saves records of a domain in their stored shape, and forgets the ids given, as one save; or the domain's own
   * `operation`. Answers what the domain answers. */
  write:<T=unknown>(domain:ContextDomainId,work:ContextChange):T=>change(domain,work) as T,
  remove:(domain:ContextDomainId,ids:string[])=>{if(ids.length)change(domain,{forget:ids});},
  /** Several writes that land together, or none of them. */
  transaction:<T>(work:()=>T):T=>storage.transaction?storage.transaction(work):work(),
 };
}
const CONNECTOR_ONLY='{label} is kept up to date by its Connector; nothing else writes it.';
/** Who writes through `contextWriter`: the person, Fox or the World. An Agent writes only in a call the entry admitted
 * (`agentContext`), and a Service only through its Connector (`syncedWriter`). */
export type ContextAuthor='person'|'fox'|'world'|{by:'person'|'fox'|'world';id?:string};
/** Writing Recorded, Made and Known Context. The person, Fox and the World write here; Synced is refused, since only
 * Connectors write it (`syncedWriter`), and so is an Agent, which writes only under its Grants (`agentContext`). UI never
 * writes: it asks Agent. */
export function contextWriter(storage:ContextStorage,author:ContextAuthor) {
 const who=contextAuthor(author as ContextOrigin);
 if(who.by==='service')throw Error('A Service\'s records are written by its Connector.');
 if(who.by==='agent')throw new ContextRefused(CONTEXT_REFUSALS.unadmitted);
 return writer(storage,who,({kind,label})=>{if(kind==='synced')throw Error(CONNECTOR_ONLY.replace('{label}',label));});
}
/** Writing Synced Context: the bounded copies of Services. Only Connectors (context/connectors) use this. */
export function syncedWriter(storage:ContextStorage,service:string) {
 return writer(storage,service?{by:'service',id:service}:{by:'service'},({kind,label})=>{if(kind!=='synced')throw Error(`Only Recorded, Made and Known Context is written there; ${label} is not Synced.`);});
}
export type ContextWriter=ReturnType<typeof writer>;

/** One call an Agent makes into the World, as the Gate names it (agent/gate/GRANTS.md): which Agent, and the World
 * gateway target and action it called. */
export type ContextCall={agentId:string;target:string;action:string};
/** What the Agent's Grants decided about one call, in the Gate's words: `allowed`, `denied`, or `asked` (it goes on, and
 * the person confirms its write on a card); the Grant that decided and why; and the domains the call may write (none
 * when absent). */
export type ContextVerdict={decision:'allowed'|'denied'|'asked';grantId?:string;reason?:string;writes?:readonly ContextDomainId[]};
/** What Platform injects so the entry decides an Agent's calls without importing Agent: `decide`, the call against the
 * Agent's own Grants, and `audit`, where the one record of each decision goes, allowed or refused. */
export type ContextGuard={decide(call:ContextCall):ContextVerdict;audit(call:ContextCall,verdict:ContextVerdict):void};
/** What the entry refused an Agent, with the reason the Agent is told. */
export class ContextRefused extends Error {
 constructor(message:string){super(message);this.name='ContextRefused';}
}
export const CONTEXT_REFUSALS=Object.freeze({
 unguarded:'Worldlet cannot check this Agent\'s Grants here, so it may not do this.',
 unadmitted:'An Agent changes Context only in a call its Grants allowed.',
 denied:'This Agent may not do this.',
 domain:'This call does not change {label}.',
});
/** An Agent's way in to Context: its call is decided against its Grants here, once, and audited (allowed or refused),
 * before anything is read or written for it. Refused, it throws `ContextRefused` with the reason. Admitted, it gives the
 * writer the call may use: written as that Agent, only the domains its verdict names, never Synced, and a write outside
 * them is refused and audited too. Every Context read and write the host makes for an Agent's call happens after this. */
export function agentContext(guard:ContextGuard|null|undefined,call:ContextCall) {
 if(!guard||typeof guard.decide!=='function'||typeof guard.audit!=='function')throw new ContextRefused(CONTEXT_REFUSALS.unguarded);
 if(!call||typeof call.agentId!=='string'||!call.agentId||typeof call.target!=='string'||typeof call.action!=='string')throw new ContextRefused(CONTEXT_REFUSALS.denied);
 const asked={agentId:call.agentId,target:call.target,action:call.action};
 const verdict=guard.decide(asked);
 guard.audit(asked,verdict);
 if(verdict?.decision!=='allowed'&&verdict?.decision!=='asked')throw new ContextRefused(verdict?.reason||CONTEXT_REFUSALS.denied);
 const author:ContextOrigin={by:'agent',id:asked.agentId},writes=[...verdict.writes??[]];
 const refuse=(reason:string):never=>{guard.audit(asked,{decision:'denied',reason});throw new ContextRefused(reason);};
 return {
  call:asked,author,verdict,
  /** Writes as this Agent, in this call: only the domains the call may write. */
  writer:(storage:ContextStorage):ContextWriter=>writer(storage,author,({id,kind,label})=>{
   if(kind==='synced')refuse(CONNECTOR_ONLY.replace('{label}',label));
   if(!writes.includes(id))refuse(CONTEXT_REFUSALS.domain.replace('{label}',label.toLowerCase()));
  }),
 };
}
export type AgentContext=ReturnType<typeof agentContext>;
