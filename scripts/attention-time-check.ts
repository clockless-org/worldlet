import assert from 'node:assert/strict';
import {attentionLaterUntil,validAttentionTime} from '../core/attention/index.ts';
import {attentionTimeRows,attentionGroupWhen} from '../ui/attention/time.ts';
import {prepareWorldItem,updateWorldItem} from '../core/items/world-item-state.ts';
import {projectWorldItems,refreshItemPage} from '../core/items/world-items.ts';
const zone='America/Los_Angeles';
for(const [from,to,hours] of [
 ['2026-03-07T12:00:00-08:00','2026-03-08T19:00:00.000Z',23],
 ['2026-10-31T12:00:00-07:00','2026-11-01T20:00:00.000Z',25],
 ['2026-03-07T02:30:00-08:00','2026-03-08T10:30:00.000Z',24],
 ['2026-10-31T01:30:00-07:00','2026-11-01T08:30:00.000Z',24],
] as const){
 const until=attentionLaterUntil(Date.parse(from),zone);assert.equal(until,to);assert.equal((Date.parse(until)-Date.parse(from))/3600000,hours);
}
assert.equal(attentionLaterUntil(Date.parse('2026-03-07T20:00:00.123Z'),zone),'2026-03-08T19:00:00.123Z');
assert.equal(attentionLaterUntil(Date.parse('2026-09-30T20:00:00Z'),'Asia/Kolkata'),'2026-10-01T20:00:00.000Z');
assert.throws(()=>attentionLaterUntil(Date.now(),''));assert.throws(()=>attentionLaterUntil(Date.now(),'invalid'));
for(const value of ['2026-02-30','2026-09-30T08:00:00','bad',null])assert.equal(validAttentionTime(value),false);
assert.equal(validAttentionTime('2026-09-30T08:00Z'),true);
const context={now:new Date('2026-09-30T20:00:00Z'),locale:'en-US',timeZone:zone};
assert.deepEqual(attentionTimeRows({createdAt:'2026-09-30T19:00:00Z',updatedAt:'2026-09-30T19:30:00Z'},context),[]);
const signal={occurredAt:'2026-09-29T18:00:00Z',observedAt:'2026-09-30T18:00:00Z',sourceUpdatedAt:'2026-09-30T19:00:00Z',dueAt:'2026-10-01T18:00:00Z'};
const rows=attentionTimeRows(signal,context);
assert.deepEqual(rows.map(r=>r.key),['dueAt','occurredAt','observedAt','sourceUpdatedAt']);
assert.ok(rows[0].deadline);assert.match(rows[0].label,/11:00:00 AM GMT-07:00.*America\/Los_Angeles/);
assert.match(rows[2].label,/not when the event occurred/);
assert.match(attentionTimeRows({observedAt:signal.observedAt},context)[0].relative,/First observed/);
assert.notEqual(attentionTimeRows(signal,{...context,timeZone:'Asia/Tokyo'})[0].absolute,rows[0].absolute);
assert.notEqual(attentionTimeRows(signal,{...context,locale:'de-DE'})[0].absolute,rows[0].absolute);
for(const timeZone of [zone,'Pacific/Kiritimati'])assert.match(attentionTimeRows({dueAt:'2026-10-01'},{...context,timeZone})[0].absolute,/Oct 1, 2026.*All day/);
assert.deepEqual(attentionTimeRows({start:1e100},context),[]);
assert.equal(attentionTimeRows({start:'2026-09-30T18:00:00Z',end:NaN},context).length,1);
const range=attentionTimeRows({start:'2026-09-30T18:00:00Z',end:'2026-09-30T21:00:00Z'},context)[0];
assert.match(range.label,/11:00:00 AM.*2:00:00 PM/);assert.equal(range.relative,'Starts · Now');
const group=attentionGroupWhen([signal,{occurredAt:'2026-09-28T20:00:00Z'},{}],context);
assert.equal(group.relative,'Multiple source times');assert.match(group.label,/Member 3: Time unknown/);assert.match(group.label,/Occurred/);
// Existing grouping is deliberately untouched. Preserve each represented member's own facts.
const now='2026-03-07T20:00:00Z',until=attentionLaterUntil(Date.parse(now),zone);
const item=prepareWorldItem({kind:'task',sources:[{provider:'gmail',id:'synthetic'}],...signal},undefined,'fixture','identity','run',now);
assert.equal(item.observedAt,now);
const saved=JSON.parse(JSON.stringify(updateWorldItem(item,'open',now,until)));
const resumed=prepareWorldItem({...item,observedAt:'forged'},saved,'fixture','identity','refresh','2026-03-08T18:59:00Z');
assert.equal(resumed.observedAt,now);assert.equal(resumed.snoozedUntil,until);
const world={roots:['root'],pages:[]};projectWorldItems(world,[{...resumed,attentionContentVersion:1}]);
assert.equal(world.pages[0].worldItemSignal.sourceUpdatedAt,signal.sourceUpdatedAt);
refreshItemPage(world.pages[0],Date.parse(until)-1);assert.equal(world.pages[0].activities.length,0);
refreshItemPage(world.pages[0],Date.parse(until));assert.equal(world.pages[0].activities.length,1);
assert.equal(prepareWorldItem({}, {createdAt:now},'old','identity','refresh',now).observedAt,undefined,'Legacy first observation stays unknown');
console.log('PASS Attention evidence times, local/locale/all-day/range rendering, conservative group metadata, DST 23/25h/gap/fold Later, durable observation and snooze');
