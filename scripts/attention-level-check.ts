import assert from 'node:assert/strict';
import {attentionLevel} from '../core/attention/attention-level.ts';
import {attentionIcon} from '../ui/attention/icon.ts';
const now=Date.now();
for(const [i,minutes] of [1500,1440,360,60,15].entries())assert.equal(attentionLevel({state:'event',start:now+minutes*60000},now),i+1);
assert.equal(attentionLevel({state:'event',start:'invalid'},now),1);
for(const state of ['needsAction','unseen'])for(const [i,priority] of ['normal','elevated','important','high','urgent'].entries()){
 assert.equal(attentionLevel({state,priority},now),i+1);
 assert.equal(attentionIcon(state,true,priority),attentionIcon(state,false,'normal'));
}
console.log('PASS Attention five-level boundaries and pure shape markers.');

const {eventWhen,matterCopy}=await import('../ui/attention/matter-copy.ts');
const {upcomingEvents}=await import('../ui/shell/native-actions.ts');
const morning=new Date('2026-09-24T08:43:00');
const event={title:'Planning',start:'2026-09-24T09:30:00',end:'2026-09-24T10:30:00'};
const when=eventWhen(event.start,{end:event.end,now:morning});
assert.equal(when.clock,'9:30 AM–10:30 AM');assert.equal(when.relative,'in 47m');
assert.equal(eventWhen('2026-09-24T11:00:00',{now:new Date('2026-09-24T09:00:00')}).relative,'in 2h');
assert.equal(eventWhen('2026-09-25T08:00:00',{now:new Date('2026-09-24T23:00:00')}).relative,'Tomorrow');
assert.equal(eventWhen(event.start,{end:event.end,now:new Date('2026-09-24T10:00:00')}).relative,'Now');
assert.equal(eventWhen(event.start,{end:'invalid',now:morning}).clock,'9:30 AM');
assert.equal(eventWhen(event.start,{end:event.end,allDay:true,now:morning}).clock,'All day');
assert.match(eventWhen('2026-09-24T23:00:00',{end:'2026-09-25T01:00:00',now:morning}).clock,/Sep 24.*Sep 25/);
const pages=new Map([['event',{id:'event',title:'Planning',events:[event]}]]);
const signals=upcomingEvents({pages,sections:[],now:morning});
assert.equal(signals[0].end,new Date(event.end).getTime());
assert.equal(matterCopy({title:'Calendar'},signals,pages).when.clock,'9:30 AM–10:30 AM');
console.log('PASS event start/end range, minutes/hours/tomorrow, active/all-day and invalid end.');

