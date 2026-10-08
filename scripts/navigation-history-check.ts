import assert from 'node:assert/strict';
import {createLocationWriter} from '../ui/shell/navigation-history.ts';
// The writer's throttle reads Date.now; a fixed clock keeps a slow, loaded host from
// widening the gap between writes past the interval and flushing the stale write early.
let clock=0;Date.now=()=>clock;
const callbacks:Record<string,()=>void>={},writes=[];
const target:any={location:{href:'https://world.test/'},history:{state:{preserved:true},replaceState(state,_title,url){assert.deepEqual(state,{preserved:true});writes.push(url);target.location.href=url;}},addEventListener(type,fn){callbacks[type]=fn;}};
const write=createLocationWriter(target,25);
for(let i=0;i<1000;i++)write(new URL('https://world.test/#object=app-gmail'));
assert.equal(writes.length,1,'identical scene refreshes write only once');
for(let i=0;i<1000;i++)write(new URL('https://world.test/#note='+i));
assert.equal(writes.length,1,'rapid changes are coalesced');
await new Promise(r=>setTimeout(r,40));
assert.equal(writes.length,2);assert.match(writes[1],/note=999$/);
write(new URL('https://world.test/#stale'));target.location.href='https://world.test/#external';callbacks.hashchange();
await new Promise(r=>setTimeout(r,40));assert.equal(writes.length,2,'external navigation cancels stale writes');
clock+=1000;target.history.replaceState=()=>{throw new DOMException('Rate limited','SecurityError');};
assert.doesNotThrow(()=>write(new URL('https://world.test/#new')),'a throttled write that flushes at once does not throw');
console.log('PASS unchanged URLs, rapid coalescing, latest destination, external navigation and WebKit throttle recovery');
