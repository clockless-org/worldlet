import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
// The credential vault's storage on the Node host (platform/server), where there is no keychain for Electron's
// `safeStorage`: AES-256-GCM with a random key in an owner-only `vault.key` beside `vault.json`. The secrets are as safe
// as that file (the computer's account and disk encryption), not tied to a keychain. A vault written by the Electron
// host on Linux (libsecret) is not readable here. The desktop app opens this one when it takes the library over from
// the service (platform/host/service.ts) and seals each entry again with its keychain.
export const VAULT_KEY_FILE='vault.key';
const VERSION=1,IV=12,TAG=16;
export function nodeVaultStorage(root:string){
 const file=path.join(root,VAULT_KEY_FILE);
 let key:Buffer|null=null;
 const readKey=()=>{
  try{const value=fs.readFileSync(file);if(value.length===32)return value;}catch(error){if(error?.code!=='ENOENT')throw error;}
  return null;
 };
 // Made once, written exclusively: two processes that start together keep the same key.
 const ensureKey=()=>{
  if(key)return key;
  key=readKey();if(key)return key;
  fs.mkdirSync(root,{recursive:true});
  try{fs.writeFileSync(file,crypto.randomBytes(32),{mode:0o600,flag:'wx'});}catch(error){if(error?.code!=='EEXIST')throw error;}
  key=readKey();if(!key)throw Error('The vault key is unreadable.');
  return key;
 };
 return {
  isEncryptionAvailable:()=>true,
  encryptString(text:string):Buffer{
   const iv=crypto.randomBytes(IV),cipher=crypto.createCipheriv('aes-256-gcm',ensureKey(),iv);
   const sealed=Buffer.concat([cipher.update(text,'utf8'),cipher.final()]);
   return Buffer.concat([Buffer.from([VERSION]),iv,cipher.getAuthTag(),sealed]);
  },
  decryptString(data:Buffer):string{
   // No key yet means nothing was ever sealed with one.
   const current=key??readKey();
   if(!current||data.length<1+IV+TAG||data[0]!==VERSION)throw Error('Not sealed with this vault key.');
   key=current;
   const decipher=crypto.createDecipheriv('aes-256-gcm',current,data.subarray(1,1+IV));
   decipher.setAuthTag(data.subarray(1+IV,1+IV+TAG));
   return Buffer.concat([decipher.update(data.subarray(1+IV+TAG)),decipher.final()]).toString('utf8');
  },
 };
}
