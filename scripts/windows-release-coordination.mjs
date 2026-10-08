// Host-attested rendezvous only. This neither grants native access nor starts a CU worker.
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
export const bindingLimitMs=300000;
const alive=pid=>{try{process.kill(pid,0);return true;}catch{return false;}};
export function validateBinding(expected,binding,now=Date.now(),isAlive=alive){
 if(!binding)throw Error('Windows CU binding absent; host must bind an authorized active worker.');
 for(const key of ['run','issue','source','invocation','directory','role'])
  if(binding[key]!==expected[key])throw Error(`Windows CU binding ${key} mismatch; renew this invocation binding.`);
 const issued=Date.parse(binding.issuedAt),expires=Date.parse(binding.expiresAt);
 if(!Number.isFinite(issued)||!Number.isFinite(expires)||issued>now||expires<=now||expires<=issued||expires-issued>bindingLimitMs)
  throw Error('Windows CU binding expired or invalid; host must renew its finite lease.');
 if(binding.authorized!==true||binding.state!=='running'||typeof binding.workerRun!=='string'||!binding.workerRun.trim()
  ||!Number.isSafeInteger(binding.workerPid)||binding.workerPid<=0||!isAlive(binding.workerPid))
  throw Error('Windows CU binding requires an authorized active run and live worker.');
 return binding;
}
export function readBinding(expected){
 let binding;
 try{binding=JSON.parse(fs.readFileSync(path.join(expected.directory,'cu-binding.json'),'utf8'));}
 catch(error){if(error.code!=='ENOENT')throw Error('Windows CU binding unreadable; host must replace it atomically.');}
 return validateBinding(expected,binding);
}
export function prepareReleaseCoordination(worktree,role,source,coordination){
 if(!coordination)return null;
 if(role!=='windows-release'||!/^[a-f0-9]{40}$/.test(source)||!Number.isSafeInteger(coordination.issue)||coordination.issue<=0
  ||! /^[a-zA-Z0-9-]{1,100}$/.test(coordination.run||''))throw Error('Invalid Windows release coordination identity.');
 const invocation=randomUUID(),directory=path.join(worktree,'.worldlet-task/windows-check',invocation);
 const record={run:coordination.run,issue:coordination.issue,source,role,invocation,directory,state:'preparing',createdAt:new Date().toISOString()};
 fs.mkdirSync(directory,{recursive:true});
 fs.writeFileSync(path.join(directory,'release.json'),JSON.stringify(record));
 const current=path.join(worktree,'.worldlet-task/windows-check/current.json');
 fs.writeFileSync(current+'.tmp',JSON.stringify(record));fs.renameSync(current+'.tmp',current);
 return record;
}
export function gateEnvironment(base,command,binding){
 const env={...base};
 for(const key of Object.keys(env))if(key.toUpperCase().startsWith('WORLDLET_WINDOWS_CHECK_'))delete env[key];
 // The Electron suite opens app windows, so it is the command that runs on the coordinated desktop.
 if(command==='test:electron'&&binding){
  const worker=readBinding(binding);
  env.WORLDLET_WINDOWS_CHECK_COORDINATE='1';env.WORLDLET_WINDOWS_CHECK_RUN=binding.run;
  env.WORLDLET_WINDOWS_CHECK_RELEASE=path.join(binding.directory,'release.json');
  env.WORLDLET_WINDOWS_CHECK_WORKER_PID=String(worker.workerPid);
  env.WORLDLET_WINDOWS_CHECK_WORKER_RUN=worker.workerRun;
 }
 return env;
}
