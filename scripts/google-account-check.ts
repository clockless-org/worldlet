// The World's own Google connection (platform/electron/src/modules/sources/google-account.ts) against a fake Google:
// a grant made in Fox's Hermes profile is adopted once, consent runs on a loopback address with PKCE and state,
// a reusable grant is refreshed instead of asking again, access tokens refresh before they expire and after a 401,
// a revoked grant says so, a disconnect is not undone by adopting the old grant again, and receipts are created once.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {GoogleAccount,GOOGLE_SCOPES} from '../platform/electron/src/modules/sources/google-account.ts';
import {GoogleRestError} from '../core/accounts/google/rest.ts';
import {withTempDir} from './test-temp.ts';

await withTempDir('worldlet-google-account-',async temp=>{
 const values=new Map<string,string>();
 const vault={get:(id:string)=>values.get(id)??null,set:(id:string,value:string)=>{values.set(id,value);},delete:(id:string)=>{values.delete(id);},deleteAll:()=>values.clear()};
 const client=path.join(temp,'client.json'),profile=path.join(temp,'hermes'),folder=path.join(temp,'accounts','google');
 fs.mkdirSync(profile);
 fs.writeFileSync(client,JSON.stringify({installed:{client_id:'client-1',client_secret:'secret-1',auth_uri:'https://accounts.example/auth',token_uri:'https://oauth.example/token'}}));
 let clock=1_000_000,tokens:any[]=[],api:any[]=[],revoked=false,issued=0,expire401=false;
 const fakeFetch=async(input:any,init:any={})=>{
  const url=String(input);
  if(url==='https://oauth.example/token'){
   const form=new URLSearchParams(String(init.body));tokens.push(Object.fromEntries(form));
   if(revoked&&form.get('grant_type')==='refresh_token')return new Response(JSON.stringify({error:'invalid_grant'}),{status:400});
   issued+=1;
   const scope=form.get('grant_type')==='authorization_code'?[GOOGLE_SCOPES.gmail,GOOGLE_SCOPES['google-calendar'],'openid','https://www.googleapis.com/auth/userinfo.email','https://www.googleapis.com/auth/userinfo.profile'].join(' '):undefined;
   return new Response(JSON.stringify({access_token:'access-'+issued,expires_in:3600,...form.get('grant_type')==='authorization_code'?{refresh_token:'refresh-new'}:{},...scope?{scope}:{}}),{status:200});
  }
  if(url.startsWith('https://www.googleapis.com/')){
   api.push({url,authorization:init.headers?.authorization,method:init.method});
   if(expire401){expire401=false;return new Response(JSON.stringify({error:{status:'UNAUTHENTICATED'}}),{status:401});}
   if(url.includes('missing'))return new Response(JSON.stringify({error:{errors:[{reason:'notFound'}]}}),{status:404});
   return new Response(JSON.stringify({ok:true,url}),{status:200});
  }
  throw Error('unexpected '+url);
 };
 const account=new GoogleAccount({folder,vault,clientFile:()=>client,adoptFrom:()=>[profile],fetch:fakeFetch as any,now:()=>clock});

 // Nothing yet; then Hermes' google-auth token in Fox's profile is adopted (an ISO expiry without a zone is UTC).
 assert.equal(account.authorized(),false);
 fs.writeFileSync(path.join(profile,'google_token.json'),JSON.stringify({token:'old',refresh_token:'refresh-old',scopes:[GOOGLE_SCOPES.gmail,GOOGLE_SCOPES['google-calendar']],expiry:'1970-01-01T00:16:40'}));
 assert.equal(account.authorized(),true);
 assert.deepEqual(account.services(),['gmail','google-calendar']);
 assert.equal(account.canSend(),false);
 assert.ok(values.get('google')?.includes('refresh-old'),'the adopted grant is kept in the vault');

 // The access token expired at the adopted expiry: the first call refreshes it, the next reuses it.
 const rest=account.rest();
 await rest.get('gmail/v1/users/me/threads',{q:'is:unread',metadataHeaders:['From','To'],skip:undefined,maxResults:5});
 assert.equal(tokens.at(-1).grant_type,'refresh_token');assert.equal(tokens.at(-1).refresh_token,'refresh-old');
 assert.equal(api.at(-1).url,'https://www.googleapis.com/gmail/v1/users/me/threads?q=is%3Aunread&metadataHeaders=From&metadataHeaders=To&maxResults=5');
 assert.equal(api.at(-1).authorization,'Bearer access-1');
 await rest.get('gmail/v1/users/me/profile');
 assert.equal(issued,1,'a fresh token is reused');
 // A 401 refreshes once and retries.
 expire401=true;await rest.get('gmail/v1/users/me/profile');
 assert.equal(issued,2);assert.equal(api.at(-1).authorization,'Bearer access-2');
 // A Google error carries its status and reason, never the body.
 await assert.rejects(rest.get('drive/v3/files/missing'),(error:any)=>error instanceof GoogleRestError&&error.status===404&&error.reason==='notFound');
 const all=await rest.getAll([{path:'gmail/v1/users/me/threads/a'},{path:'gmail/v1/users/me/threads/b'}]);
 assert.deepEqual(all.map((row:any)=>row.url.split('/').pop()),['a','b'],'answers come back in request order');

 // Connect with every needed scope already granted: the grant is refreshed, no browser opens.
 let opened:string[]=[];
 await account.connect(['gmail'],async url=>{opened.push(url);});
 assert.deepEqual(opened,[]);assert.equal(tokens.at(-1).grant_type,'refresh_token');

 // Drive is not granted: consent opens on a loopback address with PKCE, Mail and Calendar kept, identity scopes added.
 // The fake browser signs in; Google grants less than asked, so the connection is refused.
 const browser=async(url:string,answer:(query:URLSearchParams)=>Record<string,string>)=>{
  const consent=new URL(url),query=consent.searchParams;opened.push(url);
  const redirect=query.get('redirect_uri')!;
  assert.match(redirect,/^http:\/\/127\.0\.0\.1:\d+\/$/);
  setTimeout(async()=>{await fetch(redirect+'?'+new URLSearchParams(answer(query))).catch(()=>{});},10);
 };
 await assert.rejects(account.connect(['google-drive'],url=>browser(url,query=>({code:'code-1',state:query.get('state')!}))),/did not grant the requested access/);
 const asked=new URL(opened.at(-1)!).searchParams;
 assert.equal(asked.get('code_challenge_method'),'S256');assert.equal(asked.get('access_type'),'offline');assert.equal(asked.get('prompt'),'select_account consent');
 assert.deepEqual(asked.get('scope')!.split(' '),[GOOGLE_SCOPES['google-calendar'],GOOGLE_SCOPES.gmail,GOOGLE_SCOPES['google-drive'],'https://www.googleapis.com/auth/userinfo.email','https://www.googleapis.com/auth/userinfo.profile','openid'].sort());
 const exchange=tokens.at(-1);
 assert.equal(exchange.grant_type,'authorization_code');assert.equal(exchange.code,'code-1');
 assert.equal(crypto.createHash('sha256').update(exchange.code_verifier).digest('base64url'),asked.get('code_challenge'),'the verifier matches the challenge');
 // A revoked grant: a reconnect for Mail asks again instead of failing on the old grant; the right scopes connect.
 revoked=true;
 await assert.rejects(account.rest().get('gmail/v1/users/me/profile').then(()=>{clock+=7200_000;return account.rest().get('gmail/v1/users/me/profile');}),/expired or was revoked/);
 await account.connect(['gmail'],url=>browser(url,query=>({code:'code-2',state:query.get('state')!})));
 assert.ok(values.get('google')?.includes('refresh-new'),'a revoked grant signs in again');
 revoked=false;
 // A wrong state is refused and the consent is cancelled from Worldlet.
 let stop=false;
 const pending=account.connect(['google-drive'],url=>browser(url,()=>({code:'x',state:'forged'})),()=>stop);
 setTimeout(()=>{stop=true;},200);
 await assert.rejects(pending,/cancelled/);

 // Fox's built-in runtime gets a copy in google-auth's format; a disconnect forgets both and adoption does not undo it.
 account.mirror(profile);
 const mirrored=JSON.parse(fs.readFileSync(path.join(profile,'google_token.json'),'utf8'));
 assert.equal(mirrored.refresh_token,'refresh-new');assert.equal(mirrored.client_id,'client-1');assert.doesNotMatch(mirrored.expiry,/Z$/);
 fs.writeFileSync(path.join(profile,'google_token.json'),JSON.stringify({refresh_token:'refresh-old',scopes:[GOOGLE_SCOPES.gmail]}));
 account.disconnect(null);
 assert.equal(account.authorized(),false,'a disconnected World does not adopt the profile grant again');
 assert.ok(fs.existsSync(path.join(profile,'google_token.json')),'the person\'s own profile is not touched');
 account.disconnect(profile);
 assert.equal(fs.existsSync(path.join(profile,'google_token.json')),false,'Fox\'s own profile forgets its copy');

 // Receipts: created once, readable by either case, and an earlier receipt in Fox's profile still counts.
 const receipts=account.receipts([profile]),id='0F8FAD5B-D9CB-469F-A165-70867728950E';
 assert.equal(receipts.create(id,{status:'sending'}),true);
 assert.equal(receipts.create(id.toLowerCase(),{status:'sending'}),false);
 receipts.write(id,{status:'sent'});assert.deepEqual(receipts.read(id.toLowerCase()),{status:'sent'});
 fs.mkdirSync(path.join(profile,'mail-receipts'));
 const earlier='7C9E6679-7425-40DE-944B-E07FC1F90AE7';
 fs.writeFileSync(path.join(profile,'mail-receipts',earlier+'.json'),JSON.stringify({status:'sent'}));
 assert.deepEqual(receipts.read(earlier),{status:'sent'});assert.equal(receipts.create(earlier,{}),false);
});
console.log('PASS World Google connection: adoption, loopback PKCE consent, scope reuse, refresh and 401 retry, revoked grants, mirror, disconnect and receipts');