{
 const {attentionFocusSet,attentionFocusFit,attentionFocusEvidence,attentionReviewStart,attentionRelevant,attentionFocusMax,attentionFocusFloor}=await import('../core/attention/attention-focus.ts');
 const at=(h:number,m=0)=>new Date(2026,8,29,h,m).getTime();
 const item=(id:string,level=1,state='needsAction',relevant=false)=>({id,level,state,relevant});
 const ids=(f:{ids:string[]})=>f.ids.slice().sort();
 // Importance and fit with the moment decide the set; it need not be full.
 const items=[item('work-a',1,'needsAction',true),item('work-b',1,'needsAction',true),item('important',3),item('high',4),
  item('chore-1'),item('chore-2'),item('chore-3'),item('chore-4'),item('fyi',1,'unseen')];
 let focus=attentionFocusSet({items,saved:null,now:at(10)});
 assert.deepEqual(ids(focus),['fyi','high','important','work-a','work-b'],'Worthy items, plus one place for each kind');
 assert.equal(focus.queued,4);
 // Clearing never pulls the held-back backlog in.
 const cleared=items.filter(i=>i.id!=='work-a');
 const after=attentionFocusSet({items:cleared,saved:focus.saved,now:at(10,30)});
 assert.deepEqual(ids(after),['fyi','high','important','work-b'],'No automatic backfill after clearing');
 // A pressing arrival joins at once; a new worthy result takes a free seat.
 assert.ok(attentionFocusSet({items:[...cleared,item('urgent',5)],saved:after.saved,now:at(10,40)}).ids.includes('urgent'));
 assert.ok(attentionFocusSet({items:[...cleared,item('soon',2,'event')],saved:after.saved,now:at(10,40)}).ids.includes('soon'),'An event within a day joins');
 assert.ok(attentionFocusSet({items:[...cleared,item('new-work',1,'needsAction',true)],saved:after.saved,now:at(10,40)}).ids.includes('new-work'));
 assert.ok(!attentionFocusSet({items:[...cleared,item('new-chore')],saved:after.saved,now:at(10,40)}).ids.includes('new-chore'),'Unworthy news waits for Show more');
 // Context changes ranking, but never promotes a held backlog into freed seats.
 const evening=cleared.map(i=>i.id.startsWith('work')?{...i,relevant:false}:i.id.startsWith('chore')?{...i,relevant:true}:i);
 const review=attentionFocusSet({items:evening,saved:after.saved,now:at(19)});
 assert.deepEqual(review.ids,after.ids,'Time and context alone do not refill or reshuffle membership');
 // A commitment in the next few days is worth a seat; a distant one waits.
 assert.ok(attentionFocusSet({items:[item('trip',1,'event'),{...item('flight',1,'event'),soon:true}],saved:null,now:at(10)}).ids.includes('flight'));
 assert.deepEqual(attentionFocusSet({items:[...items,item('trip',1,'event'),{...item('flight',1,'event'),soon:true}],saved:null,now:at(10)}).ids.filter(id=>['trip','flight'].includes(id)),['flight']);
 // A busy calendar does not crowd out the other kinds.
 const busy=[...Array.from({length:9},(_,i)=>item('meeting-'+i,3,'event')),item('reply'),item('news',1,'unseen')];
 const mixed=attentionFocusSet({items:busy,saved:null,now:at(10)});
 assert.ok(mixed.ids.includes('reply')&&mixed.ids.includes('news'),'Every kind keeps a place');
 const calendarOnly=attentionFocusSet({items:busy.filter(i=>i.state==='event'),saved:null,now:at(10)});
 const arrived=attentionFocusSet({items:[...busy.filter(i=>i.state==='event'),item('new-reply'),item('backlog-reply')],saved:{...calendarOnly.saved,held:[...calendarOnly.saved.held,'backlog-reply']},now:at(10,20)});
 assert.ok(arrived.ids.includes('new-reply')&&!arrived.ids.includes('backlog-reply'),'A new result gives an unseated kind its place; backlog still waits');
 // A quiet review still shows a few best items instead of an empty panel.
 const quiet=[item('q1'),item('q2'),item('q3'),item('q4')];
 assert.equal(attentionFocusSet({items:quiet,saved:null,now:at(22)}).ids.length,attentionFocusFloor);
 // After an empty start (onboarding), results appear progressively, even ordinary ones,
 // until the next review sorts them.
 const empty=attentionFocusSet({items:[],saved:null,now:at(9)});
 const first=attentionFocusSet({items:[item('first',2,'event')],saved:empty.saved,now:at(9,1)});
 assert.deepEqual(first.ids,['first']);
 const wave=[item('first',2,'event'),item('mail-1'),item('mail-2'),item('mail-3'),item('mail-4')];
 const warm=attentionFocusSet({items:wave,saved:first.saved,now:at(9,4)});
 assert.equal(warm.ids.length,5,'Warm-up admits arriving results after the first one');
 assert.equal(attentionFocusSet({items:wave,saved:warm.saved,now:at(12,1)}).saved.warm,false,'The next review ends warm-up');
 assert.ok(!attentionFocusSet({items:[...cleared,item('late')],saved:after.saved,now:at(10,41)}).saved.warm,'A Center that started full never warms up');
 // Screen capacity: rows the layout could not show become held, not hidden members.
 const full={...after.saved,ids:cleared.slice(0,attentionFocusMax).map(i=>i.id)};
 const fitted=attentionFocusFit(full,full.ids.slice(0,4),cleared.map(i=>i.id));
 assert.equal(fitted.ids.length,4);
 const next=attentionFocusSet({items:cleared.filter(i=>i.id!==fitted.ids[0]),saved:fitted,now:at(10,50)});
 assert.equal(next.ids.length,3,'A trimmed row does not reappear when another is cleared');
 // A snoozed member keeps its seat and returns without a review.
 const seat=after.ids.find(id=>id==='important')!,away=cleared.filter(i=>i.id!==seat);
 const snoozed=attentionFocusSet({items:away,saved:after.saved,snoozed:[seat],now:at(10,55)});
 assert.ok(!snoozed.ids.includes(seat)&&snoozed.saved.ids.includes(seat));
 assert.ok(attentionFocusSet({items:cleared,saved:snoozed.saved,now:at(11,40)}).ids.includes(seat),'Snoozed item returns on time');
 assert.equal(attentionReviewStart(at(13,30)),at(12));
 assert.equal(attentionReviewStart(at(2)),at(0));
 assert.equal(attentionRelevant('work','auto',new Date(2026,8,29,10)),true,'Work fits a weekday morning');
 assert.equal(attentionRelevant('home','auto',new Date(2026,8,29,20)),true,'Home fits the evening');
 assert.equal(attentionRelevant('work','auto',new Date(2026,8,29,20)),false);
 // Pressing rows trimmed by layout must not return just because a seat opens.
 const pressing=Array.from({length:12},(_,i)=>item('urgent-'+i,4));
 const initial=attentionFocusSet({items:pressing,now:at(10)});
 const fit=attentionFocusFit(initial.saved,initial.ids.slice(0,4),pressing.map(i=>i.id));
 const reduced=pressing.filter(i=>i.id!=='urgent-0');
 let stable=attentionFocusSet({items:reduced,saved:fit,now:at(10,1)});
 assert.deepEqual(stable.ids,['urgent-1','urgent-2','urgent-3']);
 stable=attentionFocusSet({items:reduced,saved:JSON.parse(JSON.stringify(stable.saved)),now:at(19)});
 assert.deepEqual(stable.ids,['urgent-1','urgent-2','urgent-3'],'Restart and review boundary never refill');
 const absent=attentionFocusSet({items:reduced.filter(i=>i.id!=='urgent-4'),saved:stable.saved,now:at(19,1)});
 assert.deepEqual(attentionFocusSet({items:reduced,saved:absent.saved,now:at(19,2)}).ids,stable.ids,'A repeated source refresh is not new evidence');
 const escalated=reduced.map(i=>i.id==='urgent-4'?{...i,level:5}:i);
 assert.ok(attentionFocusSet({items:escalated,saved:stable.saved,now:at(19,2)}).ids.includes('urgent-4'),'A real escalation admits a held item');
 const material=reduced.map(i=>i.id==='urgent-5'?{...i,evidence:'new-source'}:i);
 assert.ok(attentionFocusSet({items:material,saved:stable.saved,now:at(19,2)}).ids.includes('urgent-5'),'New source evidence admits a held item');
 assert.ok(attentionFocusSet({items:[...reduced,item('new-urgent',5)],saved:stable.saved,now:at(19,2)}).ids.includes('new-urgent'),'New urgent events still arrive');
 const future=[item('deadline',1,'event'),item('other',1,'event')];
 const futureFocus=attentionFocusSet({items:future,now:at(10)});
 const futureFit=attentionFocusFit(futureFocus.saved,['other'],future.map(i=>i.id));
 assert.ok(attentionFocusSet({items:future.map(i=>i.id==='deadline'?{...i,level:2}:i),saved:futureFit,now:at(11)}).ids.includes('deadline'),'A real deadline crossing admits a held event');
 const napping=attentionFocusSet({items:away,saved:snoozed.saved,snoozed:[seat],now:at(19)});
 assert.ok(!napping.ids.includes(seat)&&napping.saved.ids.includes(seat),'Snooze survives an old review boundary');
 assert.ok(attentionFocusSet({items:cleared,saved:JSON.parse(JSON.stringify(napping.saved)),now:at(20)}).ids.includes(seat),'Later returns after expiry across restart');
 const evidence=[{provider:'gmail',id:'synthetic',quote:'Pay by Friday'}];
 assert.equal(attentionFocusEvidence(evidence),attentionFocusEvidence([{...evidence[0],quote:'  PAY  by Friday '}]),'Routine formatting is not material evidence');
 assert.notEqual(attentionFocusEvidence(evidence),attentionFocusEvidence([{...evidence[0],quote:'Pay by Thursday'}]),'Substantive evidence changes within the same source count');
 const legacy={ids:fit.ids,held:fit.held,reviewedAt:at(7)};
 assert.deepEqual(attentionFocusSet({items:reduced,saved:legacy,now:at(19)}).ids,stable.ids,'Legacy stored focus does not refill during migration');
 console.log('PASS Attention focus set: worthy-now selection, no backfill, pressing/new arrivals, persistent admission, initial floor, screen capacity, snooze seats');
}
