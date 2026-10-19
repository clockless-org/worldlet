import {AGENT_ARTIFACT_LIMITS,type AgentArtifactRead,type AgentArtifactSave,type AgentArtifactView} from '../../contracts/agent-artifacts.ts';
import {AGENT_ID_PATTERN} from '../../contracts/agent-identity.ts';
import {looksSecret} from './agent-profile.ts';
import {ARTIFACT_LIMITS,artifactSizeFor,mergeArtifact,orderArtifacts,validArtifactId,type Artifact} from '../../context/artifacts/index.ts';

/** Agent artifacts (contracts/agent-artifacts.ts, agent/agent/GRANTS.md#agent-artifacts). Pure: hosts supply the kept
 * artifacts, the calling Agent's ID (from its token) and name, the new artifact's ID and the clock, and save what comes
 * back. Every refusal throws an Error whose message the Agent is shown. */

export const AGENT_ARTIFACT_REASONS=Object.freeze({
 invalid:`An artifact has a title of up to ${ARTIFACT_LIMITS.title} characters on one line, a Markdown body of up to ${ARTIFACT_LIMITS.body} characters, an optional one-sentence brief of up to ${ARTIFACT_LIMITS.brief} and an optional key.`,
 key:`A key is a short stable name of up to ${AGENT_ARTIFACT_LIMITS.key} letters, digits, dots, colons, dashes or underscores, such as hourly-2026-10-17T07.`,
 secret:'An artifact may not hold passwords, tokens or keys. Name the thing instead.',
 control:'An artifact may not hold control characters.',
 taken:'Another artifact already uses this key. Choose another key.',
 read:`Read with an optional agent (an Agent's ID), query (words in the title, up to ${AGENT_ARTIFACT_LIMITS.query} characters) and limit (1 to ${AGENT_ARTIFACT_LIMITS.readMax}).`,
 own:'This Agent may read only its own artifacts. The person can allow it to read what other Agents saved in Settings › Agents.',
});

// C0 controls (except tab and line breaks, allowed in the body only), DEL, C1 controls, and the bidirectional overrides
// that can make a card read differently from what it holds (as agent/agent/asks.ts).
const CONTROL=/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f‪-‮⁦-⁩]/;
const LINE_BREAK=/[\t\r\n]/;
const KEY=new RegExp(`^[A-Za-z0-9][A-Za-z0-9._:-]{0,${AGENT_ARTIFACT_LIMITS.key-1}}$`);
const record=(value:unknown):Record<string,unknown>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
const count=(value:string)=>[...value].length;
const fail=(reason:string):never=>{throw new Error(reason);};
const only=(value:Record<string,unknown>,keys:string[],reason:string)=>{for(const key of Object.keys(value))if(!keys.includes(key))fail(reason);};

/** Clean text, or a refusal: control characters and anything that looks like a credential are refused, never kept. */
function text(value:unknown,limit:number,{multiline=false,required=false}={}):string {
 if(value===undefined||value===null||value===''){if(required)fail(AGENT_ARTIFACT_REASONS.invalid);return '';}
 if(typeof value!=='string')return fail(AGENT_ARTIFACT_REASONS.invalid);
 if(CONTROL.test(value)||!multiline&&LINE_BREAK.test(value))fail(AGENT_ARTIFACT_REASONS.control);
 const clean=value.replace(/\r\n?/g,'\n').trim();
 if(required&&!clean||count(clean)>limit)fail(AGENT_ARTIFACT_REASONS.invalid);
 if(looksSecret(clean))fail(AGENT_ARTIFACT_REASONS.secret);
 return clean;
}

/** `agent-artifacts/save` arguments, checked. Anything else, an `agentId` the model sent included, refuses the call. */
export function readAgentArtifactSave(input:unknown):AgentArtifactSave {
 const value=record(input);
 only(value,['title','body','brief','key'],AGENT_ARTIFACT_REASONS.invalid);
 const save:AgentArtifactSave={title:text(value.title,ARTIFACT_LIMITS.title,{required:true}),body:text(value.body,ARTIFACT_LIMITS.body,{multiline:true,required:true})};
 const brief=text(value.brief,ARTIFACT_LIMITS.brief);if(brief)save.brief=brief;
 if(value.key!==undefined){
  if(typeof value.key!=='string'||!KEY.test(value.key))fail(AGENT_ARTIFACT_REASONS.key);
  save.key=value.key as string;
 }
 return save;
}

