// Regression: a fragmented large Codex RPC line must arrive whole without blocking the Electron
// host's event loop (platform/electron/src/modules/media/coding.ts over platform/local-tools).
// Uses a fake `codex`, no account or network. Windows runs only executables, so there the fake is a
// venv launcher named codex.exe that runs the same Python as the `app-server` script in the check's cwd.
import {writeFile,chmod,mkdir,copyFile} from 'node:fs/promises';
import {execFileSync,spawnSync} from 'node:child_process';
import path from 'node:path';
import {build} from 'esbuild';
import {withTempDir} from './test-temp.ts';
const windows=process.platform==='win32';
// Local tools need an absolute Python; on Windows, the installation behind `python3` (the gate's shim). The fake profile
// still names its folders: Windows places the tools Python under the profile's root (media/local-tools.ts).
const python=process.env.WORLDLET_TOOLS_PYTHON||(windows?execFileSync('python3',['-c','import os,sys;print(os.path.join(sys.base_prefix,"python.exe"))'],{encoding:'utf8'}).trim():'/usr/bin/python3');
await withTempDir('worldlet-codex-stream-',async dir=>{
 const codex=windows?path.join(dir,'fake','Scripts','codex.exe'):path.join(dir,'codex');
 await writeFile(path.join(dir,windows?'app-server':'codex'),`#!/usr/bin/python3
import sys,json,os
for line in sys.stdin:
 r=json.loads(line); m=r.get('method'); i=r.get('id')
 if i is None: continue
 if m=='initialize': v={}
 elif m=='thread/read': v={'thread':{'id':'11111111-1111-4111-8111-111111111111'}}
 else:
  assert r['params']['itemsView']=='summary', 'History must use the bounded display view'
  v={'data':[{'id':'turn','items':[{'type':'agentMessage','text':'x'*4000000}]}]}
 payload=(json.dumps({'id':i,'result':v})+'\\n').encode()
 for start in range(0,len(payload),4096): os.write(1,payload[start:start+4096])
`);
 if(windows){execFileSync(python,['-m','venv','--without-pip',path.join(dir,'fake')]);await copyFile(path.join(dir,'fake','Scripts','python.exe'),codex);}
 else await chmod(codex,0o755);
 await mkdir(path.join(dir,'local-tools'));
 for(const name of ['codex_sessions.py','sessions.py','json_rpc_process.py','async_stdio.py'])await copyFile(path.join('platform/local-tools',name),path.join(dir,'local-tools',name));
 await writeFile(path.join(dir,'main.ts'),`import {CodexSessions} from ${JSON.stringify(path.resolve('platform/electron/src/modules/media/coding.ts'))};
const host:any={profile:{root:${JSON.stringify(dir)},webRoot:${JSON.stringify(dir)}},optional:()=>undefined};
const connection=new CodexSessions(host);let ticks=0,longestGap=0,previous=performance.now();
const heartbeat=setInterval(()=>{const now=performance.now();longestGap=Math.max(longestGap,now-previous);previous=now;ticks+=1;},10);
// The first read also starts Python and the fake Codex, which a loaded host slows by seconds
// (RC cef6b1e9: 3.8 s with a 0.07 s gap). The heartbeat covers both reads; the time bound, the second.
const read=()=>connection.execute('read',{threadId:'11111111-1111-4111-8111-111111111111'},${JSON.stringify(codex)});
let start=performance.now();await read();const startup=(performance.now()-start)/1000;
start=performance.now();
const result=await read();
const elapsed=(performance.now()-start)/1000;longestGap=Math.max(longestGap,performance.now()-previous)/1000;
clearInterval(heartbeat);connection.close();
const text=result.turns?.[0]?.items?.[0]?.text;
if(typeof text!=='string'||text.length!==4000000)throw Error('Lost conversation bytes');
if(!(elapsed<2&&longestGap<0.5))throw Error('Conversation blocked the host: '+elapsed+' s, longest event-loop gap '+longestGap+' s');
console.log('PASS fragmented 4 MB Codex conversation; seconds:',elapsed.toFixed(3),'host max gap:',longestGap.toFixed(3),'ticks:',ticks,'first read with startup:',startup.toFixed(3));
`);
 await build({entryPoints:[path.join(dir,'main.ts')],outfile:path.join(dir,'check.mjs'),bundle:true,platform:'node',format:'esm',target:'node22',logLevel:'error',
  // Plain Node runs the module; the Electron APIs it imports are not reached on this path.
  plugins:[{name:'electron-stub',setup(stub){stub.onResolve({filter:/^electron$/},()=>({path:'electron',namespace:'electron-stub'}));stub.onLoad({filter:/.*/,namespace:'electron-stub'},()=>({contents:'export const shell={},app={};',loader:'js'}));}}]});
 const r=spawnSync(process.execPath,[path.join(dir,'check.mjs')],{cwd:dir,encoding:'utf8',timeout:30000,env:{...process.env,WORLDLET_TOOLS_PYTHON:python}});
 if(r.stdout)console.log(r.stdout.trim());
 if(r.status!==0)throw Error(r.error?.message||r.stderr.slice(-2000)||'Stream regression failed');
});
