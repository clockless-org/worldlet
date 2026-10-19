import fs from 'node:fs';
import path from 'node:path';

// Files and folders that moved into the World's database stay beside it as `<name>.before-database`
// (conversations, chat cards, brought skills, browsing history, execution payloads, made games, email drafts). They are only a safety copy: once
// it has been in place for a month the database has long been the one in use, so it is removed.
export const LEFTOVER_DAYS=30;
const PLACES=['.','agent','mail','companion','companion/brought','companion-profiles/setup/companion','companion-profiles/sample/companion'];

/** Removes `*.before-database` entries older than `LEFTOVER_DAYS`; returns what was removed (relative paths). */
export function removeOldLeftovers(root:string,now=Date.now()):string[] {
 const removed:string[]=[];
 for(const place of PLACES){
  let names:string[]=[];try{names=fs.readdirSync(path.join(root,place));}catch{continue;}
  for(const name of names.filter(name=>name.endsWith('.before-database'))){
   const target=path.join(root,place,name);
   try{
    // The move to `.before-database` is a rename, which sets the change time.
    const stat=fs.lstatSync(target);
    if(now-stat.ctimeMs<LEFTOVER_DAYS*86_400_000)continue;
    fs.rmSync(target,{recursive:!stat.isSymbolicLink(),force:true});
    removed.push(path.posix.join(place==='.'?'':place,name));
   }catch{}
  }
 }
 return removed;
}
