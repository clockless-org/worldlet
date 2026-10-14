// Software graphics after a crashing GPU process, and exit codes as fixed names (core/diagnostics/graphics-mode.ts).
import assert from 'node:assert/strict';
import {afterGpuCrash,exitCodeName,graphicsMode,EXIT_CODE_NAMES,GPU_CRASH_WINDOW_MS,SOFTWARE_GRAPHICS_MS} from '../core/diagnostics/index.ts';

const now=Date.parse('2026-10-14T17:00:00Z');
assert.equal(graphicsMode(null,now),'hardware','no state: hardware');
assert.equal(graphicsMode({mode:'software',since:now-1000},now),'software');
assert.equal(graphicsMode({mode:'software',since:now-SOFTWARE_GRAPHICS_MS},now),'hardware','a week later the hardware is tried again');
assert.equal(graphicsMode({mode:'software',since:now+60_000},now),'hardware','a time in the future is not trusted');
assert.equal(graphicsMode({mode:'software'} as any,now),'hardware');

const first=afterGpuCrash(null,now,'hardware');
assert.deepEqual(first,{state:{crashes:[now]},fallback:false},'one crash only counts');
const second=afterGpuCrash(first.state,now+20_000,'hardware');
assert.deepEqual(second,{state:{mode:'software',since:now+20_000,crashes:[]},fallback:true},'the second within five minutes, across a restart, falls back');
assert.equal(graphicsMode(second.state,now+30_000),'software');
assert.equal(afterGpuCrash({crashes:[now-GPU_CRASH_WINDOW_MS]},now,'hardware').fallback,false,'an old crash has expired');
const soft=afterGpuCrash(second.state,now+40_000,'software');
assert.deepEqual(soft,{state:{mode:'software',since:now+20_000,crashes:[now+40_000]},fallback:false},'software graphics only counts, and keeps its period');
assert.equal(afterGpuCrash({crashes:['x',null,now] as any},now+1000,'hardware').fallback,true,'malformed entries are dropped');

assert.equal(exitCodeName(-1073741819),'access_violation','0xC0000005 as Electron reports it');
assert.equal(exitCodeName(0xc0000409),'stack_buffer_overrun');
assert.equal(exitCodeName(-2147483645),'breakpoint');
assert.equal(exitCodeName(1),'exit_1');
assert.equal(exitCodeName(12345),'other','any other number is never sent as is');
assert.equal(exitCodeName(0),'');assert.equal(exitCodeName(undefined),'');
for(const name of ['access_violation','exit_9','other'])assert.ok(EXIT_CODE_NAMES.includes(name));
console.log('PASS graphics mode: the second GPU crash within five minutes switches to software graphics for a week; exit codes are fixed names');
