// Search Console through Worldlet's own Google sign-in (context/applets/INTEGRATIONS.md#search-console-service): its tile
// connects with no key, adding only the read-only Search Console permission to the World's Google sign-in on a
// loopback address with PKCE while keeping what that sign-in already allowed; the vault keeps only that it reads so,
// never a token; reads go to the Search Console API with the Google sign-in's access token, renewed once after a 401;
// a sign-in Google no longer accepts and a site the account cannot see say so in plain words; signing in to Mail again
// keeps Search Console; Disconnect forgets Search Console but not the Google sign-in; a service account key still
// replaces it under Advanced; and a host with no Google sign-in says to use Advanced. Against a fake Google.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {CONNECTOR_TECHNICAL_WORDS,SEARCH_CONSOLE_GATE,SEARCH_CONSOLE_SCOPE,connector,connectorTiles} from '../context/sources/index.ts';
import {TOKEN_PROVIDERS,connectToken} from '../context/applets/index.ts';
import {GoogleAccount,GOOGLE_SCOPES} from '../platform/electron/src/modules/sources/google-account.ts';
import {ServiceSource,ServiceSourceConnections} from '../platform/electron/src/modules/sources/service-source.ts';
import {withTempDir} from './test-temp.ts';

// The registry: a tile of its own that signs in with Google, into Work, asking only to read; a service account under Advanced.
const item=connector('search-console')!;
assert.deepEqual([item.mechanism,item.shown,item.region,item.scopes.read,item.fallback],['google','always','work',[SEARCH_CONSOLE_SCOPE],['service-account']]);
assert.equal(SEARCH_CONSOLE_SCOPE,'https://www.googleapis.com/auth/webmasters.readonly');
const off=connectorTiles([]).find(tile=>tile.id==='search-console')!;
assert.deepEqual([off.state,off.signIn,off.provider,off.region],['off',true,'search-console','work']);
assert.doesNotMatch(off.line,CONNECTOR_TECHNICAL_WORDS);
assert.equal(TOKEN_PROVIDERS['search-console'].signIn,true);
assert.equal(connectToken('search-console',''),'','no key: it signs in');
for(const text of [SEARCH_CONSOLE_GATE.signedOut!,SEARCH_CONSOLE_GATE.signInForbidden!])assert.doesNotMatch(text,CONNECTOR_TECHNICAL_WORDS,text);

