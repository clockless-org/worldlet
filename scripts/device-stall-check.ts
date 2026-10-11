import assert from 'node:assert/strict';
import {chipFamily,deviceClass,memoryBucket,stallTask} from '../core/diagnostics/index.ts';
import {busyWith,onStall,watchMainStalls,type Stall} from '../platform/electron/src/host/busy.ts';

// Device class: the chip family and a memory band, never the model string or the exact size.
assert.equal(chipFamily('Apple M1'),'apple_m1');
assert.equal(chipFamily('Apple M3 Pro'),'apple_m3_pro');
assert.equal(chipFamily('Apple M9 Max'),'apple_other');
assert.equal(chipFamily('Intel(R) Core(TM) i7-9750H CPU @ 2.60GHz'),'intel');
assert.equal(chipFamily('AMD Ryzen 7 5800X 8-Core Processor'),'amd');
assert.equal(chipFamily('Snapdragon(R) X Elite - X1E78100 - Qualcomm(R) Oryon(TM) CPU'),'snapdragon');
assert.equal(chipFamily(''),'other');
assert.deepEqual([8,16,18,24,36,64,96].map(gb=>memoryBucket(gb*2**30)),['8gb_or_less','16gb','24_32gb','24_32gb','36_64gb','36_64gb','over_64gb']);
assert.equal(memoryBucket(0),'');
assert.deepEqual(deviceClass({cpuModel:'Apple M1',arch:'x64',translated:true,memoryBytes:8*2**30}),{chip:'apple_m1',memory_bucket:'8gb_or_less',cpu_arch:'x64',rosetta:'yes'});
assert.equal(deviceClass({cpuModel:'Apple M2',arch:'ia32',translated:false,memoryBytes:16*2**30}).cpu_arch,'other');
// A stall names code, never data.
assert.equal(stallTask('historySync'),'historySync');
assert.equal(stallTask('/Users/alex/secret'),'unlabelled');
assert.equal(stallTask(undefined),'unlabelled');

// busyWith reports the outermost task that held the process a second or more; the heartbeat then stays quiet.
const stalls:Stall[]=[];onStall(stall=>stalls.push(stall));
const hold=(ms:number)=>{const end=Date.now()+ms;while(Date.now()<end){}};
assert.equal(busyWith('quick',()=>{hold(5);return 7;}),7);
assert.equal(stalls.length,0,'a short task is not a stall');
let focused=true;
const stop=watchMainStalls(()=>focused,50);
await new Promise(resolve=>setTimeout(resolve,120));
busyWith('outer',()=>busyWith('inner',()=>hold(1100)));
await new Promise(resolve=>setTimeout(resolve,150));
assert.deepEqual(stalls.map(s=>s.task),['outer'],'only the outermost task reports, and the heartbeat does not report it again');
assert.ok(stalls[0].ms>=1000);
hold(1100);
await new Promise(resolve=>setTimeout(resolve,150));
assert.deepEqual(stalls.map(s=>s.task),['outer','unlabelled'],'unnamed work is caught by the heartbeat');
focused=false;hold(1100);
await new Promise(resolve=>setTimeout(resolve,150));
assert.equal(stalls.length,2,'a hidden app is not watched (the system may hold its timers back)');
stop();
assert.throws(()=>busyWith('failing',()=>{throw Error('x');}));
console.log('PASS: device class is coarse; main-process stalls are reported by task code name, once each, only while the app is in front');
