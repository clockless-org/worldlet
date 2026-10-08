// What the website panel manages its pages by (platform/electron/src/modules/browser/memory.ts; owner Order
// 2026-10-07: "要把内存管理好"): macOS memory it can hand out (not only free pages), the kernel's pressure level,
// and the website engine's whole process tree in the app's footprint. Runs the real parsers with a stubbed
// `electron`; nothing is launched.
import assert from 'node:assert/strict';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {build,type Plugin} from 'esbuild';
import {withTempDir} from './test-temp.ts';

const stub:Plugin={name:'electron-stub',setup(b){
 b.onResolve({filter:/^electron$/},()=>({path:'electron',namespace:'electron-stub'}));
 b.onLoad({filter:/.*/,namespace:'electron-stub'},()=>({contents:'export const app={getAppMetrics:()=>[{memory:{workingSetSize:512*1024}}]};',loader:'js'}));
}};

await withTempDir('worldlet-web-memory-',async temp=>{
 const out=path.join(temp,'memory.mjs');
 await build({entryPoints:['platform/electron/src/modules/browser/memory.ts'],bundle:true,format:'esm',platform:'node',outfile:out,logLevel:'error',plugins:[stub]});
 const {processTreeKB,vmStatAvailableMB,pressureLevel,readMemory}=await import(pathToFileURL(out).href);

 const ps=` 1 0 100
 500 1 2000
 600 500 300000
 601 500 200000
 700 600 50000
 800 1 999999
`;
 assert.equal(processTreeKB(ps,500),2000+300000+200000+50000,'the engine and every helper below it');
 assert.equal(processTreeKB(ps,999),0,'an engine that is gone counts nothing');
 assert.equal(processTreeKB(' 1 1 10\n',1),10,'a loop is counted once');

 const vm=`Mach Virtual Memory Statistics: (page size of 16384 bytes)
Pages free:                                3000.
Pages active:                            400000.
Pages inactive:                          200000.
Pages speculative:                         5000.
Pages throttled:                              0.
Pages wired down:                        150000.
Pages purgeable:                          12000.
`;
 assert.equal(Math.round(vmStatAvailableMB(vm)),Math.round((3000+200000+5000+12000)*16384/1_048_576),'free, inactive, speculative and purgeable');
 assert.ok(vmStatAvailableMB(vm)>3000,'gigabytes macOS hands out at once, where free pages alone read 47 MB');
 assert.ok(Number.isNaN(vmStatAvailableMB('')),'unreadable stays unknown');

 assert.equal(pressureLevel('1\n'),'normal');
 assert.equal(pressureLevel('2\n'),'warn');
 assert.equal(pressureLevel('4\n'),'critical');
 assert.equal(pressureLevel(''),undefined);

 (process as unknown as {getSystemMemoryInfo:()=>object}).getSystemMemoryInfo=()=>({total:16*1024*1024,free:48*1024});
 const reading=readMemory();
 assert.ok(reading&&reading.appMB===512&&reading.freeMB===48&&reading.totalMB===16*1024,'a reading answers at once, before any probe');
 console.log('PASS the website panel reads available memory, pressure and the engine\'s processes');
});
