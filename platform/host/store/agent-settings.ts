import fs from 'node:fs';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {ensureDirectory,isLink,writeAtomic} from '../files.ts';

// Fox's setup choices: which local Harness or Agent setup chose, whether Fox's model is the
// person's own Codex sign-in. They follow the person
// with the World, backups included (owner decision 2026-10-03), and live in the World's database
// (`agent_settings`; whatever can be in SQLite is). The earlier `agent/<name>.json` files move in
// once and stay as `.before-database`. Before the World's database exists (a library that is
// still opening) the file is used.
type Value=Record<string,unknown>;
const legacyFile=(root:string,name:string)=>path.join(root,'agent',name+'.json');
function open(root:string):DatabaseSync|null {
 const file=path.join(root,'world.sqlite');
 if(!fs.existsSync(file))return null;
 const db=new DatabaseSync(file,{timeout:3000} as any);
 db.exec('CREATE TABLE IF NOT EXISTS agent_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);');
 return db;
}
function readFile(file:string):Value|null {
 try{if(isLink(file))return null;const value=JSON.parse(fs.readFileSync(file,'utf8'));return value&&typeof value==='object'&&!Array.isArray(value)?value:null;}catch{return null;}
}
function save(db:DatabaseSync,name:string,value:Value|null){
 if(value===null)db.prepare('DELETE FROM agent_settings WHERE key=?').run(name);
 else db.prepare('INSERT INTO agent_settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(name,JSON.stringify(value));
}
/** Moves the earlier file in (it is the newer copy while it exists). */
function moveIn(db:DatabaseSync,root:string,name:string){
 const file=legacyFile(root,name);
 if(!fs.existsSync(file)||isLink(file))return;
 save(db,name,readFile(file));
 try{fs.renameSync(file,file+'.before-database');}catch{}
}
export function readAgentSetting(root:string,name:string):Value|null {
 let db:DatabaseSync|null=null;
 try{db=open(root);}catch{db=null;}
 if(!db)return readFile(legacyFile(root,name));
 try{
  moveIn(db,root,name);
  const row=db.prepare('SELECT value FROM agent_settings WHERE key=?').get(name) as {value?:string}|undefined;
  return row?.value?JSON.parse(row.value):null;
 }catch{return null;}
 finally{db.close();}
}
export function writeAgentSetting(root:string,name:string,value:Value|null){
 const db=open(root);
 if(!db){
  const file=legacyFile(root,name);
  if(value===null)fs.rmSync(file,{force:true});else writeAtomic(path.join(ensureDirectory(path.dirname(file)),path.basename(file)),JSON.stringify(value));
  return;
 }
 try{moveIn(db,root,name);save(db,name,value);}finally{db.close();}
}
