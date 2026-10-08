import {attentionAdmission} from '../scheduling/index.ts';
import type {Delivery} from '../scheduling/index.ts';
import type {AttentionRegistration,AttentionFact,AttentionObservation,AttentionDependency,AttentionBudget,AttentionPlan} from '../../contracts/attention.ts';
import type {WorldItem} from '../../contracts/world-item.ts';
import {attentionWorkflow,combinedWorkflow} from './attention-rank.ts';
import {attentionImageURL} from './source-image.ts';

const stop=new Set('about after again before calendar could email event from have into just meeting message notes that their there these they this time tomorrow update user were what when where which with would your'.split(' '));
// Han/Kana runs lack spaces. Character bigrams of Han/Katakana stretches (Hiragana is mostly particles) give the
// same keys on every host; ICU dictionary word segmentation differs between JavaScriptCore, V8 and Jint.
const cjk=/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;
const bigrams=(part:string)=>{const chars=Array.from(part);return chars.slice(1).map((char,i)=>chars[i]+char);};
const split=(run:string)=>!cjk.test(run)?[run]:[...run.split(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]+/u).filter(part=>part.length>=4),
 ...(run.match(/[\p{Script=Han}\p{Script=Katakana}]{2,}/gu)||[]).flatMap(bigrams)];
const words=(text:string)=>[...new Set((text.toLowerCase().match(/[\p{L}\p{N}]{4,}/gu)||[]).flatMap(split))].filter(w=>!stop.has(w)).slice(0,40);
const key=(provider:string,id:string)=>JSON.stringify([provider,id]);
export function validateAttentionRegistrations(rows:AttentionRegistration[]):AttentionRegistration[]{
 const seen=new Set<string>();
 for(const row of rows){
  if(row.version!==1||!row.provider||row.provider.length>64||seen.has(row.provider)||!['native-calendar','source-reader','observation'].includes(row.reader)||!Number.isInteger(row.intervalMinutes)||row.intervalMinutes<15||row.intervalMinutes>1440||!Number.isInteger(row.freshnessMinutes)||row.freshnessMinutes<row.intervalMinutes||row.freshnessMinutes>10080)throw Error('Invalid Applet attention registration.');
  seen.add(row.provider);
 }
 return rows;
}
/** A bounded current-context cache, not a mailbox mirror. Absence is never deletion. */
// A provider date-only start/end is the user's local calendar day, not UTC midnight.
// Hosts that already send an offset time are unchanged.
function localDay(value:string){
 const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(value);if(!m)return value;
 const offset=-new Date(+m[1],+m[2]-1,+m[3]).getTimezoneOffset(),abs=Math.abs(offset);
 return `${value}T00:00:00${offset<0?'-':'+'}${String(Math.floor(abs/60)).padStart(2,'0')}:${String(abs%60).padStart(2,'0')}`;
}
/** Weather is context, not news. Every changed revision starts a model pass and makes items
 * that cite it stale, so forecast drift of a degree or two between 15-minute refreshes keeps
 * the prior text (same revision, renewed freshness). A new condition or a move of
 * WEATHER_TEMPERATURE_STEP degrees publishes the new reading. */
