import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {GoogleRestError,type GoogleQuery,type GoogleRest,type MailReceipts} from '../../../../../core/accounts/index.ts';
import {WorldletError,ensureDirectory,readJSON,writeJSON} from '../../files.ts';
import type {VaultService} from '../../host/services.ts';

/** The World's own Google connection (owner decision 2026-10-09: a connection made through Worldlet is kept by the
 * Platform, not by any Harness; Worldlet customizes nothing below the Harness contract). Worldlet's Desktop OAuth
 * client, the grant in the vault, and an authorized REST transport for Core's Gmail, Calendar and Drive readers. A
 * grant Fox's Hermes profile already holds (`google_token.json`, Hermes' google-workspace format) is adopted once. */
export const GOOGLE_SCOPES={
 'gmail-send':'https://www.googleapis.com/auth/gmail.send',
 gmail:'https://www.googleapis.com/auth/gmail.readonly',
 // The reader uses only calendars/primary; shared calendars are not imported.
 'google-calendar':'https://www.googleapis.com/auth/calendar.events.owned.readonly',
 'google-drive':'https://www.googleapis.com/auth/drive.readonly',
} as const;
export type GoogleService=keyof typeof GOOGLE_SCOPES;
const IDENTITY=['openid','https://www.googleapis.com/auth/userinfo.email','https://www.googleapis.com/auth/userinfo.profile'];
const VAULT_ID='google';
const API='https://www.googleapis.com/';
const EXPIRED='Your Google sign-in expired or was revoked. Reconnect with Fox. Saved items are kept.';
const TIMEOUT='Connection to Google timed out (WinError 10060 / network timeout). Check your internet connection and proxy or VPN settings, then try again. Your saved data has not been deleted. If this was a send or other write, check its result before retrying.';

interface Grant {token:string;refresh_token:string;scopes:string[];expiry:number}
interface Client {client_id:string;client_secret:string;auth_uri:string;token_uri:string}
export interface GoogleAccountOptions {
 /** The World's account folder (`<library>/accounts/google`): profile metadata and mail send receipts. */
 folder:string;
 vault:VaultService;
 /** Worldlet's Desktop OAuth client (bundled `GoogleOAuthClient.json`). */
 clientFile:()=>string|null;
 /** Hermes profiles whose grant was made through Worldlet; the first with a token is adopted when the vault has none. */
 adoptFrom:()=>string[];
 fetch?:typeof fetch;
 now?:()=>number;
}

export class GoogleAccount {
 private readonly options:GoogleAccountOptions;
 private refreshing:Promise<Grant>|null=null;
 constructor(options:GoogleAccountOptions){this.options=options;}
 private get fetch(){return this.options.fetch??fetch;}
 private now(){return this.options.now?.()??Date.now();}
 get folder(){return this.options.folder;}

 client():Client|null {
  const file=this.options.clientFile();
  if(!file)return null;
  try{
   const installed=readJSON(file)?.installed;
   if(typeof installed?.client_id!=='string'||typeof installed?.client_secret!=='string')return null;
   return {client_id:installed.client_id,client_secret:installed.client_secret,auth_uri:installed.auth_uri||'https://accounts.google.com/o/oauth2/auth',token_uri:installed.token_uri||'https://oauth2.googleapis.com/token'};
  }catch{return null;}
 }
 /** The saved grant; adopts one from Fox's Hermes profile when the World has none and was never disconnected. */
 private grant():Grant|null {
  const saved=this.options.vault.get(VAULT_ID);
  if(saved){try{const value=JSON.parse(saved);return value?.disconnected?null:parseGrant(value);}catch{return null;}}
  for(const home of this.options.adoptFrom()){
   const grant=parseGrant(readJSON(path.join(home,'google_token.json'),null));
   if(grant){this.save(grant);return grant;}
  }
  return null;
 }
 private save(grant:Grant){this.options.vault.set(VAULT_ID,JSON.stringify(grant));}
 authorized(){return this.grant()!==null;}
 /** The services the grant covers. */
 services():GoogleService[] {const scopes=this.grant()?.scopes??[];return (['gmail','google-calendar','google-drive'] as const).filter(name=>scopes.includes(GOOGLE_SCOPES[name]));}
 canSend(){return this.grant()?.scopes.includes(GOOGLE_SCOPES['gmail-send'])===true;}

