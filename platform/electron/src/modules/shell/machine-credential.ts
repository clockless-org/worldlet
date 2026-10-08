import fs from 'node:fs';
import path from 'node:path';
import {libraryBase} from '../../profile.ts';
import type {Host} from '../../host/types.ts';

/** Where the development Mac's daemon leaves a copy of its admin credential for the installed (Alpha) app, which has
 * no checkout of its own (scripts/order-credential.mjs writes it; keep the two paths equal). */
export const machineCredentialFile=()=>path.join(libraryBase(),'Worldlet Internal','machine-service.json');

export type MachineCredential={url:string;token:string;machine:string};
const read=(file:string):MachineCredential|null=>{
 try{const v=JSON.parse(fs.readFileSync(file,'utf8'));
  return typeof v?.url==='string'&&v.url.startsWith('https://')&&typeof v.token==='string'&&v.token.length>=20&&typeof v.machine==='string'?{url:v.url,token:v.token,machine:v.machine}:null;}
 catch{return null;}
};
/** The admin credential of the computer this app runs on, or null: the Dev app's checkout (a linked worktree's
 * primary checkout holds the enrolment), then the daemon's copy. A computer that has one is one of the owner's,
 * which is what gates Order (order.ts) and switching the update channel (updates.ts) (Worldlet has no accounts). */
export function machineCredential(host:Host):MachineCredential|null {
 const files:string[]=[];
 if(process.env.WORLDLET_MACHINE_SERVICE_CONFIG)files.push(process.env.WORLDLET_MACHINE_SERVICE_CONFIG);
 if(host.profile.channel==='dev'){
  const repo=host.profile.resources;files.push(path.join(repo,'.local/machine-service.json'));
  try{const gitdir=/^gitdir:\s*(.+)$/m.exec(fs.readFileSync(path.join(repo,'.git'),'utf8'))?.[1]?.trim();const common=gitdir&&/^(.*)[\\/]\.git[\\/]worktrees[\\/][^\\/]+$/.exec(gitdir)?.[1];if(common)files.push(path.join(common,'.local/machine-service.json'));}catch{}
 }
 files.push(machineCredentialFile());
 for(const file of files){const found=read(file);if(found)return found;}
 return null;
}
