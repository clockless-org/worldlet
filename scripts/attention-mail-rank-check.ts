import assert from 'node:assert/strict';
import {observeAttention,projectAttention,attentionDependencies,attentionOrder,attentionFocusSet,attentionLevel,attentionRankSignals,attentionRankWeights,attentionSignalScore} from '../core/attention/index.ts';
import {projectWorldItems,refreshItemPage} from '../core/items/world-items.ts';
import {collectNativeActions} from '../ui/shell/native-actions.ts';
import {collectMatters} from '../ui/attention/index.ts';
// Controlled synthetic-mail evaluation for #1152: fictional threads only, no account or model.
// Owner decision: deadlines, obligations, importance, unread state and inbox/archive placement
// combine. Inbox ranks higher, archived lower, while obligations and deadlines still come first.
const now=Date.parse('2026-09-30T20:00:00Z'),seconds=now/1000,day=86400000;
const registration={version:1 as const,provider:'gmail',reader:'source-reader' as const,intervalMinutes:30,freshnessMinutes:120};
type Thread={id:string;title:string;kind:'task'|'update';priority?:string;dueAt?:string;placement?:'inbox'|'archived';unread?:boolean;finding?:boolean};
const threads:Thread[]=[
 // Listed against the expected order, so input order alone never passes.
 {id:'hold',title:'Library hold ready',kind:'update',placement:'archived'},
 {id:'insurance',title:'Confirm insurance details',kind:'task',placement:'archived'},
 {id:'newsletter',title:'Club newsletter',kind:'update',placement:'inbox',unread:true},
 {id:'quote',title:'Confirm the contractor quote',kind:'task',placement:'inbox'},
 {id:'form',title:'School form due tomorrow',kind:'update',dueAt:new Date(now+day).toISOString(),placement:'archived'},
 {id:'lease',title:'Sign the lease renewal',kind:'task',dueAt:new Date(now+2*day).toISOString(),placement:'archived'},
 {id:'fraud',title:'Card fraud alert',kind:'task',priority:'high',placement:'archived'},
 // Resolved by its own later reply: extraction saves no finding, whatever its placement.
 {id:'refund',title:'Refund processed',kind:'update',placement:'inbox',unread:true,finding:false},
];
const observe=(facts:any[],list:Thread[],at:number)=>observeAttention(facts,registration,list.map(t=>({id:'thread:'+t.id,title:t.title,text:'Synthetic thread '+t.title,
 workflow:{placement:t.placement,unread:t.unread??false}})),at/1000);
let facts=observe([],threads,now);
assert.deepEqual(facts.find(f=>f.sourceId==='thread:quote')?.workflow,{placement:'inbox',unread:false});
const items=threads.filter(t=>t.finding!==false).map(t=>{
 const item:any={id:t.id,provider:'gmail',kind:t.kind,status:'open',title:t.title,reason:t.title,summary:t.title,priority:t.priority||'normal',attentionContentVersion:1,
  ...(t.dueAt?{dueAt:t.dueAt}:{}),sources:[{provider:'gmail',id:'thread:'+t.id,quote:'Synthetic thread '+t.title}]};
 return {...item,attentionDependencies:attentionDependencies(item,facts)};
});
function rows(factsNow:any[]){
 const projected=projectAttention(items,factsNow,seconds,['gmail']);
 const world:any={roots:['root'],pages:[]};projectWorldItems(world,projected);
 for(const p of world.pages)refreshItemPage(p,now);
 const pages=new Map<string,any>(world.pages.map((p:any)=>[p.id,p]));
 const sections=[{entity:'app',id:'mail-place',moduleId:'gmail',title:'Mail',children:world.pages.map((p:any)=>p.id)}];
 const {activities}=collectNativeActions({pages,sections});
 return {projected,cards:collectMatters({sections,pages,activities,current:null,currentSpace:null,depth:'overview',now})};
}
const order=(cards:any[],state:string)=>attentionOrder(cards.filter(c=>c.state===state),{mode:'personal',now:new Date(now),region:()=>undefined,importance:(c:any)=>attentionLevel(c,now)}).map((c:any)=>c.worldItemId);
let {projected,cards}=rows(facts);
assert.equal(projected.find(i=>i.id==='quote')?.mailPlacement,'inbox');
assert.equal(projected.find(i=>i.id==='newsletter')?.mailUnread,true);
assert.ok(!cards.some(c=>c.worldItemId==='refund'),'A resolved thread has no finding, even when kept unread in the inbox');
assert.deepEqual(order(cards,'needsAction'),['fraud','lease','quote','insurance'],'Importance, then a deadline, before inbox placement; archive never hides an obligation');
assert.deepEqual(order(cards,'unseen'),['form','newsletter','hold'],'A deadline before inbox and unread; archived read news is last');
console.log('PASS synthetic mail: importance, deadline, inbox, unread and archived combine; resolved threads stay out.');

// The workflow span never outweighs an obligation or a deadline.
const w=attentionRankWeights,span=w.inbox+w.unread-w.archived;
assert.ok(span<w.obligation&&span<w.deadline);
assert.ok(attentionSignalScore({state:'unseen',placement:'archived',dueAt:now+day},now)>attentionSignalScore({state:'unseen',placement:'inbox',unread:true},now));
assert.ok(attentionSignalScore({state:'unseen',dueAt:now-day},now)>attentionSignalScore({state:'unseen'},now),'An overdue deadline still counts');
assert.equal(attentionSignalScore({state:'unseen',dueAt:now+4*day},now),0,'A distant due date is not a deadline yet');

// Moving a thread back to the inbox and marking it unread reorders it at once without a new
// revision, so its finding stays current and is not re-analysed.
const thread=(id:string)=>threads.find(t=>t.id===id)!;
const before=facts.find(f=>f.sourceId==='thread:insurance')!;
facts=observe(facts,[{...thread('insurance'),placement:'inbox',unread:true}],now+60000);
const after=facts.find(f=>f.sourceId==='thread:insurance')!;
assert.equal(after.revision,before.revision);
({projected,cards}=rows(facts));
assert.equal(projected.find(i=>i.id==='insurance')?.attentionFresh,true);
assert.deepEqual(order(cards,'needsAction'),['fraud','lease','insurance','quote']);
// A source without an observed label set has unknown placement, not archived.
facts=observe(facts,[{...thread('quote'),placement:undefined}],now+120000);
assert.equal(rows(facts).projected.find(i=>i.id==='quote')?.mailPlacement,undefined);
console.log('PASS archive, unarchive and read changes reorder without invalidating findings; unknown placement stays neutral.');

// The focus set admits by the same combined signals: at a quiet moment the floor takes the
// deadline, then inbox mail, before archived mail.
const quiet=[
 {id:'archived-read',placement:'archived' as const},{id:'inbox-unread',placement:'inbox' as const,unread:true},
 {id:'archived-unread',placement:'archived' as const,unread:true},{id:'inbox-read',placement:'inbox' as const},
 {id:'archived-deadline',placement:'archived' as const,dueAt:new Date(now+day).toISOString()},
].map(i=>({...i,level:1,state:'unseen'}));
assert.deepEqual(attentionFocusSet({items:quiet,saved:null,now}).ids.sort(),['archived-deadline','inbox-read','inbox-unread']);
// HUD rows carry the signals on their lead signal.
assert.deepEqual(attentionRankSignals({state:'unseen',signals:[{dueAt:'x',mailPlacement:'inbox',mailUnread:true}]}),{state:'unseen',dueAt:'x',placement:'inbox',unread:true});
console.log('PASS focus admission prefers deadlines, then inbox and unread mail, over archived mail.');
