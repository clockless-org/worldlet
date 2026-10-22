import fs from 'node:fs';
import path from 'node:path';
import type {WorldLedger} from './ledger.ts';

type Row=Record<string,any>;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PAYLOAD=/^([a-zA-Z0-9_.-]{1,180})\.json$/;
const json=(file:string)=>JSON.parse(fs.readFileSync(file,'utf8'));
const retire=(file:string)=>{try{fs.renameSync(file,file+'.before-database');}catch{}};
/** Text files a Codex task made, by their path inside `files/`. */
function filesIn(folder:string):Record<string,string> {
 const out:Record<string,string>={};
 const walk=(dir:string,prefix:string)=>{
  for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
   const relative=prefix?prefix+'/'+entry.name:entry.name;
   if(entry.isDirectory())walk(path.join(dir,entry.name),relative);
   else if(entry.isFile())out[relative]=fs.readFileSync(path.join(dir,entry.name),'utf8');
  }
 };
 try{walk(folder,'');}catch{}
 return out;
}

/** Moves what the World kept in files of their own into its database, once (owner decision 2026-10-05:
 * everything that happens in the World is recorded in `world.sqlite`). Each moved file or folder stays
 * beside it as `<name>.before-database` until store/leftovers.ts removes it a month later. A file that
 * cannot be read stays where it is and is tried again next time. Returns what moved (relative paths). */
export function moveFilesIn(root:string,ledger:WorldLedger):string[] {
 const moved:string[]=[];
 // Execution journal payloads: `execution/<id>.json`, the reference history keeps.
 const execution=path.join(root,'execution');
 if(fs.existsSync(execution)){
  try{
   ledger.transaction(()=>{
    for(const name of fs.readdirSync(execution)){
     const id=PAYLOAD.exec(name)?.[1];if(!id)continue;
     let payload:unknown;try{payload=json(path.join(execution,name));}catch{continue;}
     ledger.savePayload(id,payload);
    }
   });
   retire(execution);moved.push('execution');
  }catch{}
 }
 // Made games: `games/<id>/game.json`, `game.html` and `versions/<n>.html`.
 const games=path.join(root,'games');
 if(fs.existsSync(games)){
  try{
   for(const id of fs.readdirSync(games)){
    const folder=path.join(games,id);
    let record:Row,html:string;
    try{record=json(path.join(folder,'game.json'));html=fs.readFileSync(path.join(folder,'game.html'),'utf8');}catch{continue;}
    if(record?.id!==id)continue;
    let versions:string[]=[];try{versions=fs.readdirSync(path.join(folder,'versions')).filter(name=>/^\d+\.html$/.test(name)).sort((a,b)=>parseInt(a)-parseInt(b));}catch{}
    // Each older page goes in as that version, then the current one on top, so they become its versions.
    ledger.transaction(()=>{
     for(const name of versions)ledger.saveMadeGame(id,{...record,version:parseInt(name)},fs.readFileSync(path.join(folder,'versions',name),'utf8'),1000);
     ledger.saveMadeGame(id,record,html,1000);
    });
   }
   retire(games);moved.push('games');
  }catch{}
 }
 // Reviewed email drafts: `mail/reviews.json`, validated again where they are read.
 const reviews=path.join(root,'mail','reviews.json');
 if(fs.existsSync(reviews)){
  try{
   const archive=json(reviews);
   if(archive?.version===1&&archive.reviews&&typeof archive.reviews==='object'&&!Array.isArray(archive.reviews)){
    ledger.replaceMailReviews({...ledger.mailReviews(),...archive.reviews});
    retire(reviews);moved.push('mail/reviews.json');
   }
  }catch{}
 }
 // Codex coding tasks: the record and the files it made. The folder stays: Codex works in it, and
 // Show in Finder opens its `files/`.
 const codex=path.join(root,'agent','private','codex');
 let tasks:string[]=[];try{tasks=fs.readdirSync(codex).filter(name=>UUID.test(name));}catch{}
 for(const id of tasks){
  const file=path.join(codex,id,'task.json');
  if(!fs.existsSync(file)||ledger.codingTask(id))continue;
  try{
   const record=json(file);
   if(record?.id!==id)continue;
   ledger.saveCodingTask(record,filesIn(path.join(codex,id,'files')));
   retire(file);moved.push(`agent/private/codex/${id}/task.json`);
  }catch{}
 }
 return moved;
}
