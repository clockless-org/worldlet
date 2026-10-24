// The desktop app taking a library over from the headless service (platform/host/service.ts): on a Mac it boots out
// and removes the service's launch agent, on Windows it removes the service's Run value, and a service still answering
// on the library's control socket is asked to stop and waited for. Nothing there: nothing done.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {MAC_SERVICE_LABEL,WINDOWS_SERVICE_RUN_VALUE,takeOverService} from '../platform/host/service.ts';
import {controlSocketPath,serveControl} from '../platform/server/src/control.ts';

const temp=fs.mkdtempSync(path.join(process.platform==='win32'?os.tmpdir():'/tmp','wl-takeover-'));
try{
 const home=path.join(temp,'home'),root=path.join(temp,'lib');fs.mkdirSync(root,{recursive:true});
 const calls:string[]=[],run=(command:string,args:string[])=>{calls.push([command,...args].join(' '));};
 const quiet={home,uid:501,run,wait:async()=>{}};
 assert.deepEqual(await takeOverService(root,{...quiet,platform:'darwin'}),[],'no service: nothing done');
 assert.deepEqual(calls,[]);

 const plist=path.join(home,'Library/LaunchAgents',MAC_SERVICE_LABEL+'.plist');
 fs.mkdirSync(path.dirname(plist),{recursive:true});fs.writeFileSync(plist,'<plist/>');
 assert.deepEqual(await takeOverService(root,{...quiet,platform:'darwin'}),['removed the service\'s launch agent']);
 assert.deepEqual(calls,[`launchctl bootout gui/501 ${plist}`]);
 assert(!fs.existsSync(plist),'the launch agent is gone, so login starts no service');

 calls.length=0;
 assert.deepEqual(await takeOverService(root,{...quiet,platform:'win32'}),['removed the service\'s start at login']);
 assert.deepEqual(calls.map(c=>c.split(' ').slice(0,2).join(' ')),['reg query','reg delete']);
 assert(calls[1].includes(WINDOWS_SERVICE_RUN_VALUE));
 calls.length=0;
 assert.deepEqual(await takeOverService(root,{...quiet,platform:'win32',run:(command,args)=>{calls.push(command+' '+args[0]);if(args[0]==='query')throw Error('not found');}}),[],'no Run value: nothing removed');
 assert.deepEqual(calls,['reg query']);

 // A running service on this library is asked to stop, and the app waits until its socket no longer answers.
 const asked:string[]=[];
 const server=await serveControl(controlSocketPath(root),async request=>{asked.push(request.command);if(request.command==='stop')setTimeout(()=>server.close(),20);return {lines:['Worldlet is stopping.']};});
 assert.deepEqual(await takeOverService(root,{home,platform:'linux',wait:ms=>new Promise(r=>setTimeout(r,Math.min(ms,50)))}),['stopped the running service']);
 assert.deepEqual(asked,['stop']);
}finally{fs.rmSync(temp,{recursive:true,force:true});}
console.log('PASS service takeover: the app removes the headless service\'s login start (launch agent on Mac, Run value on Windows) and stops a running one before it opens the library');
