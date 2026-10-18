import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import path from 'node:path';
import {withTempDir} from './test-temp.ts';
import {WorldLedger} from '../platform/electron/src/store/ledger.ts';
import {createAgentAccess} from '../platform/electron/src/modules/agent-runtime/agent-access.ts';
import {openStandingWorldTools} from '../platform/electron/src/modules/agent-runtime/world-tool-bridge.ts';
import {REMOTE_MCP_VAULT,createRemoteMcpHost} from '../platform/electron/src/modules/agent-runtime/remote-mcp.ts';
import {WORLD_ADDRESS_VAULT,createWorldAddressHost} from '../platform/electron/src/modules/agent-runtime/world-address.ts';
import {WORLD_ADDRESS_LIMITS,addressNameFrom,derToRaw,readWorldAddressState,validAddressName,worldAddress} from '../core/agent/world-address.ts';
import {readRemoteMcpRequest,remoteConsentItemId} from '../core/agent/remote-mcp.ts';
import {roomDenied} from '../contracts/web-world.ts';
import {projectWorldItems} from '../context/items/world-items.ts';

// One address per World on the host (core/agent/WORLD-ADDRESS.md), with the website played by a fake registry and the
// front by a fake WebSocket, and passkeys made here with node:crypto as a browser's authenticator makes them. The name
// is claimed with remote access's host token; the page's requests arrive as `address` frames and only the address
// server answers them; a browser asks with a fresh passkey and a code, the person allows it on the card, and its
// passkey then signs in and is handed the World's link. Every refusal is checked: another origin or site, a reused or
// unknown challenge, a wrong signature, a copied passkey, a visitor outside what was shared, a request for a name this
// World gave up, a signed-out browser. Nothing a browser could reuse reaches an item, the ledger or the log.
const say=(line:string)=>{process.stdout.write(line+'\n');};
// A hard stop that names what was still open (scripts/remote-mcp-check.ts does the same): a check waiting on
// something that never comes fails here instead of holding a release host's lane.
const watchdog=setTimeout(()=>{process.stderr.write(`FAIL world-address-check: no result after 90 s; still open: ${process.getActiveResourcesInfo().join(', ')}\n`);process.exit(1);},90_000);watchdog.unref();
const b64=(bytes:Uint8Array|Buffer)=>Buffer.from(bytes).toString('base64url');
const sha=(data:string|Uint8Array)=>crypto.createHash('sha256').update(data).digest();
class FakeSocket {
 static last:FakeSocket|null=null;
 readyState=0;sent:string[]=[];url:string;protocols:string[];
 onopen:((e:unknown)=>void)|null=null;onmessage:((e:{data:unknown})=>void)|null=null;onclose:((e:{code?:number})=>void)|null=null;onerror:((e:unknown)=>void)|null=null;
 constructor(url:string,protocols:string[]){this.url=url;this.protocols=protocols;FakeSocket.last=this;}
 open(){this.readyState=1;this.onopen?.({});}
 send(data:string){this.sent.push(data);}
 close(){this.readyState=3;}
}
/** A browser's authenticator for one site: makes passkeys (ES256 or RS256) and signs in with them. */
function authenticator(rpId:string,origin:string,algorithm:-7|-257=-7){
 const pair=algorithm===-7?crypto.generateKeyPairSync('ec',{namedCurve:'P-256'}):crypto.generateKeyPairSync('rsa',{modulusLength:2048});
 const id=crypto.randomBytes(16);let counter=algorithm===-7?0:5;
 const auth=(flags:number,extra:Buffer=Buffer.alloc(0))=>{const c=Buffer.alloc(4);c.writeUInt32BE(counter);return Buffer.concat([sha(rpId),Buffer.from([flags]),c,extra]);};
 const client=(type:string,challenge:string,at=origin)=>Buffer.from(JSON.stringify({type,challenge,origin:at,crossOrigin:false}));
 return {
  id:b64(id),
  create(challenge:string,{at=origin,flags=0x45,claimedId=b64(id)}:{at?:string,flags?:number,claimedId?:string}={}){
   const attested=Buffer.concat([Buffer.alloc(16),Buffer.from([0,id.length]),id,Buffer.from([0xa5])]);
   return {id:claimedId,publicKey:b64(pair.publicKey.export({type:'spki',format:'der'})),algorithm,clientDataJSON:b64(client('webauthn.create',challenge,at)),authenticatorData:b64(auth(flags,attested))};
  },
  get(challenge:string,{at=origin,flags=0x05,step=1,key=pair.privateKey}:{at?:string,flags?:number,step?:number,key?:crypto.KeyObject}={}){
   counter+=algorithm===-7?0:step;
   const data=client('webauthn.get',challenge,at),ad=auth(flags);
   const signature=crypto.sign('sha256',Buffer.concat([ad,sha(data)]),algorithm===-7?{key,dsaEncoding:'der'}:key);
   return {id:b64(id),clientDataJSON:b64(data),authenticatorData:b64(ad),signature:b64(signature)};
  },
  rewind(){counter=0;},
 };
}