export const WEATHER_TEMPERATURE_STEP=3;
export function weatherObservationText(words:string,temperature:number,previous=''):string{
 const degrees=Math.sign(temperature)*Math.round(Math.abs(temperature));
 const prior=/^Current weather: (.+), (-?\d+)°\. This is not a forecast\.$/.exec(previous);
 if(prior&&prior[1]===words&&Math.abs(Number(prior[2])-degrees)<WEATHER_TEMPERATURE_STEP)return previous;
 return 'Current weather: '+words+', '+String(degrees)+'°. This is not a forecast.';
}
export function observeAttention(facts:AttentionFact[],registration:AttentionRegistration,observations:AttentionObservation[],now:number,deliveries:Delivery[]=[]):AttentionFact[]{
 validateAttentionRegistrations([registration]);
 if(!Number.isFinite(now)||!Array.isArray(observations)||observations.length>50)throw Error('Invalid attention observation batch.');
 const result=new Map(facts.map(f=>[f.id,f]));
 const incoming=new Set<string>();
 for(const o of observations){
  if(typeof o.id!=='string'||!o.id||o.id.length>500||typeof o.text!=='string'||[...o.text].length>12000||typeof (o.sourceId??o.id)!=='string'||(o.sourceId??o.id).length>500)throw Error('Invalid attention source.');
  const id=key(registration.provider,o.id),old=result.get(id),observedAt=o.observedAt??now;
  if(!Number.isFinite(observedAt)||observedAt>now)throw Error('Invalid observation time.');
  if(old&&observedAt<old.observedAt)continue;
  if(incoming.has(id))throw Error('Duplicate attention source.');incoming.add(id);
  const attributes:Record<string,string|boolean>={};
  for(const name of ['start','end','allDay','completed','cancelled','location','partial','analysisPending','image']){
   const value=o.attributes?.[name];if(typeof value==='string'){if(name==='image'){const image=attentionImageURL(value);if(image)attributes.image=image;}else attributes[name]=(name==='start'||name==='end'?localDay(value):value).slice(0,500);}else if(typeof value==='boolean')attributes[name]=value;
  }
  const content={provider:registration.provider,sourceId:o.sourceId??o.id,title:(o.title||'').slice(0,200),text:o.text,fingerprint:(o.fingerprint||'').slice(0,128),url:(o.url||'').slice(0,2000),removed:o.removed===true,keys:[...new Set([...(o.keys||[]).filter(v=>typeof v==='string'&&v.length<=80).slice(0,16),...words((o.title||'')+' '+o.text.slice(0,1000))])].sort().slice(0,48),attributes};
  const oldContent=old&&{provider:old.provider,sourceId:old.sourceId,title:old.title,text:old.text,fingerprint:old.fingerprint,url:old.url,removed:old.removed,keys:old.keys,attributes:old.attributes};
  // Re-observation after expiry must make formerly hidden suggestions eligible for review.
  const changed=!old||old.expiresAt<=now||JSON.stringify(content)!==JSON.stringify(oldContent);
  // Workflow is outside revision content: archiving or reading reorders, never invalidates.
  const workflow=attentionWorkflow(o.workflow),receivedAt=attentionReceivedAt(o.receivedAt,now);
  result.set(id,{...content,id,revision:old?old.revision+(changed?1:0):Math.max(1,Math.floor(now*1000)),observedAt,expiresAt:observedAt+registration.freshnessMinutes*60,changedAt:changed?now:old.changedAt,...(workflow?{workflow}:{}),...(receivedAt?{receivedAt}:{})});
 }
 // Pending subscribers own a reference to retained context. Never silently evict it.
 const protectedIDs=new Set(deliveries.filter(d=>d.status==='pending'||d.status==='quarantined').map(d=>d.entityId));
 const mandatory=[...result.values()].filter(f=>incoming.has(f.id)||(f.expiresAt>now&&protectedIDs.has(f.id)));
 const counts=new Map<string,number>();
 for(const f of mandatory)counts.set(f.provider,(counts.get(f.provider)||0)+1);
 if(mandatory.length>320||[...counts.values()].some(n=>n>80))throw Error('Attention delivery capacity reached; retry after pending context is consumed.');
 const selected=new Set(mandatory.map(f=>f.id));
 const retained=[...mandatory];
 for(const f of [...result.values()].sort((a,b)=>b.observedAt-a.observedAt||a.id.localeCompare(b.id))){
  if(selected.has(f.id)||(counts.get(f.provider)||0)>=80||retained.length>=320)continue;
  retained.push(f);counts.set(f.provider,(counts.get(f.provider)||0)+1);
 }
 return retained.sort((a,b)=>b.observedAt-a.observedAt||a.id.localeCompare(b.id));
}
export function attentionDependencies(item:WorldItem,facts:AttentionFact[]):AttentionDependency[]{
 const refs=item.sources as {provider:string;id:string}[]||[];
 return refs.map(ref=>{
  // A changed recurrence leaves a removed fact beside the live one under the same source ID. Quotes are verified
  // against the live fact (the evidence a turn reads skips removals), so depend on that one; a tombstone never stays current.
  const matches=facts.filter(f=>f.provider===ref.provider&&f.sourceId===ref.id),fact=matches.find(f=>!f.removed)??matches[0];
  if(!fact)throw Error('Attention source is no longer available.');
  return {id:fact.id,revision:fact.revision};
 });
}
export function attentionCurrent(dependencies:AttentionDependency[],facts:AttentionFact[],now:number,providers:string[]):boolean {
 return currentIn(dependencies,factsById(facts),now,new Set(providers));
}
function factsById(facts:AttentionFact[]){const byId=new Map<string,AttentionFact[]>();for(const f of facts){const list=byId.get(f.id);if(list)list.push(f);else byId.set(f.id,[f]);}return byId;}
function currentIn(dependencies:AttentionDependency[],byId:Map<string,AttentionFact[]>,now:number,providers:Set<string>){
 return dependencies.length>0&&dependencies.every(d=>(byId.get(d.id)||[]).some(f=>f.revision===d.revision&&!f.removed&&f.attributes.analysisPending!==true&&f.expiresAt>now&&providers.has(f.provider)));
}
/** Central presentation gate. Preserve the durable user state and history. */
export function projectAttention(items:WorldItem[],facts:AttentionFact[],now:number,providers:string[]):WorldItem[]{
 const byId=factsById(facts),bySource=new Map<string,AttentionFact>(),allowed=new Set(providers);
 for(const f of facts){const k=key(f.provider,f.sourceId);if(!bySource.has(k))bySource.set(k,f);}
 return items.map(item=>{
  if(item.attentionContentVersion!==1)return {...item,...(['open','candidate'].includes(String(item.status))?{status:'candidate'}:{})};
  item=withWorkflow(item,bySource);
  if(!Array.isArray(item.attentionDependencies))return item;
  const current=item.attentionInvalidated!==true&&currentIn(item.attentionDependencies as AttentionDependency[],byId,now,allowed);
  return {...item,attentionFresh:current,...(!current&&(['open','candidate'].includes(String(item.status))||(item.status==='read'&&item.kind!=='update'))?{status:'candidate'}:{})};
 });
}
/** The current workflow of an item's own sources, read from the latest facts so a later
 * archive or read reorders it at once (#1152). Unknown placement stays absent. The newest
 * receipt among those sources is when the item arrived; an unknown receipt stays absent. */
