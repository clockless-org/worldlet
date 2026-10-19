// The machine's own zone must not decide what the viewer's zone shows: pin it away from the zones under test.
process.env.TZ='UTC';
import assert from 'node:assert/strict';
import {attentionTimeRows} from '../agent/attention/index.ts';
// An all-day date's heading names its year only when that year is not the viewer's current year, counted in the
// viewer's zone (not the machine's) near New Year.
const heading=(value:string,now:string,timeZone:string)=>attentionTimeRows({dueAt:value},{now:new Date(now),locale:'en-US',timeZone})[0].date;
// Already Jan 1, 2027 in Kiritimati while it is still 2026 in UTC.
assert.equal(heading('2027-01-05','2026-12-31T12:00:00Z','Pacific/Kiritimati'),'Due · Jan 5');
assert.equal(heading('2026-12-30','2026-12-31T12:00:00Z','Pacific/Kiritimati'),'Due · Dec 30, 2026');
// Still Dec 31, 2026 in Los Angeles while it is already 2027 in UTC.
assert.equal(heading('2026-12-30','2027-01-01T03:00:00Z','America/Los_Angeles'),'Due · Dec 30');
assert.equal(heading('2027-01-02','2027-01-01T03:00:00Z','America/Los_Angeles'),'Due · Jan 2, 2027');
// An all-day calendar start reads the same way.
assert.equal(attentionTimeRows({start:'2027-01-02T00:00:00Z',allDay:true},{now:new Date('2027-01-01T03:00:00Z'),locale:'en-US',timeZone:'America/Los_Angeles'})[0].date,'Starts · Jan 2, 2027');
console.log('attention and artifacts fixes check passed');