await withTempDir('worldlet-world-address-',async dir=>{
 const ledger=new WorldLedger(path.join(dir,'world'));
 let clock=Date.parse('2026-10-18T12:00:00.000Z');const now=()=>clock;
 const secrets=new Map<string,string>();
 const vault={get:(id:string)=>secrets.get(id)??null,set:(id:string,value:string)=>{secrets.set(id,value);},delete:(id:string)=>{secrets.delete(id);},deleteAll:()=>secrets.clear()};
 const access=createAgentAccess({root:path.join(dir,'access'),vault,ledger:()=>ledger,now:()=>new Date(clock).toISOString()});
 const logged:string[]=[];const original={log:console.log,error:console.error,warn:console.warn};
 for(const name of ['log','error','warn'] as const)console[name]=(...args:unknown[])=>{logged.push(args.map(String).join(' '));};
 const standing=await openStandingWorldTools({access,channel:async()=>({error:'not here'})});
 const remote=createRemoteMcpHost({vault,access,tools:()=>Promise.resolve(standing),ledger:()=>ledger,changed:()=>{},WebSocket:FakeSocket as any,now});
 // The website's registry, as worker/world-address.ts answers it: a name, and the hash of its World's room.
 const names=new Map<string,string>(),calls:{method:string;url:string;auth:string}[]=[];
 const keyOf=(token:string)=>sha(sha(token).toString('hex').slice(0,32)).toString('hex');
 const site=async(input:any,init:any={})=>{
  const url=String(input),method=init.method??'GET',auth=String(init.headers?.Authorization??'');calls.push({method,url,auth});
  const token=/^Bearer (.{43})$/.exec(auth)?.[1];
  if(method==='GET'){const name=url.split('/').pop()!;return Response.json({name,valid:validAddressName(name),available:!names.has(name)});}
  if(!token)return Response.json({error:'token'},{status:401});
  const key=keyOf(token);
  if(method==='DELETE'){for(const [n,k] of names)if(k===key)names.delete(n);return Response.json({released:[]});}
  const {name}=JSON.parse(init.body);
  if(names.has(name)&&names.get(name)!==key)return Response.json({error:'This name is taken. Choose another.',code:'taken'},{status:409});
  for(const [n,k] of names)if(k===key)names.delete(n);
  names.set(name,key);return Response.json({name,address:`https://${name}.worldlet.ai`},{status:201});
 };
 // A long random stand-in for the World link's secret, so the ledger check below can only match the secret itself.
 const linkSecret=()=>crypto.randomBytes(24).toString('base64url');
 let worldLinkSecret=linkSecret(),renewed=0;
 const firstLinkSecret=worldLinkSecret;
 const board={revision:1,definition:{title:'Team'},presets:[{id:'p',read:{query:'SELECT secret'}}],view:{title:'Team',tabs:[{id:'main',title:'Main',blocks:[{id:'n',title:'Users',kind:'number',preset:'p',status:'ok',number:{value:42}}]}],resolvedAt:'2026-10-18T12:00:00.000Z'}};
 const address=createWorldAddressHost({vault,remote,ledger:()=>ledger,changed:()=>{},fetch:site as any,now,
  worldLink:async()=>`https://worldlet.ai/world/2026.1018.4700/#v=1&s=${worldLinkSecret}&n=Studio+Mac&m=room`,
  renewWorldLink:async()=>{renewed+=1;worldLinkSecret=linkSecret();},board:async()=>board});
 try{
  // Names.
  for(const ok of ['kelvin','abc','team-board'])assert.ok(validAddressName(ok),ok);
  for(const bad of ['ab','a--b','xn--abc','-ab','ab-','www','mcp','Kelvin','x'.repeat(33)])assert.ok(!validAddressName(bad),bad);
  assert.equal(addressNameFrom(' Kelvin '),'kelvin');
  assert.equal(worldAddress('kelvin'),'https://kelvin.worldlet.ai');
  assert.equal(worldAddress('kelvin','http://localhost:8766'),'http://kelvin.localhost:8766');
  // The front's frame for the page: `kind: 'address'`, with the address's origin as base.
  const frame={t:'req',id:'1',method:'GET',base:'https://kelvin.worldlet.ai',path:'/hello',query:'',headers:{cookie:'x',authorization:'Bearer y'},body:'',kind:'address'};
  assert.deepEqual(readRemoteMcpRequest(JSON.stringify(frame)),{id:'1',method:'GET',base:'https://kelvin.worldlet.ai',path:'/hello',query:'',headers:{authorization:'Bearer y'},body:''+'',kind:'address'});
  assert.equal(readRemoteMcpRequest(JSON.stringify({...frame,kind:'other'}))?.kind,undefined);
  assert.equal(readRemoteMcpRequest(JSON.stringify({...frame,base:'http://kelvin.localhost:8766'}))?.base,'http://kelvin.localhost:8766');
  assert.equal(readRemoteMcpRequest(JSON.stringify({...frame,base:'http://evil.example'})),null);
  say('PASS names are 3 to 32 plain characters, never reserved; the front\'s address frames are read with their kind and origin.');

  // Choosing a name turns remote access on and claims it with the host token, first come, first served.
  assert.equal((await address.status()).name,null);
  assert.deepEqual(await address.check('Kelvin'),{name:'kelvin',valid:true,available:true});
  assert.deepEqual(await address.check('a--b'),{name:'a--b',valid:false,available:false});
  names.set('taken',keyOf('X'.repeat(43)));
  await assert.rejects(address.claim('taken'),/taken/);
  await assert.rejects(address.claim('no'),/3 to 32/);
  let status=await address.claim('kelvin');
  const {token}=JSON.parse(secrets.get(REMOTE_MCP_VAULT)!);
  assert.equal(names.get('kelvin'),keyOf(token),'claimed with the host token, which the website hashes');
  assert.equal(calls.at(-1)!.auth,'Bearer '+token);
  assert.deepEqual([status.name,status.address,status.remote],['kelvin','https://kelvin.worldlet.ai',true]);
  let ws=FakeSocket.last!;ws.open();
  assert.equal((await address.status()).reachable,true);
  say('PASS choosing a name turns remote access on and claims it on the website with the host token; a taken name is refused.');

  // The page's requests, as the front sends them over remote access's connection.
  let next=0;
  async function page(method:string,pathname:string,{body,query='',bearer='',base='https://kelvin.worldlet.ai'}:{body?:unknown,query?:string,bearer?:string,base?:string}={}){
   const id='a'+(next++),before=ws.sent.length;
   ws.onmessage!({data:JSON.stringify({t:'req',id,method,base,path:pathname,query,headers:{'content-type':'application/json',...bearer?{authorization:'Bearer '+bearer}:{}},body:body===undefined?'':JSON.stringify(body),kind:'address'})});
   const find=()=>ws.sent.slice(before).map(d=>JSON.parse(d)).find(f=>f.t==='res'&&f.id===id);
   const started=Date.now();let answer=find();
   while(!answer&&Date.now()-started<10_000){await new Promise(r=>setTimeout(r,5));answer=find();}
   assert.ok(answer,`no answer to ${method} ${pathname}`);
   return {status:answer.status as number,json:()=>JSON.parse(answer.body)};
  }
  assert.deepEqual((await page('GET','/hello')).json(),{v:1,name:'kelvin'});
  assert.equal((await page('GET','/hello',{base:'https://other.worldlet.ai'})).status,404,'another name is no one\'s here');
  // An MCP client's request never reaches the address server, nor the page's the MCP server.
  // Its answer by id, not whatever was sent last; a slow host gets 10 s, as in page().
  const before=ws.sent.length;ws.onmessage!({data:JSON.stringify({...frame,id:'m',kind:undefined,path:'/hello'})});
  const mcpAnswer=()=>ws.sent.slice(before).map(d=>JSON.parse(d)).find(f=>f.t==='res'&&f.id==='m');
  const mcpStarted=Date.now();let mcp=mcpAnswer();
  while(!mcp&&Date.now()-mcpStarted<10_000){await new Promise(r=>setTimeout(r,5));mcp=mcpAnswer();}
  assert.ok(mcp,'no answer to the MCP client\'s request');
  assert.equal(mcp.status,404);
  say('PASS the page\'s requests reach only the address server, for the name this World holds.');

  // The owner's new browser: a passkey made for this address, a code, a card; Allow; then the passkey signs in.
  const origin='https://kelvin.worldlet.ai',laptop=authenticator('kelvin.worldlet.ai',origin);
  const options=async(purpose:string)=>(await page('POST','/passkey/options',{body:{purpose}})).json();
  let o=await options('register');
  assert.equal(o.rpId,'kelvin.worldlet.ai');assert.match(o.challenge,/^[A-Za-z0-9_-]{43}$/);assert.match(o.user.id,/^[A-Za-z0-9_-]{22}$/);
  // Refused: another site's answer, a challenge for something else, a reused challenge, a credential that was not made.
  assert.match((await page('POST','/access',{body:{challengeId:o.id,label:'Laptop',credential:laptop.create(o.challenge,{at:'https://evil.example'})}})).json().error,/another site/);
  assert.match((await page('POST','/access',{body:{challengeId:o.id,label:'Laptop',credential:laptop.create(o.challenge)}})).json().error,/ran out/,'a challenge works once');
  o=await options('register');
  assert.match((await page('POST','/access',{body:{challengeId:o.id,label:'Laptop',credential:laptop.create('x'.repeat(43))}})).json().error,/another request/);
  o=await options('register');
  assert.equal((await page('POST','/access',{body:{challengeId:o.id,label:'Laptop',credential:laptop.create(o.challenge,{claimedId:b64(crypto.randomBytes(16))})}})).status,400);
  o=await options('register');
  assert.match((await page('POST','/access',{body:{challengeId:o.id,label:'Laptop',credential:laptop.create(o.challenge,{flags:0x44})}})).json().error,/without anyone present/);
  const signinOptions=await options('signin');
  assert.match((await page('POST','/access',{body:{challengeId:signinOptions.id,label:'Laptop',credential:laptop.create(signinOptions.challenge)}})).json().error,/ran out/,'a sign-in challenge makes no passkey');
  o=await options('register');
  let asked=await page('POST','/access',{body:{challengeId:o.id,label:'Chrome on Mac',credential:laptop.create(o.challenge)}});
  assert.equal(asked.status,200);
  const request=asked.json();assert.match(request.code,/^\d{4}$/);
  const item=ledger.value('items',remoteConsentItemId(request.id))!;
  assert.equal(item.title,'Allow Chrome on Mac to open your World?');assert.match(String(item.summary),new RegExp(`code ${request.code}`));
  const projected={pages:[] as any[],roots:['root']};projectWorldItems(projected,[item]);
  assert.deepEqual(projected.pages[0].worldItemRemoteConsent,{id:request.id,client:'Chrome on Mac',code:request.code,returnsTo:'kelvin.worldlet.ai',status:'pending',asks:'owner'});
  assert.notEqual(roomDenied({action:'remoteMcp',operation:'allow'}),'','only this computer\'s pages answer it');
  assert.notEqual(roomDenied({action:'worldAddress',operation:'share'}),'');
  // Before Allow: the passkey signs nothing in.
  o=await options('signin');
  assert.equal((await page('POST','/signin',{body:{challengeId:o.id,credential:laptop.get(o.challenge)}})).status,401);
  const waiting=page('GET','/access/wait',{query:'id='+request.id});
  assert.deepEqual(remote.decide(request.id,true),{ok:false,error:'This request is no longer waiting. Start connecting again from the connector.'},'a connector\'s decide does not answer it');
  assert.deepEqual(address.decide(request.id,true),{ok:true,status:'allowed'});
  assert.deepEqual((await waiting).json(),{status:'allowed'});
  assert.equal(ledger.value('items',remoteConsentItemId(request.id))!.status,'done');
  assert.deepEqual(address.decide(request.id,true),{ok:false,error:'This request is no longer waiting. Ask again from the browser.'});
  o=await options('signin');
  let signed=await page('POST','/signin',{body:{challengeId:o.id,credential:laptop.get(o.challenge)}});
  assert.equal(signed.status,200);
  let session=signed.json();
  assert.deepEqual(session.who,{kind:'owner',name:'Chrome on Mac'});
  assert.deepEqual(session.world,{path:'/world/2026.1018.4700/',fragment:`v=1&s=${firstLinkSecret}&n=Studio+Mac&m=room`});
  assert.match(session.session,/^[A-Za-z0-9_-]{43}$/);
  status=await address.status();
  assert.deepEqual(status.devices.map(d=>d.name),['Chrome on Mac']);
  say('PASS a new browser asks with a passkey made for this address and a code; only Allow on this computer\'s card lets it sign in, and it is handed the World\'s link.');

  // Refused sign-ins: another site, a wrong key, a reused challenge, a copied passkey (its counter went back).
  o=await options('signin');
  assert.match((await page('POST','/signin',{body:{challengeId:o.id,credential:laptop.get(o.challenge,{at:'https://kelvin.worldlet.ai.evil.example'})}})).json().error,/another site/);
  o=await options('signin');
  const stranger=crypto.generateKeyPairSync('ec',{namedCurve:'P-256'}).privateKey;
  assert.equal((await page('POST','/signin',{body:{challengeId:o.id,credential:laptop.get(o.challenge,{key:stranger})}})).status,401);
  assert.equal((await page('POST','/signin',{body:{challengeId:o.id,credential:laptop.get(o.challenge)}})).status,400,'a challenge works once');
  const phone=authenticator('kelvin.worldlet.ai',origin,-257);
  o=await options('register');
  asked=await page('POST','/access',{body:{challengeId:o.id,label:'Phone',credential:phone.create(o.challenge)}});
  address.decide(asked.json().id,true);
  o=await options('signin');
  assert.equal((await page('POST','/signin',{body:{challengeId:o.id,credential:phone.get(o.challenge)}})).status,200,'RS256 passkeys too');
  phone.rewind();
  o=await options('signin');
  assert.match((await page('POST','/signin',{body:{challengeId:o.id,credential:phone.get(o.challenge)}})).json().error,/copied/);
  // DER to raw: leading zeros and short integers.
  assert.equal(derToRaw(Uint8Array.from([0x30,6,2,1,1,2,1,2]))?.length,64);
  assert.equal(derToRaw(Uint8Array.from([0x30,6,2,1,1,2,1])),null);
  say('PASS sign-ins from another site, with another key, on a used challenge or with a copied passkey are refused; ES256 and RS256 passkeys work.');

  // Sharing the board: invite-only and open; a visitor asks with their own passkey; what they see is read only.
  status=await address.share(false);
  const invite=status.shares[0];
  assert.match(invite.link!,/^https:\/\/kelvin\.worldlet\.ai\/s\/[A-Za-z0-9_-]{22}$/);
  assert.deepEqual((await page('GET','/share',{query:'id='+invite.id})).json(),{id:invite.id,title:'Board',kind:'board',open:false});
  assert.equal((await page('GET','/share',{query:'id=nothing-here-at-all'})).status,404);
  assert.equal((await page('GET','/view',{query:'share='+invite.id})).status,401,'invite-only: nothing without signing in');
  const sam=authenticator('kelvin.worldlet.ai',origin);
  o=await options('register');
  asked=await page('POST','/access',{body:{challengeId:o.id,label:'Sam',share:invite.id,credential:sam.create(o.challenge)}});
  const samAsk=asked.json();
  const samItem=ledger.value('items',remoteConsentItemId(samAsk.id))!;
  assert.equal(samItem.title,'Sam wants to see your Board');assert.equal(samItem.remoteConsentAsks,'visitor');
  address.decide(samAsk.id,true);
  o=await options('signin');
  signed=await page('POST','/signin',{body:{challengeId:o.id,credential:sam.get(o.challenge)}});
  const samSession=signed.json();
  assert.deepEqual([samSession.who,samSession.world,samSession.shares],[{kind:'visitor',name:'Sam'},undefined,[{id:invite.id,title:'Board'}]],'a visitor gets no World link');
  let viewed=await page('GET','/view',{query:'share='+invite.id,bearer:samSession.session});
  assert.equal(viewed.status,200);
  assert.deepEqual(viewed.json(),{title:'Board',kind:'board',board:board.view},'only the board as shown, never its presets or reads');
  assert.doesNotMatch(JSON.stringify(viewed.json()),/SELECT secret/);
  status=await address.share(true);
  const open=status.shares.find(s=>s.open)!;
  assert.equal((await page('GET','/view',{query:'share='+open.id})).status,200,'an open share needs no sign-in');
  assert.equal((await page('GET','/view',{query:'share='+open.id,bearer:samSession.session})).status,200);
  const second=(await address.share(false)).shares.at(-1)!;
  assert.equal((await page('GET','/view',{query:'share='+second.id,bearer:samSession.session})).status,403,'a visitor sees only what they were allowed');
  assert.equal((await page('GET','/view',{query:'share='+second.id,bearer:session.session})).status,200,'the owner sees every share');
  status=await address.status();
  assert.deepEqual(status.visitors.map(v=>[v.name,v.sees,!!v.seenAt]),[['Sam',['Board'],true]]);
  say('PASS a shared board is open to anyone with its link or only to people allowed on a card; visitors see only their share, read only, and get no World link.');

  // Revoke: removing a visitor or stopping a share ends their sessions; signing out a browser changes the World's link.
  await address.remove(status.visitors[0].id);
  assert.equal((await page('GET','/view',{query:'share='+invite.id,bearer:samSession.session})).status,401);
  o=await options('signin');
  assert.equal((await page('POST','/signin',{body:{challengeId:o.id,credential:sam.get(o.challenge)}})).status,401);
  status=await address.unshare(open.id);
  assert.equal((await page('GET','/view',{query:'share='+open.id})).status,404);
  const laptopId=status.devices.find(d=>d.name==='Chrome on Mac')!.id;
  await address.remove(laptopId);
  assert.equal(renewed,1,'the World\'s link for other devices changes');
  assert.equal((await page('GET','/view',{query:'share='+invite.id,bearer:session.session})).status,401);
  o=await options('signin');
  assert.equal((await page('POST','/signin',{body:{challengeId:o.id,credential:laptop.get(o.challenge)}})).status,401);
  say('PASS removing a person, stopping a share and signing out a browser end their access at once; a signed-out browser\'s World link is replaced.');

  // Denied and expired requests; the limit on waiting requests.
  o=await options('register');
  const denied=(await page('POST','/access',{body:{challengeId:o.id,label:'Unknown',credential:authenticator('kelvin.worldlet.ai',origin).create(o.challenge)}})).json();
  address.decide(denied.id,false);
  assert.deepEqual((await page('GET','/access/wait',{query:'id='+denied.id})).json(),{status:'denied'});
  for(let i=0;i<WORLD_ADDRESS_LIMITS.requests;i++){o=await options('register');assert.equal((await page('POST','/access',{body:{challengeId:o.id,label:'Many',credential:authenticator('kelvin.worldlet.ai',origin).create(o.challenge)}})).status,200);}
  o=await options('register');
  assert.equal((await page('POST','/access',{body:{challengeId:o.id,label:'Many',credential:authenticator('kelvin.worldlet.ai',origin).create(o.challenge)}})).status,429);
  clock+=WORLD_ADDRESS_LIMITS.requestSeconds*1000+1;
  o=await options('register');
  const late=await page('POST','/access',{body:{challengeId:o.id,label:'Later',credential:authenticator('kelvin.worldlet.ai',origin).create(o.challenge)}});
  assert.equal(late.status,200,'expired requests no longer count');
  say('PASS denied requests say so, at most '+WORLD_ADDRESS_LIMITS.requests+' wait at once, and they run out.');

  // A new remote address moves the name to the new host token; a rename starts sign-ins over; giving it up frees it.
  await remote.renew();
  ws=FakeSocket.last!;ws.open();
  const fresh=JSON.parse(secrets.get(REMOTE_MCP_VAULT)!).token;
  assert.equal(names.get('kelvin'),keyOf(fresh));
  status=await address.claim('kelvin-studio');
  assert.equal(names.has('kelvin'),false);assert.equal(names.get('kelvin-studio'),keyOf(fresh));
  assert.deepEqual([status.devices.length,status.visitors.length],[0,0],'passkeys belong to the old address');
  status=await address.release();
  assert.equal(status.name,null);assert.equal(names.size,1,'only the other World\'s name is left');
  assert.equal((await page('GET','/hello',{base:'https://kelvin-studio.worldlet.ai'})).status,404);
  say('PASS New address keeps the name on the new host token; renaming starts sign-ins over; giving the name up frees it on the website.');

  // Nothing a browser could reuse is kept outside the vault or logged; the vault keeps public keys, never sessions.
  const kept=JSON.stringify(readWorldAddressState(JSON.parse(secrets.get(WORLD_ADDRESS_VAULT)!)));
  for(const secret of [session.session,samSession.session,fresh,token])assert.ok(!kept.includes(secret));
  const rows=JSON.stringify(ledger.remoteConsents())+JSON.stringify(ledger.value('items',remoteConsentItemId(request.id)));
  for(const secret of [session.session,samSession.session,fresh,token,firstLinkSecret,worldLinkSecret])assert.ok(!rows.includes(secret),'nothing reusable in the ledger');
  assert.ok(!logged.join('\n').includes(session.session));
  say('PASS sessions and tokens are in no item, ledger row or log line; the vault keeps only public keys.');
 }finally{
  for(const name of ['log','error','warn'] as const)console[name]=original[name];
  // Windows keeps an open database locked, so the temporary folder could not be removed and the run never ended.
  remote.close();standing.close?.();ledger.close();
 }
});