function withWorkflow(item:WorldItem,bySource:Map<string,AttentionFact>):WorldItem {
 const result={...item};delete result.mailPlacement;delete result.mailUnread;delete result.receivedAt;
 const refs=Array.isArray(item.sources)?item.sources as {provider?:unknown;id?:unknown}[]:[];
 const facts=refs.map(ref=>typeof ref?.provider==='string'&&typeof ref?.id==='string'?bySource.get(key(ref.provider,ref.id)):undefined);
 const workflow=combinedWorkflow(facts.map(f=>f?.workflow));
 if(workflow?.placement)result.mailPlacement=workflow.placement;
 if(typeof workflow?.unread==='boolean')result.mailUnread=workflow.unread;
 const received=facts.map(f=>f?.receivedAt).filter((v):v is string=>typeof v==='string').sort().pop();
 if(received)result.receivedAt=received;
 return result;
}
/** A reader's receipt time as an ISO instant: epoch milliseconds or an offset-bearing instant,
 * not in the future (a little clock skew aside) and after 2000. Anything else is unknown. */
export function attentionReceivedAt(value:unknown,now:number):string|undefined {
 const ms=typeof value==='number'?value:typeof value==='string'&&/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value)?Date.parse(value):NaN;
 return Number.isFinite(ms)&&ms>Date.UTC(2000,0,1)&&ms<=now*1000+600000?new Date(ms).toISOString():undefined;
}
/** Match actual source identities as well as explicit context dependencies. */
function referencedAttentionFacts(facts:AttentionFact[],items:WorldItem[]):Set<string>{
 const dependencies=new Set(items.flatMap(item=>((item.attentionDependencies||[]) as AttentionDependency[]).map(d=>d.id)));
 const sources=new Set(items.flatMap(item=>(Array.isArray(item.sources)?item.sources:[]).map(ref=>key(String(ref.provider),String(ref.id)))));
 return new Set(facts.filter(f=>dependencies.has(f.id)||sources.has(key(f.provider,f.sourceId))).map(f=>f.id));
}
/** Retire irrelevant tombstones without generating content or using a model. */
export function discardedAttentionRemovals(facts:AttentionFact[],items:WorldItem[],providers:string[]){
 const referenced=referencedAttentionFacts(facts,items);
 return facts.filter(f=>providers.includes(f.provider)&&f.removed&&!referenced.has(f.id)).map(f=>({id:f.id,revision:f.revision}));
}
/** Seeds one pass takes from a provider; a full batch never waits. */
export const ATTENTION_FULL_SEEDS=8;
/** After a successful pass, a partial batch waits this long for more of the same burst. */
export const ATTENTION_COALESCE_SECONDS=120;
/** While its source still has records waiting for S analysis (a first scan), a partial batch
 * waits this long after the previous pass started; a full batch still runs at once. */
