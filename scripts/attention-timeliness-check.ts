import assert from 'node:assert/strict';
import {observeAttention,projectAttention,attentionDependencies,attentionOrder,attentionFocusSet,attentionLevel,attentionRankSignals,attentionRankWeights,attentionSignalScore,attentionTimelyLevel,attentionOver,attentionReceivedAt} from '../core/attention/index.ts';
import {projectWorldItems,refreshItemPage} from '../core/items/world-items.ts';
import {prepareWorldItem} from '../core/items/world-item-state.ts';
import {collectNativeActions} from '../ui/shell/native-actions.ts';
import {collectMatters} from '../ui/attention/index.ts';
import {attentionTimeRows,attentionTimeline} from '../ui/attention/time.ts';
// Timeliness in the Attention Center (owner decision 2026-10-04): every item says when its mail
// arrived and, when it has one, how far away its due date is; fresh and soon-due items rank
// higher, stale and finished ones lower. Fictional mail only, no account or model.
const now=Date.parse('2026-10-04T20:00:00Z'),seconds=now/1000,hour=3600000,day=24*hour;
const iso=(ms:number)=>new Date(ms).toISOString();
const context={now:new Date(now),locale:'en-US',timeZone:'America/Los_Angeles'};

// Labels: received, due and overdue in words, together on one line.
const received=attentionTimeRows({receivedAt:iso(now-3*day)},context);
assert.equal(received[0].key,'receivedAt');assert.equal(received[0].factor,'Received 3 days ago');assert.match(received[0].label,/^Received: /);
assert.equal(attentionTimeRows({receivedAt:iso(now-20000)},context)[0].factor,'Received just now');
assert.equal(attentionTimeRows({dueAt:iso(now-day-hour)},context)[0].factor,'Overdue by 1 day');
assert.equal(attentionTimeRows({dueAt:iso(now-3*hour)},context)[0].factor,'Overdue by 3 hr');
assert.equal(attentionTimeRows({dueAt:'2026-10-02'},context)[0].factor,'Overdue by 2 days','An all-day due date counts calendar days');
assert.ok(attentionTimeRows({dueAt:iso(now-day)},context)[0].overdue);
assert.match(attentionTimeRows({dueAt:iso(now+2*day)},context)[0].factor,/^Due in 2 days · 1:00 PM$/);
const both=attentionTimeline({dueAt:iso(now+day),receivedAt:iso(now-3*day),observedAt:iso(now-hour)},context)!;
assert.equal(both.factor,'Due tomorrow · 1:00 PM · Received 3 days ago');
assert.equal(both.received,'Received 3 days ago');assert.match(both.label,/Due: .*\nReceived: .*\nFirst observed: /);
assert.equal(attentionTimeline({receivedAt:iso(now-2*day),observedAt:iso(now-hour)},context)!.factor,'Received 2 days ago','Receipt leads over the first local observation');
assert.equal(attentionTimeline({start:iso(now+2*hour),receivedAt:iso(now-day)},context)!.factor,'Starts in 2 hr. · 3:00 PM · Received yesterday');
assert.equal(attentionTimeline({},context),null);
console.log('PASS time labels: received N days ago, due in N days, overdue by N, one line with the lead time first.');