 private async refresh(grant:Grant):Promise<Grant> {
  const client=this.client();
  if(!client)throw new WorldletError('Google sign-in is not configured for this build yet.');
  const response=await this.request(client.token_uri,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},
   body:new URLSearchParams({grant_type:'refresh_token',refresh_token:grant.refresh_token,client_id:client.client_id,client_secret:client.client_secret}).toString()});
  const value=await response.json().catch(()=>({}));
  if(!response.ok){
   if(['invalid_grant','invalid_token'].includes(value?.error))throw new WorldletError(EXPIRED);
   throw new GoogleRestError(response.status,typeof value?.error==='string'?value.error:'');
  }
  const next={...grant,token:String(value.access_token??''),expiry:this.now()+Number(value.expires_in??3600)*1000,
   ...typeof value.scope==='string'?{scopes:value.scope.split(' ').filter(Boolean)}:{}};
  if(!next.token)throw new WorldletError(EXPIRED);
  this.save(next);return next;
 }
 /** A grant whose access token is good for at least another minute; one refresh at a time. */
 private async fresh(force=false):Promise<Grant> {
  const grant=this.grant();
  if(!grant)throw new WorldletError('Connect Google first. No local authorization was found.');
  if(!force&&grant.token&&grant.expiry-60_000>this.now())return grant;
  this.refreshing??=this.refresh(grant).finally(()=>{this.refreshing=null;});
  return this.refreshing;
 }
 private async request(url:string,init:RequestInit,timeout=10_000){
  try{return await this.fetch(url,{...init,signal:AbortSignal.timeout(timeout)});}
  catch(error){if(isTimeout(error))throw new WorldletError(TIMEOUT);throw error;}
 }
 private async call(method:'GET'|'POST',route:string,query:GoogleQuery|undefined,body?:unknown,raw=false):Promise<any> {
  const url=API+route+serialize(query);
  for(let attempt=0;;attempt++){
   const grant=await this.fresh(attempt>0);
   const response=await this.request(url,{method,headers:{authorization:'Bearer '+grant.token,...body!==undefined?{'content-type':'application/json'}:{}},...body!==undefined?{body:JSON.stringify(body)}:{}});
   if(response.status===401&&attempt===0)continue;
   if(!response.ok)throw new GoogleRestError(response.status,reason(await response.json().catch(()=>null)));
   return raw?new Uint8Array(await response.arrayBuffer()):response.json();
  }
 }
 /** Authorized REST for Core's readers. A whole read is retried once after a timeout; a POST never is. */
 rest():GoogleRest {
  const read=async<T>(run:()=>Promise<T>)=>{try{return await run();}catch(error){if(!(error instanceof WorldletError&&error.message===TIMEOUT))throw error;await new Promise(done=>setTimeout(done,250));return run();}};
  return {
   get:(route,query)=>read(()=>this.call('GET',route,query)),
   getAll:requests=>read(()=>Promise.all(requests.map(request=>this.call('GET',request.path,request.query)))),
   post:(route,body,query)=>this.call('POST',route,query,body),
   bytes:(route,query)=>read(()=>this.call('GET',route,query,undefined,true)),
  };
 }

 /** Mail and Calendar share one read-only authorization from either entry; Drive and sending are added only on
  * request. A saved grant with every needed scope is reused once it still refreshes; otherwise the person signs in
  * in their browser (`open`), on a loopback address with PKCE, within five minutes. */
 async connect(requested:GoogleService[],open:(url:string)=>Promise<void>,cancelled:()=>boolean=()=>false){
  if(!requested.length||requested.some(service=>!(service in GOOGLE_SCOPES)))throw new WorldletError('Unsupported Google service.');
  const services=requested.some(service=>service==='gmail'||service==='google-calendar')?[...new Set<GoogleService>(['gmail','google-calendar',...requested])]:requested;
  const client=this.client();
  if(!client)throw new WorldletError('Google sign-in is not configured for this build yet.');
  const stored=this.grant(),required=services.map(service=>GOOGLE_SCOPES[service]);
  if(stored&&required.every(scope=>stored.scopes.includes(scope))){
   // A saved scope is not proof the grant still works: a reconnect escapes a revoked grant, a network failure keeps it.
   try{await this.refresh(stored);return;}catch(error){if(!(error instanceof WorldletError&&error.message===EXPIRED))throw error;}
  }
  const core=[GOOGLE_SCOPES.gmail,GOOGLE_SCOPES['google-calendar'],GOOGLE_SCOPES['gmail-send']];
  const scopes=[...new Set([...required,...(stored?.scopes??[]).filter(scope=>core.includes(scope as any)),...IDENTITY])].sort();
  const grant=await this.consent(client,scopes,open,cancelled);
  if(!scopes.every(scope=>grant.scopes.includes(scope)))throw new WorldletError('Google authorization did not grant the requested access.');
  this.save(grant);
 }
 private consent(client:Client,scopes:string[],open:(url:string)=>Promise<void>,cancelled:()=>boolean):Promise<Grant> {
  const verifier=crypto.randomBytes(48).toString('base64url'),state=crypto.randomBytes(24).toString('base64url');
  const challenge=crypto.createHash('sha256').update(verifier).digest('base64url');
  return new Promise<Grant>((resolve,reject)=>{
   let settled=false,redirect='';
   const finish=(error:Error|null,grant?:Grant)=>{if(settled)return;settled=true;clearTimeout(timer);clearInterval(watch);server.close();if(error)reject(error);else resolve(grant!);};
   const server=http.createServer((request,response)=>{
    const url=new URL(request.url??'/',redirect);
    if(url.pathname!=='/'||(!url.searchParams.has('code')&&!url.searchParams.has('error'))){response.writeHead(404).end();return;}
    const page=(text:string)=>{response.writeHead(200,{'content-type':'text/plain; charset=utf-8'});response.end(text);};
    if(url.searchParams.get('state')!==state){page('This sign-in link is out of date. Return to Worldlet and try again.');return;}
    const code=url.searchParams.get('code');
    if(!code){page('Google authorization was not completed. You can return to Worldlet.');finish(new WorldletError('Google authorization was not completed.'));return;}
    page('Google authorization received. You can return to Worldlet.');
    this.request(client.token_uri,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},
     body:new URLSearchParams({grant_type:'authorization_code',code,redirect_uri:redirect,client_id:client.client_id,client_secret:client.client_secret,code_verifier:verifier}).toString()},15_000)
     .then(async answer=>{
      const value=await answer.json().catch(()=>({}));
      if(!answer.ok||typeof value.access_token!=='string'||typeof value.refresh_token!=='string')throw new WorldletError('Google authorization did not complete.');
      finish(null,{token:value.access_token,refresh_token:value.refresh_token,scopes:String(value.scope??'').split(' ').filter(Boolean),expiry:this.now()+Number(value.expires_in??3600)*1000});
     }).catch(error=>finish(error instanceof Error?error:new WorldletError(String(error))));
   });
   const timer=setTimeout(()=>finish(new WorldletError('Google sign-in timed out. Try again.')),300_000);
   const watch=setInterval(()=>{if(cancelled())finish(new WorldletError('Google sign-in was cancelled.'));},500);
   server.on('error',error=>finish(error));
   server.listen(0,'127.0.0.1',()=>{
    const port=(server.address() as {port:number}).port;
    redirect=`http://127.0.0.1:${port}/`;
    const url=client.auth_uri+'?'+new URLSearchParams({response_type:'code',client_id:client.client_id,redirect_uri:redirect,scope:scopes.join(' '),state,
     code_challenge:challenge,code_challenge_method:'S256',access_type:'offline',prompt:'select_account consent'}).toString();
    open(url).catch(error=>finish(error instanceof Error?error:new WorldletError(String(error))));
   });
  });
 }
 /** Fox's built-in Hermes runtime still reads Google in its own process until it is retired: a grant made here is
  * written into Fox's own profile too, in google-auth's format (never into the person's own Hermes Agent). */
 mirror(home:string){
  const grant=this.grant(),client=this.client();
  if(!grant||!client||!fs.existsSync(home))return;
  writeJSON(path.join(home,'google_token.json'),{token:grant.token,refresh_token:grant.refresh_token,token_uri:client.token_uri,client_id:client.client_id,client_secret:client.client_secret,
   scopes:grant.scopes,universe_domain:'googleapis.com',account:'',expiry:new Date(grant.expiry||0).toISOString().replace('Z','')});
 }
 /** Forgets the World's grant on this computer without revoking it (Google's revoke ends the whole project's grant,
  * other devices included; that belongs in Google Account settings). Fox's own Hermes profile forgets its copy too. */
 disconnect(ownProfile:string|null){
  this.options.vault.set(VAULT_ID,JSON.stringify({disconnected:true}));
  for(const name of ['profile.json'])fs.rmSync(path.join(this.folder,name),{force:true});
  if(ownProfile)for(const name of ['google_token.json','google_token.pending','google_profile.json','google_profile.pending'])fs.rmSync(path.join(ownProfile,name),{force:true});
 }

 /** The signed-in account for product analytics (Person ID) and Fox's greeting: the mailbox address, a keyed or plain
  * SHA-256 of it, and a display name only when Google verified the address (google_profile.py `remember`). */
 profile():{email:string;user_id:string;name?:string}|null {
  const value=readJSON(path.join(this.folder,'profile.json'),null) as any;
  return value&&typeof value.email==='string'&&typeof value.user_id==='string'?value:null;
 }
 async remember(email:string){
  email=email.trim().toLowerCase();
  if(!email||!email.includes('@')||email.length>320)return;
  const old=this.profile() as any,key=process.env.WORLDLET_ANALYTICS_ID_KEY??'';
  const userId='google-'+(key?crypto.createHmac('sha256',key):crypto.createHash('sha256')).update(email).digest('hex');
  if(old?.email===email&&old.user_id===userId&&Date.now()/1000-(old.checked??0)<86400)return;
  const profile:Record<string,unknown>={email,user_id:userId,checked:Date.now()/1000};
  if(old?.email===email&&old.name)profile.name=old.name;
  try{
   const grant=await this.fresh();
   if(IDENTITY.slice(1).every(scope=>grant.scopes.includes(scope))){
    const response=await this.request('https://www.googleapis.com/oauth2/v3/userinfo',{headers:{authorization:'Bearer '+grant.token}},5_000);
    const user=response.ok?await response.json():null;
    if(user?.email_verified===true&&String(user.email??'').toLowerCase()===email&&typeof user.name==='string'&&user.name.trim())profile.name=user.name.trim().slice(0,200);
   }
  }catch{}// Profile metadata never blocks the connection.
  writeJSON(path.join(ensureDirectory(this.folder),'profile.json'),profile);
 }
 /** Mail send receipts beside the grant, one per reviewed draft; the folder Fox's Hermes profile kept them in is
  * read too, so a send attempted before the move is still reconciled and never repeated. */
 receipts(legacy:string[]=[]):MailReceipts {
  const folder=path.join(this.folder,'mail-receipts');
  const file=(id:string)=>path.join(folder,id.toLowerCase()+'.json');
  const find=(id:string)=>[file(id),...legacy.flatMap(home=>[path.join(home,'mail-receipts',id.toLowerCase()+'.json'),path.join(home,'mail-receipts',id.toUpperCase()+'.json')])].find(name=>fs.existsSync(name));
  return {
   read:id=>{const name=find(id);return name?readJSON(name,null):null;},
   create:(id,value)=>{
    if(find(id))return false;
    ensureDirectory(folder);
    try{const fd=fs.openSync(file(id),'wx',0o600);try{fs.writeSync(fd,JSON.stringify(value));fs.fsyncSync(fd);}finally{fs.closeSync(fd);}return true;}
    catch(error){if((error as NodeJS.ErrnoException).code==='EEXIST')return false;throw error;}
   },
   write:(id,value)=>{ensureDirectory(folder);writeJSON(file(id),value);},
  };
 }
}