export const ATTENTION_BACKLOG_SECONDS=600;
/** The day's first passes never wait, so a new account sees its first findings quickly. */
export const ATTENTION_QUICK_PASSES=3;
const quickPass=(budget:AttentionBudget,now:number)=>budget.day!==Math.floor(now/86400)||(budget.attempts||0)<ATTENTION_QUICK_PASSES;
/** Changed facts plus related context. A bounded periodic sweep catches missed lexical relations.
 * `backlog`: providers whose source analysis still has pending records. */
export function planAttention(facts:AttentionFact[],budget:AttentionBudget,now:number,providers:string[],items:WorldItem[]=[],deliveries:Delivery[]=[],backlog:string[]=[]):AttentionPlan|null {
 if(!attentionAdmission(budget,now).ready)return null;
 const receipts=new Map(deliveries.filter(r=>r.consumerId==='attention:center').map(r=>[r.entityId,r]));
 const delivery=(f:AttentionFact)=>{const r=receipts.get(f.id);return r?.revision===f.revision?r:undefined;};
 const isolated=(f:AttentionFact)=>delivery(f)?.status==='pending'&&delivery(f)?.isolate===true;
 const available=facts.filter(f=>f.attributes.analysisPending!==true&&f.expiresAt>now&&providers.includes(f.provider)&&delivery(f)?.status!=='quarantined');
 // Completed/cancelled history needs synthesis only when it supports a saved matter.
 const referenced=referencedAttentionFacts(available,items);
 const timeSensitive=(f:AttentionFact)=>{const start=Date.parse(String(f.attributes.start||''))/1000,end=Date.parse(String(f.attributes.end||''))/1000;return !f.removed&&Number.isFinite(start)&&(Number.isFinite(end)?end:start)>=now&&start<=now+7*86400;};
 const changed=available.filter(f=>(!f.removed||referenced.has(f.id))&&(budget.contentVersion!==1||budget.seen?.[f.id]!==f.revision)).sort((a,b)=>Number(timeSensitive(b))-Number(timeSensitive(a))||(timeSensitive(a)&&timeSensitive(b)?Date.parse(String(a.attributes.start))-Date.parse(String(b.attributes.start)):0)||a.changedAt-b.changedAt||a.id.localeCompare(b.id));
 const sweep=!changed.length&&now-(budget.lastSweepAt||0)>=21600;
 if(!changed.length&&!sweep)return null;
 // Rotation through least recently examined sources during sweeps.
 const fresh=available.filter(f=>!f.removed),offset=(budget.sweepOffset||0)%Math.max(1,fresh.length);
 const candidates=changed.length?changed:[...fresh.slice(offset),...fresh.slice(0,offset)];
 const normal=candidates.filter(f=>!isolated(f));
 // Seeds share one provider: a Mail batch cannot hold back ready Calendar findings.
 // Related context still spans providers for cross-source synthesis.
 const lead=normal[0]?.provider;
 const seeds=normal.length?normal.filter(f=>f.provider===lead).slice(0,ATTENTION_FULL_SEEDS):candidates.slice(0,1);
 if(seeds.length===1&&isolated(seeds[0]))return {facts:seeds,seeds:seeds.map(f=>({id:f.id,revision:f.revision})),sweep};
 if(!seeds.length)return null;
 // A pass costs its prompt, items and related context whatever its seed count. Shortly after a pass,
 // a partial batch waits for the rest of the burst (S extraction releases Mail five records at a time).
 if(seeds.length<ATTENTION_FULL_SEEDS&&now<(budget.coalesceUntil||0))return null;
 // A first scan releases a few records per S batch for hours; without this hold every
 // coalescing window ends in another partial M pass (#1720). The rest runs once the backlog drains.
 if(seeds.length<ATTENTION_FULL_SEEDS&&backlog.includes(lead??'')&&!quickPass(budget,now)&&now<(budget.startedAt||0)+ATTENTION_BACKLOG_SECONDS)return null;
 const keys=new Set(seeds.flatMap(f=>f.keys)),seedIDs=new Set(seeds.map(f=>f.id));
 const affected=new Set(items.flatMap(item=>{const deps=(item.attentionDependencies||[]) as AttentionDependency[];return deps.some(d=>seedIDs.has(d.id))?deps.map(d=>d.id):[];}));
 const related=available.filter(f=>!seeds.includes(f)&&!f.removed&&!isolated(f)).map(f=>({f,score:(affected.has(f.id)?100:0)+f.keys.filter(k=>keys.has(k)).length})).filter(row=>row.score>0||sweep).sort((a,b)=>b.score-a.score||b.f.observedAt-a.f.observedAt).slice(0,16).map(row=>row.f);
 return {facts:[...seeds,...related],seeds:seeds.map(f=>({id:f.id,revision:f.revision})),sweep};
}
export function startAttentionBudget(budget:AttentionBudget,now:number):AttentionBudget {
 const day=Math.floor(now/86400);
 return {...budget,day,attempts:(budget.day===day?budget.attempts||0:0)+1,nextAt:now+900,startedAt:now};
}
export function finishAttentionBudget(budget:AttentionBudget,plan:AttentionPlan,now:number,success:boolean,facts:AttentionFact[],cancelled=false,yielded=false):AttentionBudget {
 if(cancelled)return {...budget,nextAt:now+60};
 // Partial acknowledgements already persist separately; never consume the remaining plan.
 if(!success&&yielded)return {...budget,failures:0,nextAt:now+30};
 if(!success){const failures=(budget.failures||0)+1;return {...budget,failures,nextAt:now+Math.min(900,60*2**Math.min(failures,4))};}
 const seen={...(budget.contentVersion===1?budget.seen:{})};for(const d of plan.seeds)seen[d.id]=d.revision;
 // The day's first passes (a new account's first reads) follow each other quickly so a
 // second provider is not held behind a fixed pause; later passes coalesce bursts.
 const quick=(budget.attempts||0)<=ATTENTION_QUICK_PASSES;
 return {...budget,nextAt:now+(quick?5:30),coalesceUntil:quick?0:now+ATTENTION_COALESCE_SECONDS,contentVersion:1,seen:Object.fromEntries(facts.filter(f=>seen[f.id]!==undefined).map(f=>[f.id,seen[f.id]])),failures:0,lastSweepAt:budget.lastSweepAt??now,...(plan.sweep?{lastSweepAt:now,sweepOffset:(budget.sweepOffset||0)+plan.seeds.length}:{})};
}

