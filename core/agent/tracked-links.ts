import {TRACKED_LINK_LIMITS,TRACKED_LINK_STATES,type TrackedLink,type TrackedLinkRead,type TrackedLinkState} from '../../contracts/tracked-links.ts';
import {looksSecret} from './agent-profile.ts';

/** Tracked links (contracts/tracked-links.ts, core/agent/GRANTS.md#tracked-links). Pure: hosts supply the stored rows,
 * the calling Agent's ID (from its token) and the clock, and save what comes back. Every refusal throws an Error whose
 * message the Agent is shown, and a refused call changes nothing. */

export const LINK_REASONS=Object.freeze({
 invalid:'This is not a valid tracked links call.',
 id:`Each row needs an id of letters, digits and -, at most ${TRACKED_LINK_LIMITS.id} characters.`,
 title:'A new row needs a title.',
 secret:'Tracked links may not hold passwords, tokens or keys.',
 control:'Tracked links may not hold control characters.',
 link:'A link must be one https address.',
 time:'Times must be ISO times.',
 rows:`Send between 1 and ${TRACKED_LINK_LIMITS.save} rows at a time, each once.`,
 full:`This World already keeps ${TRACKED_LINK_LIMITS.total} tracked links.`,
});
export const LINK_ID_PATTERN=/^[A-Za-z0-9][A-Za-z0-9-]{0,63}$/;

