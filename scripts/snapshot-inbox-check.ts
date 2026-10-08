import assert from 'node:assert/strict';
import {snapshotInbox} from '../ui/shell/snapshot-inbox.ts';

const turns:(()=>void)[]=[],seen:number[]=[];
let finish:()=>void;
const inbox=snapshotInbox<number>(async value=>{seen.push(value);if(value===99)await new Promise<void>(resolve=>finish=resolve);if(value===102)throw Error('fixture failure');},run=>turns.push(run));
const burst=Array.from({length:100},(_,i)=>inbox(i));
assert.equal(turns.length,1);assert.deepEqual(seen,[],'background work must yield');
turns.shift()();assert.deepEqual(seen,[99],'only latest full snapshot is processed');
const a=inbox(100),b=inbox(101);assert.equal(turns.length,0,'no overlapping consumer');
finish();await new Promise(resolve=>setTimeout(resolve,0));assert.equal(turns.length,1);
turns.shift()();await Promise.all([...burst,a,b]);assert.deepEqual(seen,[99,101]);
const failure=assert.rejects(inbox(102),/fixture failure/);turns.shift()();await failure;
const recovered=inbox(103);turns.shift()();await recovered;assert.deepEqual(seen,[99,101,102,103]);
console.log('PASS 100 snapshots -> one commit, deferred work, serialized async consumption, newest state, error recovery');
{
 const queued:(()=>void)[]=[],committed:number[]=[];let resume:()=>void;
 const queue=snapshotInbox<number>(async(value,current)=>{if(value===1)await new Promise<void>(resolve=>resume=resolve);if(current())committed.push(value);},run=>queued.push(run));
 const stale=queue(1);queued.shift()();const latest=queue(2);resume();await new Promise(resolve=>setTimeout(resolve,0));
 assert.deepEqual(committed,[]);queued.shift()();await Promise.all([stale,latest]);assert.deepEqual(committed,[2]);
 console.log('PASS superseded in-flight computation never commits stale UI');
}
{
 const queued:(()=>void)[]=[];let fail:(error:Error)=>void;
 const queue=snapshotInbox<number>(async value=>{if(value===1)await new Promise<void>((_,reject)=>fail=reject);},run=>queued.push(run));
 const stale=queue(1);queued.shift()();const latest=queue(2);fail(Error('superseded failure'));
 await new Promise(resolve=>setTimeout(resolve,0));queued.shift()();await Promise.all([stale,latest]);
 console.log('PASS superseded failure waits for the successful replacement');
}