/** Match owning evidence, not incidental context such as a shared weather forecast.
 * If synthesis changes the primary Applet, both owners must retain matching evidence.
 * Automatic continuity requires the same owner evidence, not only a source ID.
 * Explicit continuation IDs remain the path for changed evidence about the same task.
 */
export function matchingAttentionOwners(a:WorldItem,b:WorldItem):boolean {
 if(a.kind!==b.kind||typeof a.provider!=='string'||!a.provider||typeof b.provider!=='string'||!b.provider)return false;
 const refs=Array.isArray(a.sources)?a.sources:[],other=Array.isArray(b.sources)?b.sources:[];
 const quote=(value:unknown)=>typeof value==='string'?value.normalize('NFC').trim().replace(/\s+/gu,' ').toLowerCase():'';
 // Swift String equality is canonically equivalent; match world-item-identity's NFC boundary.
 const canonical=(value:unknown)=>typeof value==='string'?value.normalize('NFC'):'';
 const source=(ref:any)=>canonical(typeof ref.remoteId==='string'?ref.remoteId:ref.id);
 const shared=(provider:unknown)=>{const owner=canonical(provider);return refs.some(ref=>canonical(ref.provider)===owner&&source(ref).length>0&&other.some(candidate=>canonical(candidate.provider)===owner&&source(candidate)===source(ref)&&(a.kind!=='task'||(quote(ref.quote)&&quote(candidate.quote)===quote(ref.quote)))));};
 return shared(a.provider)&&shared(b.provider);
}
/** User feedback applies to the matter, even if a synthesis changes its primary Applet. */
export function suppressedAttention(item:WorldItem,existing:WorldItem[]):boolean {
 return existing.some(old=>matchingAttentionOwners(old,item)&&old.statusOrigin!=='agent'&&['done','dismissed','read'].includes(String(old.status)));
}
/** Both native hosts use the same synthesis continuity rule. */
export function matchingAttentionID(item:WorldItem,existing:WorldItem[]):string|null {
 const previous=existing.find(old=>typeof old.provider==='string'&&typeof item.provider==='string'&&old.provider.normalize('NFC')===item.provider.normalize('NFC')&&matchingAttentionOwners(old,item)&&typeof old.id==='string');
 return typeof previous?.id==='string'?previous.id:null;
}