// Receipt comes from the reader's facts, outside revision content; the model cannot author it.
assert.equal(attentionReceivedAt(now-day,seconds),iso(now-day));
assert.equal(attentionReceivedAt(iso(now-day),seconds),iso(now-day));
for(const value of [0,'2026-10-01',now+day,'soon',NaN,null])assert.equal(attentionReceivedAt(value,seconds),undefined);
const registration={version:1 as const,provider:'gmail',reader:'source-reader' as const,intervalMinutes:30,freshnessMinutes:120};
type Thread={id:string;title:string;kind:'task'|'update';priority?:string;dueAt?:string;start?:string;end?:string;received:number};
const threads:Thread[]=[
 // Listed against the expected order, so input order alone never passes.
 {id:'newsletter',title:'Old club newsletter',kind:'update',priority:'important',received:now-40*day},
 {id:'webinar',title:'Webinar recording ready',kind:'update',start:iso(now-3*day),end:iso(now-3*day+hour),received:now-5*day},
 {id:'digest',title:'Weekly digest',kind:'update',received:now-20*day},
 {id:'note',title:'Note from the school',kind:'update',received:now-5*hour},
 {id:'lapsed',title:'Renew the old permit',kind:'task',dueAt:iso(now-30*day),received:now-45*day},
 {id:'chore',title:'Reply about the shelf',kind:'task',received:now-6*day},
 {id:'fresh',title:'Answer the landlord',kind:'task',received:now-3*hour},
 {id:'due',title:'Pay the water bill',kind:'task',dueAt:iso(now+20*hour),received:now-10*day},
 {id:'late',title:'Return the library form',kind:'task',dueAt:iso(now-day),received:now-8*day},
];
const observe=(facts:any[],list:Thread[],at:number)=>observeAttention(facts,registration,list.map(t=>({id:'thread:'+t.id,title:t.title,text:'Synthetic thread '+t.title,receivedAt:t.received,workflow:{placement:'inbox' as const,unread:false}})),at/1000);
let facts=observe([],threads,now);
assert.equal(facts.find(f=>f.sourceId==='thread:note')?.receivedAt,iso(now-5*hour));
const before=facts.find(f=>f.sourceId==='thread:chore')!;
facts=observe(facts,[{...threads.find(t=>t.id==='chore')!,received:now-2*hour}],now+60000);
const after=facts.find(f=>f.sourceId==='thread:chore')!;
assert.equal(after.revision,before.revision,'A new receipt time alone never invalidates a finding');assert.equal(after.receivedAt,iso(now-2*hour));
facts=observe(facts,[{...threads.find(t=>t.id==='chore')!}],now+120000);
const items=threads.map(t=>{
 const item:any=prepareWorldItem({id:t.id,provider:'gmail',kind:t.kind,title:t.title,reason:t.title,summary:t.title,priority:t.priority||'normal',
  ...(t.dueAt?{dueAt:t.dueAt}:{}),...(t.start?{start:t.start,end:t.end}:{}),receivedAt:'2020-01-01T00:00:00Z',sources:[{provider:'gmail',id:'thread:'+t.id,quote:'Synthetic thread '+t.title}]},undefined,t.id,t.id,'run',iso(now));
 assert.equal(item.receivedAt,undefined,'The model never authors receipt time');
 return {...item,attentionContentVersion:1,attentionDependencies:attentionDependencies(item,facts)};
});
const projected=projectAttention(items,facts,seconds,['gmail']);
assert.equal(projected.find(i=>i.id==='note')?.receivedAt,iso(now-5*hour));
const world:any={roots:['root'],pages:[]};projectWorldItems(world,projected);
for(const p of world.pages)refreshItemPage(p,now);
const pages=new Map<string,any>(world.pages.map((p:any)=>[p.id,p]));
const sections=[{entity:'app',id:'mail-place',moduleId:'gmail',title:'Mail',children:world.pages.map((p:any)=>p.id)}];
const {activities}=collectNativeActions({pages,sections});
const cards=collectMatters({sections,pages,activities,current:null,currentSpace:null,depth:'overview',now});
const card=(id:string)=>cards.find((c:any)=>c.worldItemId===id);
assert.match(card('note').when.factor,/^Received 5 hr\. ago$/);
assert.match(card('due').when.factor,/^Due in 20 hr\. · \d{1,2}:\d{2} [AP]M · Received 10 days ago$/);
assert.match(card('late').when.factor,/^Overdue by 1 day · Received 8 days ago$/);
assert.ok(card('webinar').signals[0].start,'A row carries its own times for ranking');
console.log('PASS mail receipt flows from the reader through facts, items and rows to the card line; never from the model.');