function parseGrant(value:any):Grant|null {
 if(!value||typeof value!=='object'||typeof value.refresh_token!=='string'||!value.refresh_token)return null;
 const scopes=Array.isArray(value.scopes)?value.scopes.filter((scope:unknown)=>typeof scope==='string'):typeof value.scopes==='string'?value.scopes.split(' ').filter(Boolean):[];
 // google-auth writes `expiry` as an ISO time without a zone (UTC); the World writes milliseconds.
 const expiry=typeof value.expiry==='number'?value.expiry:typeof value.expiry==='string'?Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(value.expiry)?value.expiry:value.expiry+'Z')||0:0;
 return {token:typeof value.token==='string'?value.token:'',refresh_token:value.refresh_token,scopes,expiry};
}
function serialize(query:GoogleQuery|undefined){
 const search=new URLSearchParams();
 for(const [key,value] of Object.entries(query??{})){
  if(value===undefined)continue;
  for(const item of Array.isArray(value)?value:[value])search.append(key,String(item));
 }
 const text=search.toString();return text?'?'+text:'';
}
function reason(value:any):string {
 const error=value?.error;
 return String(error?.errors?.[0]?.reason??error?.status??(typeof error==='string'?error:'')).slice(0,64);
}
function isTimeout(error:unknown){
 const name=(error as Error)?.name;
 return name==='TimeoutError'||name==='AbortError'||/ETIMEDOUT|ECONNRESET|UND_ERR_CONNECT_TIMEOUT/.test(String((error as any)?.cause?.code??''));
}