/** Persist only explicitly considered seed revisions, without advancing an unfinished sweep. */
export function recordAttentionProgress(budget:AttentionBudget,plan:AttentionPlan,processed:string[],facts:AttentionFact[]):AttentionBudget {
 const available=new Set(plan.facts.map(f=>f.id));
 if(!Array.isArray(processed)||processed.some(id=>typeof id!=='string'||!available.has(id)))throw Error('Only supplied context can be processed');
 const seen={...(budget.contentVersion===1?budget.seen:{})},done=new Set(processed);
 for(const seed of plan.seeds)if(done.has(seed.id)&&facts.some(f=>f.id===seed.id&&f.revision===seed.revision))seen[seed.id]=seed.revision;
 return {...budget,contentVersion:1,seen:Object.fromEntries(facts.filter(f=>seen[f.id]!==undefined).map(f=>[f.id,seen[f.id]]))};
}

/** A background plan may include removals; its exact observed revisions must
 * still exist when committing output or consuming a delivery. */
export function attentionPlanCurrent(plan:AttentionPlan,facts:AttentionFact[],now:number,providers:string[]):boolean {
 return Number.isFinite(now)&&plan.facts.length>0&&plan.facts.every(old=>providers.includes(old.provider)&&facts.some(f=>f.id===old.id&&f.provider===old.provider&&f.revision===old.revision&&f.expiresAt>now));
}

/** A Harness completion is a claim; only committed receipts prove consumption.
 * Receipts are revision-exact, so a related fact changing during the run cannot turn
 * committed seeds into a cancellation; the changed fact is simply a new pending seed. */
export function attentionCompletion(input:{plan:AttentionPlan;facts:AttentionFact[];providers:string[];deliveries:Delivery[];now:number;success:boolean;cancelled:boolean;yielded:boolean}){
 const committed=input.plan.seeds.length>0&&input.plan.seeds.every(seed=>input.deliveries.some(row=>row.consumerId==='attention:center'&&row.entityId===seed.id&&row.revision===seed.revision&&row.status==='acknowledged'));
 const connected=input.plan.seeds.every(seed=>input.plan.facts.some(f=>f.id===seed.id&&input.providers.includes(f.provider)));
 const success=!input.cancelled&&connected&&input.success&&committed;
 const cancelled=!success&&(input.cancelled||!connected||!attentionPlanCurrent(input.plan,input.facts,input.now,input.providers));
 return {success,cancelled,yielded:!cancelled&&!success&&input.yielded};
}