await withTempDir('worldlet-search-console-sign-in-',async temp=>{
 const values=new Map<string,string>();
 const vault={get:(id:string)=>values.get(id)??null,set:(id:string,value:string)=>{values.set(id,value);},delete:(id:string)=>{values.delete(id);},deleteAll:()=>values.clear()};
 const client=path.join(temp,'client.json'),folder=path.join(temp,'accounts','google');
 fs.writeFileSync(client,JSON.stringify({installed:{client_id:'client-1.apps.example.com',client_secret:'not-secret-for-a-desktop-client',auth_uri:'https://accounts.example/auth',token_uri:'https://oauth.example/token'}}));
 let issued=0,asked='',revoked=false,unauthorizedOnce=false;
 const tokens:Record<string,string>[]=[],api:{url:string;method:string;authorization:string}[]=[];
 const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json'}});
 const fakeFetch=async(input:any,init:any={})=>{
  const url=String(input);
  if(url==='https://oauth.example/token'){
   const form=new URLSearchParams(String(init.body));tokens.push(Object.fromEntries(form));
   if(revoked&&form.get('grant_type')==='refresh_token')return json({error:'invalid_grant'},400);
   issued+=1;
   // Google grants what the consent page asked for.
   return json({access_token:'access-'+issued,expires_in:3600,...form.get('grant_type')==='authorization_code'?{refresh_token:'refresh-'+issued,scope:asked}:{}});
  }
  if(url.startsWith('https://www.googleapis.com/webmasters/v3/')){
   const authorization=String(init.headers?.authorization??'');
   api.push({url,method:init.method??'GET',authorization});
   assert.equal(init.redirect,'manual');
   if(unauthorizedOnce){unauthorizedOnce=false;return json({error:{code:401}},401);}
   if(!/^Bearer access-\d+$/.test(authorization))return json({error:{code:401}},401);
   if(url.endsWith('/webmasters/v3/sites'))return json({siteEntry:[{siteUrl:'sc-domain:example.com',permissionLevel:'siteOwner'}]});
   if(url.includes(encodeURIComponent('https://example.org/')))return json({error:{code:403,message:'User does not have sufficient permission for site.'}},403);
   return json({rows:[{clicks:5,impressions:50,ctr:0.1,position:2}]});
  }
  throw Error('unexpected '+url);
 };
 const account=new GoogleAccount({folder,vault,clientFile:()=>client,adoptFrom:()=>[],fetch:fakeFetch as typeof fetch});
 const google={connect:(open:(url:string)=>Promise<void>,cancelled:()=>boolean)=>account.connect(['search-console'],open,cancelled),
  allows:()=>account.allows('search-console'),bearer:(force:boolean)=>account.bearer('search-console',force)};
 const opened:string[]=[];
 // The fake browser: the person signs in and allows what the page asks.
 const browser=async(url:string)=>{
  opened.push(url);
  const query=new URL(url).searchParams;asked=query.get('scope')!;
  setTimeout(()=>{void fetch(query.get('redirect_uri')!+'?'+new URLSearchParams({code:'code-'+opened.length,state:query.get('state')!})).then(response=>response.text());},10);
 };
 const source=new ServiceSource({vault,fetch:fakeFetch as typeof fetch,openExternal:browser,google});
 const links=new ServiceSourceConnections(source,()=>{throw Error('Search Console is read here');},()=>'hermes');
 const connected:any[]=[],stages:string[]=[];
 const connect=(token='')=>links.connect({provider:'search-console',target:'',endpoint:'',token,settings:{},home:temp,onStage:stage=>stages.push(stage),onConnected:c=>connected.push(c)});

 // Mail and Calendar are already connected through Google.
 values.set('google',JSON.stringify({token:'access-0',refresh_token:'refresh-0',scopes:[GOOGLE_SCOPES.gmail,GOOGLE_SCOPES['google-calendar']],expiry:Date.now()+3_600_000}));
 assert.equal(source.connected('search-console'),false);
 await connect();
 assert.equal(opened.length,1,'the Google sign-in opens once');
 const consent=new URL(opened[0]).searchParams;
 assert.equal(consent.get('client_id'),'client-1.apps.example.com');
 assert.match(consent.get('redirect_uri')!,/^http:\/\/127\.0\.0\.1:\d+\/$/);
 assert.equal(consent.get('code_challenge_method'),'S256');
 assert.deepEqual(consent.get('scope')!.split(' '),[GOOGLE_SCOPES['google-calendar'],GOOGLE_SCOPES.gmail,SEARCH_CONSOLE_SCOPE,'https://www.googleapis.com/auth/userinfo.email','https://www.googleapis.com/auth/userinfo.profile','openid'].sort(),
  'only Search Console\'s read permission is added; Mail and Calendar stay');
 assert.deepEqual(stages,['browser']);
 assert.deepEqual(connected,[{provider:'search-console',target:'Search Console',transport:'hermes',connector:'service'}]);
 assert.deepEqual(JSON.parse(values.get('service:search-console')!),{v:1,settings:{},token:'',google:true},'the vault says only that it reads with Google');
 assert.equal(api.at(-1)!.authorization,'Bearer access-1','the check read went with the Google sign-in');
 assert.deepEqual(account.services(),['gmail','google-calendar'],'Mail and Calendar are still allowed');

 // Reads use the Google sign-in's access token; a 401 renews it once.
 const sites=await source.read('search-console',{operation:'list'});
 assert.deepEqual((sites.records as any[]).map(record=>record.id),['sc-domain:example.com']);
 assert.match(String(sites.scope),/sites this connection can see/);
 unauthorizedOnce=true;
 await source.read('search-console',{operation:'query',id:'sc-domain:example.com'});
 assert.deepEqual(tokens.at(-1)!.grant_type,'refresh_token');
 assert.equal(api.at(-1)!.authorization,'Bearer access-2','renewed after a 401');
 await assert.rejects(source.read('search-console',{operation:'query',id:'https://example.org/'}),error=>(error as Error).message===SEARCH_CONSOLE_GATE.signInForbidden);
 assert.deepEqual(await source.test('search-console'),{ok:true,status:'connected'});

 // Connecting again with the permission already there opens no browser.
 await connect();
 assert.equal(opened.length,1,'no second sign-in');

 // Signing in to Mail again keeps Search Console's permission.
 revoked=true;
 await assert.rejects(source.read('search-console',{operation:'list'}).then(()=>{unauthorizedOnce=true;return source.read('search-console',{operation:'list'});}),error=>(error as Error).message===SEARCH_CONSOLE_GATE.signedOut);
 revoked=false;
 await account.connect(['gmail'],browser);
 assert.ok(new URL(opened.at(-1)!).searchParams.get('scope')!.split(' ').includes(SEARCH_CONSOLE_SCOPE),'a new Mail sign-in keeps Search Console');
 assert.equal(account.allows('search-console'),true);
 assert.equal((await source.read('search-console',{operation:'list'})).provider,'search-console');

 // Disconnect forgets Search Console only; the Google sign-in stays for Mail and Calendar.
 source.disconnect('search-console');
 assert.equal(values.has('service:search-console'),false);
 assert.equal(account.authorized(),true);
 await assert.rejects(source.read('search-console',{operation:'list'}),/Connect Search Console first/);
 // The Google sign-in no longer allows it (a disconnected Google): a kept entry does not count.
 values.set('service:search-console',JSON.stringify({v:1,settings:{},token:'',google:true}));
 account.disconnect(null);
 assert.equal(source.connected('search-console'),false);

 // No Google sign-in on this host: plain words, pointing to Advanced.
 const bare=new ServiceSource({vault:{...vault,get:()=>null},fetch:fakeFetch as typeof fetch,openExternal:browser});
 await assert.rejects(bare.connect('search-console','',{}),/cannot sign in with Google here\. Connect it under Advanced instead/);
 // Nothing a token: no access or refresh token in any Service entry.
 for(const [id,value] of values)if(id.startsWith('service:'))assert.doesNotMatch(value,/access-|refresh-/,id);
});
console.log('PASS Search Console through Google sign-in: a tile of its own into Work, only the read-only permission added on a loopback address with PKCE, nothing but "reads with Google" in the vault, reads with the Google access token renewed after a 401, plain words when signed out or the site is not theirs, a new Mail sign-in keeps it, Disconnect keeps the Google sign-in, and a host with no Google sign-in points to Advanced');
