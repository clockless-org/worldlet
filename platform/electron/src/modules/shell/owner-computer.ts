import fs from 'node:fs';
import path from 'node:path';
import {libraryBase} from '../../profile.ts';
import type {Host} from '../../host/types.ts';

/** The owner's mark on this computer: a file named `owner` in `<library base>/Worldlet Internal/`. Its contents are
 * never read. The older `machine-service.json` there, which the development Mac's daemon used to leave, still counts,
 * so the owner's installed app keeps its channel without a new step. */
export const ownerMarkFiles=()=>['owner','machine-service.json'].map(name=>path.join(libraryBase(),'Worldlet Internal',name));

const present=(file:string)=>{try{return fs.statSync(file).isFile();}catch{return false;}};
/** Whether this is one of the owner's computers (Worldlet has no accounts): the Dev app's checkout (a linked worktree's
 * primary checkout counts) holds `.local/owner` or the older `.local/machine-service.json`, or the library holds the
 * mark (ownerMarkFiles). Only there can an installed copy switch the update channel (updates.ts). */
export function ownerComputer(host:Host):boolean {
 const files:string[]=[];
 if(process.env.WORLDLET_OWNER_FILE)files.push(process.env.WORLDLET_OWNER_FILE);
 if(host.profile.channel==='dev'){
  const repo=host.profile.resources,local=(root:string)=>['owner','machine-service.json'].map(name=>path.join(root,'.local',name));
  files.push(...local(repo));
  try{const gitdir=/^gitdir:\s*(.+)$/m.exec(fs.readFileSync(path.join(repo,'.git'),'utf8'))?.[1]?.trim();const common=gitdir&&/^(.*)[\\/]\.git[\\/]worktrees[\\/][^\\/]+$/.exec(gitdir)?.[1];if(common)files.push(...local(common));}catch{}
 }
 files.push(...ownerMarkFiles());
 return files.some(present);
}
