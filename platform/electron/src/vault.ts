import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {safeStorage} from 'electron';
import {readJSON,writeJSON,WorldletError} from './files.ts';
import type {VaultService} from './host/services.ts';
type Storage=Pick<typeof safeStorage,'isEncryptionAvailable'|'encryptString'|'decryptString'>&{getSelectedStorageBackend?:()=>string};
/** Small credentials (CLI grants, client secrets) encrypted with the OS keychain-backed
 * key (`safeStorage`: Keychain on Mac, DPAPI on Windows, libsecret on Linux). The file is
 * owner-only and excluded from World backups; reset deletes it. A file that no longer parses is
 * never overwritten in place: the next write first moves it aside as `vault.json.corrupt-<time>`. */
export function createVault(root:string,service:string,storage:Storage=safeStorage,platform:string=process.platform):VaultService {
 const file=path.join(root,'vault.json');
 const parse=():Record<string,string>=>{const value=readJSON(file);if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Not a vault.');return value;};
 const read=():Record<string,string>=>{try{return fs.existsSync(file)?parse():{};}catch{return {};}};
 // Before a write: the current values, or none once a damaged file has been kept beside it.
 const readForWrite=():Record<string,string>=>{
  if(!fs.existsSync(file))return {};
  try{return parse();}catch{
   fs.renameSync(file,`${file}.corrupt-${new Date().toISOString().replace(/[:.]/g,'-')}-${crypto.randomUUID().slice(0,8)}`);
   console.warn('worldlet: vault-corrupt-kept');
   return {};
  }
 };
 let warned=false;
 const key=(id:string)=>service+':'+id;
 return {
  get(id){
   const value=read()[key(id)];
   if(!value)return null;
   try{return storage.decryptString(Buffer.from(value,'base64'));}catch{return null;}
  },
  set(id,secret){
   if(!storage.isEncryptionAvailable())throw new WorldletError('Secure credential storage is unavailable on this computer.');
   // Linux without a keyring: Chromium falls back to a fixed key, so the file is only obfuscated.
   if(!warned&&platform==='linux'){warned=true;try{if(storage.getSelectedStorageBackend?.()==='basic_text')console.warn('worldlet: vault-basic-text-storage');}catch{}}
   const values=readForWrite();values[key(id)]=storage.encryptString(secret).toString('base64');writeJSON(file,values);
  },
  delete(id){if(!(key(id) in read()))return;const values=readForWrite();delete values[key(id)];writeJSON(file,values);},
  deleteAll(){fs.rmSync(file,{force:true});}
 };
}
