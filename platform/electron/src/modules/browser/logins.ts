import {safeStorage} from 'electron';
import {SAVED_LOGINS,loginsOverLimit,type SavedLogin} from '../../../../../core/browser/index.ts';
import type {Row} from '../../host/types.ts';

/** The World's records this keeps in (world.sqlite). */
const LOGINS_BUCKET='saved-logins',NEVER_BUCKET='saved-logins-never';
type Ledger={records(bucket:string):unknown[];put(bucket:string,id:string,row:any):void;delete(bucket:string,id:string):void};
const idOf=(site:string,username:string)=>site+'\n'+username;

/**
 * Saved sign-ins of the built-in browser (core/browser/saved-logins.ts decides what is offered). Native IO only:
 * each password is encrypted with the system keychain's key (Electron safeStorage) before it reaches the World's
 * records, and is decrypted only to fill a page in or to compare with a new sign-in. Nothing here is a Fox tool.
 */
export class SavedLogins {
 private readonly ledger:()=>Ledger;
 constructor(ledger:()=>Ledger){this.ledger=ledger;}
 /** Whether passwords can be kept at all: the keychain's key is there (not in a locked or headless session). */
 get available(){try{return safeStorage.isEncryptionAvailable();}catch{return false;}}
 private rows():(SavedLogin&{secret:string})[]{
  try{return (this.ledger().records(LOGINS_BUCKET) as Row[]).filter(row=>typeof row?.site==='string'&&typeof row?.username==='string'&&typeof row?.secret==='string')
   .map(row=>({site:row.site,username:row.username,secret:row.secret,createdAt:Number(row.createdAt)||0,usedAt:Number(row.usedAt)||0}));}
  catch{return [];}
 }
 /** Every saved account, without passwords. */
 list():SavedLogin[]{return this.rows().map(({secret:_,...login})=>login);}
 never():string[]{
  try{return (this.ledger().records(NEVER_BUCKET) as Row[]).map(row=>row?.site).filter((site):site is string=>typeof site==='string');}catch{return [];}
 }
 /** The saved password of an account, or null (none saved, or the keychain cannot open it: another computer's record). */
 password(site:string,username:string):string|null {
  const row=this.rows().find(login=>login.site===site&&login.username===username);if(!row)return null;
  try{return safeStorage.decryptString(Buffer.from(row.secret,'base64'));}catch{return null;}
 }
 save(site:string,username:string,password:string,now=Date.now()){
  if(!this.available||!site||!password||password.length>SAVED_LOGINS.maxPassword)return false;
  const ledger=this.ledger(),saved=this.rows(),kept=saved.find(login=>login.site===site&&login.username===username);
  const secret=safeStorage.encryptString(password).toString('base64');
  ledger.put(LOGINS_BUCKET,idOf(site,username),{id:idOf(site,username),site,username,secret,createdAt:kept?.createdAt||now,usedAt:now});
  for(const old of loginsOverLimit([...saved.filter(login=>login!==kept),{site,username,createdAt:now,usedAt:now}]))ledger.delete(LOGINS_BUCKET,idOf(old.site,old.username));
  ledger.delete(NEVER_BUCKET,site);
  return true;
 }
 used(site:string,username:string,now=Date.now()){
  const row=this.rows().find(login=>login.site===site&&login.username===username);if(!row)return;
  this.ledger().put(LOGINS_BUCKET,idOf(site,username),{id:idOf(site,username),...row,usedAt:now});
 }
 remove(site:string,username:string){this.ledger().delete(LOGINS_BUCKET,idOf(site,username));}
}