/** Saving one artifact: an ordinary `answer` artifact from the conversation, its place the Agent's name, stamped with the
 * Agent from its token (mergeArtifact). `id` is the host's: derived from the Agent and the key when there is one, so the
 * same key replaces the same artifact, which keeps its first time; an ID already holding something not this Agent's is
 * refused. `forget` names what the save pushes out: this Agent's own oldest past AGENT_ARTIFACT_LIMITS.perAgent, and
 * anything past the World's own limit, as every save does. */
export function saveAgentArtifact(list:readonly Artifact[],save:AgentArtifactSave,{agentId,agentName,id,now}:{agentId:string;agentName:string;id:string;now:number}):{artifact:Artifact;forget:string[]} {
 if(!AGENT_ID_PATTERN.test(agentId)||!validArtifactId(id)||!id.startsWith('art-')||!Number.isFinite(now))fail(AGENT_ARTIFACT_REASONS.invalid);
 const previous=list.find(artifact=>artifact.id===id);
 if(previous&&previous.agentId!==agentId)fail(AGENT_ARTIFACT_REASONS.taken);
 const place=[...(String(agentName||'').replace(/\s+/g,' ').trim()||agentId)].slice(0,ARTIFACT_LIMITS.place).join('');
 const next:Artifact={id,kind:'answer',title:save.title,body:save.body,chart:null,size:artifactSizeFor(undefined,save.body,null),
  origin:{type:'conversation',place},actions:[],createdAt:now,updatedAt:now};
 if(save.brief)next.brief=save.brief;
 const artifact=mergeArtifact(previous,next,now,agentId);
 const others=list.filter(item=>item.id!==id);
 const mine=orderArtifacts([artifact,...others.filter(item=>item.agentId===agentId)]).kept.slice(AGENT_ARTIFACT_LIMITS.perAgent).map(item=>item.id);
 const {forget}=orderArtifacts([artifact,...others.filter(item=>!mine.includes(item.id))]);
 return {artifact,forget:[...mine,...forget]};
}

/** `agent-artifacts/read` arguments, checked. */
export function readAgentArtifactRead(input:unknown):AgentArtifactRead {
 const value=record(input);
 only(value,['agent','query','limit'],AGENT_ARTIFACT_REASONS.read);
 const read:AgentArtifactRead={limit:AGENT_ARTIFACT_LIMITS.readDefault};
 if(value.agent!==undefined){
  if(typeof value.agent!=='string'||!AGENT_ID_PATTERN.test(value.agent))fail(AGENT_ARTIFACT_REASONS.read);
  read.agent=value.agent as string;
 }
 if(value.query!==undefined){
  if(typeof value.query!=='string'||count(value.query)>AGENT_ARTIFACT_LIMITS.query||CONTROL.test(value.query))fail(AGENT_ARTIFACT_REASONS.read);
  const query=(value.query as string).replace(/\s+/g,' ').trim();
  if(query)read.query=query;
 }
 if(value.limit!==undefined){
  if(!Number.isInteger(value.limit)||(value.limit as number)<1||(value.limit as number)>AGENT_ARTIFACT_LIMITS.readMax)fail(AGENT_ARTIFACT_REASONS.read);
  read.limit=value.limit as number;
 }
 return read;
}

/** The artifacts a read returns: only artifacts an Agent saved (one with a host-stamped `agentId`), never Fox's own or an
 * Attention card, which hold the person's private summaries; newest first; of one Agent and with every word of the query
 * in the title when given. `onlyAgent` is the caller's own ID when its Grants let it read only its own artifacts: asking
 * for another Agent's is then refused. */
export function findAgentArtifacts(list:readonly Artifact[],read:AgentArtifactRead,onlyAgent?:string):AgentArtifactView[] {
 if(onlyAgent!==undefined&&read.agent!==undefined&&read.agent!==onlyAgent)fail(AGENT_ARTIFACT_REASONS.own);
 const agent=onlyAgent??read.agent,words=(read.query??'').toLowerCase().split(' ').filter(Boolean);
 return orderArtifacts(list.filter(artifact=>artifact.kind==='answer'&&typeof artifact.agentId==='string'&&(!agent||artifact.agentId===agent)
   &&words.every(word=>artifact.title.toLowerCase().includes(word)))).kept
  .slice(0,Math.max(1,Math.min(AGENT_ARTIFACT_LIMITS.readMax,read.limit)))
  .map(artifact=>({id:artifact.id,agentId:artifact.agentId!,title:artifact.title,...artifact.brief?{brief:artifact.brief}:{},body:artifact.body,savedAt:new Date(artifact.updatedAt*1000).toISOString()}));
}
