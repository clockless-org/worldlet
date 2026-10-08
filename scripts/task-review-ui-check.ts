import assert from 'node:assert/strict';
import {taskReviewLine} from '../ui/attention/task-review.ts';
// Changed task evidence waits on that task's Attention card as one line of choices, never over Fox's dialog
// (owner Order 2026-10-07). The choice names the card's own task, so a review with several candidates needs no picker.
const calls:any[]=[];
const choose=async(id:string,choice:string,candidate:string)=>{calls.push([id,choice,candidate]);return {ok:true};};
const reviews=[{id:'r1',provider:'gmail',items:['task-a','task-b']}];
assert.equal(taskReviewLine(reviews,'task-c',choose),null,'another task’s card shows nothing');
assert.equal(taskReviewLine(undefined,'task-a',choose),null);
const line=taskReviewLine(reviews,'task-b',choose)!;
assert.equal(line.text,'Mail has something new about this task.');
assert.deepEqual(line.choices.map(c=>c.label),['Update this task','Add as a new task','Ignore']);
await line.choices[0].run();await line.choices[2].run();
assert.deepEqual(calls,[['r1','same','task-b'],['r1','skip','task-b']],'the host gets the review, the choice and this card’s task');
assert.equal(taskReviewLine([{id:'r2',provider:'other',items:['x']}],'x',choose)!.text,'A source has something new about this task.');
console.log('PASS task review on its Attention card: one line, three choices naming this card’s task, nothing elsewhere');