// Ordering: due soon and just overdue rank with important work; fresh above older; stale, lapsed and finished lower.
const order=(state:string)=>attentionOrder(cards.filter((c:any)=>c.state===state),{mode:'personal',now:new Date(now),region:()=>undefined,importance:(c:any)=>attentionLevel(c,now)}).map((c:any)=>c.worldItemId);
assert.deepEqual(order('needsAction'),['due','late','fresh','chore','lapsed']);
assert.deepEqual(order('unseen'),['note','newsletter','digest','webinar'],'Important but 40 days old falls to normal; a finished webinar goes last');
assert.equal(attentionTimelyLevel({},2,now),2,'Unknown times change nothing');
assert.equal(attentionTimelyLevel({receivedAt:iso(now-40*day),dueAt:iso(now+5*day)},2,now),2,'An upcoming due date keeps old mail relevant');
assert.equal(attentionTimelyLevel({receivedAt:iso(now-40*day)},5,now),3);
assert.equal(attentionTimelyLevel({dueAt:iso(now+2*hour)},5,now),5,'Time raises to important, never lowers an urgent deadline');
assert.equal(attentionTimelyLevel({dueAt:iso(now-5*day)},1,now),1,'Overdue for days: no longer urgent, not yet lapsed');
// Events: one that is over is level 1 and last; an ongoing one stays urgent.
assert.equal(attentionLevel({state:'event',start:now-2*hour,end:now-hour},now),1);
assert.equal(attentionLevel({state:'event',start:now-hour,end:now+hour},now),5);
assert.equal(attentionLevel({state:'event',start:now-2*hour},now),1,'Without an end, an hour after its start');
assert.equal(attentionOver({start:'2026-10-04',allDay:true},now),false,'An all-day event lasts its local day');
const events=[{id:'over',state:'event',start:now-3*hour,end:now-2*hour},{id:'later',state:'event',start:now+5*hour},{id:'soon',state:'event',start:now+hour}];
assert.deepEqual(attentionOrder(events,{mode:'personal',now:new Date(now),region:()=>undefined,importance:(e:any)=>attentionLevel(e,now)}).map(e=>e.id),['soon','later','over']);
// Freshness reorders only comparable items: its span with the mail workflow stays below an obligation or deadline.
const w=attentionRankWeights;assert.ok(w.inbox+w.unread+w.fresh-w.archived<Math.min(w.obligation,w.deadline));
assert.ok(attentionSignalScore({state:'unseen',receivedAt:iso(now-hour)},now)>attentionSignalScore({state:'unseen',receivedAt:iso(now-5*day)},now));
assert.equal(attentionSignalScore({state:'unseen',dueAt:iso(now-20*day)},now),0,'A deadline long past is no longer a deadline');
assert.deepEqual(attentionRankSignals({state:'unseen',signals:[{receivedAt:'r',start:1,end:2,allDay:false}]}),{state:'unseen',dueAt:undefined,placement:undefined,unread:undefined,receivedAt:'r',start:1,end:2,allDay:false});
console.log('PASS ranking: due soon and just overdue first, fresh before older, stale, lapsed and finished matters last.');

// Focus admission weighs the same timeliness: a month-old important newsletter no longer takes a seat on its own.
const focus=attentionFocusSet({now,saved:null,items:[
 {id:'old-important',level:3,state:'unseen',receivedAt:iso(now-40*day)},
 {id:'due-today',level:1,state:'needsAction',dueAt:iso(now+5*hour)},
 {id:'fresh-a',level:1,state:'unseen',receivedAt:iso(now-hour)},
 {id:'fresh-b',level:1,state:'unseen',receivedAt:iso(now-2*hour)},
 {id:'stale-chore',level:1,state:'needsAction',receivedAt:iso(now-20*day)},
 {id:'over',level:2,state:'event',start:now-3*hour,end:now-2*hour},
]});
assert.ok(focus.ids.includes('due-today'),'Due within a day is worth a seat');
assert.ok(!focus.ids.includes('old-important'),'Stale importance alone does not take a seat');
assert.ok(!focus.ids.includes('over'),'A finished event never takes a seat');
assert.ok(focus.ids.includes('fresh-a')&&focus.ids.includes('fresh-b'),'Fresh news fills the quiet floor first');
console.log('PASS focus admission: due today in, stale importance and finished events out, fresh news fills the floor.');