const record=(value:unknown):Record<string,unknown>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
const fail=(reason:string):never=>{throw new Error(reason);};
const CONTROL=/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f‪-‮⁦-⁩]/;
const count=(value:string)=>[...value].length;
function text(value:unknown,limit:number,multiline=false):string {
 if(typeof value!=='string')return fail(LINK_REASONS.invalid);
 if(CONTROL.test(value)||!multiline&&/[\t\r\n]/.test(value))fail(LINK_REASONS.control);
 const clean=value.replace(/\r\n?/g,'\n').trim();
 if(count(clean)>limit)fail(LINK_REASONS.invalid);
 if(looksSecret(clean))fail(LINK_REASONS.secret);
 return clean;
}
function link(value:unknown):string {
 if(typeof value!=='string'||count(value)>TRACKED_LINK_LIMITS.link||!/^https:\/\/[^\s/?#@\\]+(?:[/?#][^\s\\]*)?$/i.test(value)||CONTROL.test(value)||looksSecret(value))return fail(LINK_REASONS.link);
 return value;
}
function instant(value:unknown):string {
 const at=typeof value==='string'?Date.parse(value):NaN;
 return Number.isFinite(at)?new Date(at).toISOString():fail(LINK_REASONS.time);
}
function list(value:unknown,limit:number,item:(entry:unknown)=>string):string[] {
 if(!Array.isArray(value)||value.length>limit)return fail(LINK_REASONS.invalid);
 return [...new Set(value.map(item))];
}

const FIELDS=['id','title','summary','type','channel','state','text','tags','url','trackingUrl','publishedAt','views','viewsAt','media'];
/** A stored row, or null when it is not one. */
export function readStoredLink(value:unknown):TrackedLink|null {
 const row=record(value);
 return typeof row.id==='string'&&LINK_ID_PATTERN.test(row.id)&&typeof row.title==='string'&&TRACKED_LINK_STATES.includes(row.state as TrackedLinkState)&&Number.isInteger(row.revision)?row as unknown as TrackedLink:null;
}

/** `links/save`: the rows it creates or changes, each at its next revision, stamped with the calling Agent (none for the
 * person). A field left out stays; `null` clears an optional one. Publishing without a time stamps it now. */
export function saveLinks(stored:readonly TrackedLink[],agentId:string|undefined,input:unknown,at:string):TrackedLink[] {
 const value={...record(input)};delete value.agentId;
 for(const key of Object.keys(value))if(key!=='rows')fail(LINK_REASONS.invalid);
 const rows=value.rows;
 if(!Array.isArray(rows)||!rows.length||rows.length>TRACKED_LINK_LIMITS.save)return fail(LINK_REASONS.rows);
 const byId=new Map(stored.map(row=>[row.id,row]));
 const seen=new Set<string>();
 const changed:TrackedLink[]=[];
 for(const entry of rows){
  const change={...record(entry)};delete change.agentId;
  for(const key of Object.keys(change))if(!FIELDS.includes(key))fail(LINK_REASONS.invalid);
  const id=typeof change.id==='string'&&LINK_ID_PATTERN.test(change.id)?change.id:fail(LINK_REASONS.id);
  if(seen.has(id))fail(LINK_REASONS.rows);
  seen.add(id);
  const before=byId.get(id);
  const next:TrackedLink=before?{...before,tags:[...before.tags],media:[...before.media]}:{id,title:'',summary:'',type:'',channel:'',state:'draft',text:'',tags:[],media:[],revision:0,createdAt:at,updatedAt:at};
  if('title' in change)next.title=change.title===null?'':text(change.title,TRACKED_LINK_LIMITS.title);
  if(!next.title)fail(LINK_REASONS.title);
  for(const [key,limit] of [['summary',TRACKED_LINK_LIMITS.summary],['type',TRACKED_LINK_LIMITS.type],['channel',TRACKED_LINK_LIMITS.channel]] as const)
   if(key in change)next[key]=change[key]===null?'':text(change[key],limit,key==='summary');
  if('type' in change)next.type=next.type.toLowerCase();
  if('channel' in change)next.channel=next.channel.toLowerCase();
  if('text' in change)next.text=change.text===null?'':text(change.text,TRACKED_LINK_LIMITS.text,true);
  if('state' in change){
   if(!TRACKED_LINK_STATES.includes(change.state as TrackedLinkState))fail(LINK_REASONS.invalid);
   next.state=change.state as TrackedLinkState;
  }
  if('tags' in change)next.tags=list(change.tags,TRACKED_LINK_LIMITS.tags,tag=>text(tag,TRACKED_LINK_LIMITS.tag).toLowerCase()||fail(LINK_REASONS.invalid));
  if('media' in change)next.media=list(change.media,TRACKED_LINK_LIMITS.media,item=>typeof item==='string'&&/^https:/i.test(item)?link(item):text(item,200)||fail(LINK_REASONS.invalid));
  for(const key of ['url','trackingUrl'] as const)if(key in change){if(change[key]===null)delete next[key];else next[key]=link(change[key]);}
  for(const key of ['publishedAt','viewsAt'] as const)if(key in change){if(change[key]===null)delete next[key];else next[key]=instant(change[key]);}
  if('views' in change){
   if(change.views===null)delete next.views;
   else if(Number.isInteger(change.views)&&(change.views as number)>=0)next.views=change.views as number;
   else fail(LINK_REASONS.invalid);
  }
  if(next.state==='published'&&!next.publishedAt)next.publishedAt=at;
  if(before&&FIELDS.every(key=>JSON.stringify((before as any)[key])===JSON.stringify((next as any)[key])))continue;
  if(agentId)next.agentId=agentId;else delete next.agentId;
  next.revision+=1;next.updatedAt=at;
  changed.push(next);
 }
 if(stored.length+changed.filter(row=>!byId.has(row.id)).length>TRACKED_LINK_LIMITS.total)fail(LINK_REASONS.full);
 return changed;
}

/** When a row counts for ordering and `since`: when it was published, else when it was made. */
const when=(row:TrackedLink)=>row.publishedAt??row.createdAt;
/** `links/read`: particular rows, or the newest narrowed by state, channel and time. */
export function readLinks(stored:readonly TrackedLink[],input:unknown):TrackedLink[] {
 const value={...record(input)};delete value.agentId;
 for(const key of Object.keys(value))if(!['ids','state','channel','since','limit'].includes(key))fail(LINK_REASONS.invalid);
 const read:TrackedLinkRead={};
 if(value.ids!==undefined)read.ids=list(value.ids,TRACKED_LINK_LIMITS.read,id=>typeof id==='string'&&LINK_ID_PATTERN.test(id)?id:fail(LINK_REASONS.id));
 if(value.state!==undefined){if(!TRACKED_LINK_STATES.includes(value.state as TrackedLinkState))fail(LINK_REASONS.invalid);read.state=value.state as TrackedLinkState;}
 if(value.channel!==undefined)read.channel=text(value.channel,TRACKED_LINK_LIMITS.channel).toLowerCase();
 if(value.since!==undefined)read.since=instant(value.since);
 const limit=value.limit===undefined?TRACKED_LINK_LIMITS.read:Number.isInteger(value.limit)&&(value.limit as number)>=1&&(value.limit as number)<=TRACKED_LINK_LIMITS.read?value.limit as number:fail(LINK_REASONS.invalid);
 return stored.filter(row=>(!read.ids||read.ids.includes(row.id))&&(!read.state||row.state===read.state)&&(!read.channel||row.channel===read.channel)&&(!read.since||when(row)>=read.since))
  .sort((a,b)=>when(b).localeCompare(when(a))||b.id.localeCompare(a.id)).slice(0,limit);
}
