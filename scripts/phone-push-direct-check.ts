import assert from 'node:assert/strict';
import {PUSH_BOX_PLACE,boxPlace,openBox,pairKeys,phoneDesktop,readPairLink,readPhoneMessage,sealBox} from '../agent/windows/index.ts';
import {createLocalRelay} from '../platform/electron/src/modules/phone/local-relay.ts';
import {createPhoneRelay} from '../platform/electron/src/modules/phone/relay.ts';

// The phone's notification token kept on the computer (agent/windows/README.md#push): the phone hands it over with a sealed
// `push` message, the computer keeps it in its vault and never delivers it, and a notification goes to the relay's
// stateless `/api/push` with the token and the box. A relay without `/api/push` (404) gets the old `/notify`, and the
// pairing stays. The relay here is the in-memory one (local-relay.ts) with `/api/push` added when `direct` is on.
const APNS='a'.repeat(64),FCM='f'.repeat(40);
assert.deepEqual(readPhoneMessage({type:'push',id:'p1',platform:'apns',token:APNS}),{type:'push',id:'p1',platform:'apns',token:APNS});
assert.deepEqual(readPhoneMessage({type:'push',id:'p2',platform:'fcm',token:FCM}),{type:'push',id:'p2',platform:'fcm',token:FCM});
assert.deepEqual(readPhoneMessage({type:'push',id:'p3',platform:'',token:''}),{type:'push',id:'p3',platform:'',token:''},'an empty token takes it back');
assert.equal(readPhoneMessage({type:'push',id:'p4',platform:'apns',token:'not hex'}),null);
assert.equal(readPhoneMessage({type:'push',id:'p5',platform:'web',token:APNS}),null);
assert.equal(readPhoneMessage({type:'push',id:'p6',platform:'fcm',token:''}),null);
assert.equal(phoneDesktop({name:'Mac',version:'1'},0).push,true,'the computer says it keeps the token');

const local=createLocalRelay();
let direct=true,gone=false;
const sent:any[]=[];
const fetch=(async(input:string|URL|Request,init?:RequestInit)=>{
 const request=new Request(input,init);
 if(new URL(request.url).pathname==='/api/push'){
  if(!direct)return new Response(JSON.stringify({error:'Not found'}),{status:404});
  sent.push({...await request.json(),auth:request.headers.get('Authorization')});
  return Response.json(gone?{sent:false,reason:'device-gone'}:{sent:true});
 }
 return local.fetch(request);
}) as typeof globalThis.fetch;
const store=new Map<string,string>(),vault={get:(id:string)=>store.get(id)??null,set:(id:string,v:string)=>{store.set(id,v);},delete:(id:string)=>{store.delete(id);}};
const delivered:any[]=[];
const make=()=>createPhoneRelay({fetch,vault,name:()=>'Mac',userAgent:'check',relay:'http://127.0.0.1:9',deliver:async message=>{delivered.push(message);return true;}});
let relay=make();
const status=await relay.start();
const keys=await pairKeys(readPairLink(status.link!).secret);
const phone=async(path:string,init:RequestInit={})=>{const r=await local.fetch(new Request('http://127.0.0.1:9'+path,{...init,headers:{Authorization:'Bearer '+keys.phoneToken,'Content-Type':'application/json'}}));assert.ok(r.ok,path+' '+r.status);return r.json();};
const say=async(value:object)=>phone(`/api/pair/${keys.id}/messages`,{method:'POST',body:JSON.stringify({box:await sealBox(keys,boxPlace('to','desktop'),{...value,at:new Date().toISOString()})})});
await phone(`/api/pair/${keys.id}`);
await relay.poll();
assert.equal(relay.status().state,'paired');
const push={v:1 as const,id:'n1',at:Date.now(),kind:'fox' as const,title:'Fox',body:'Done',open:{conversation:true as const}};
assert.deepEqual(await relay.notify(push),{sent:false,reason:'no-device'},'without a token the relay is asked, as before');
assert.equal(sent.length,0);

await say({type:'push',id:'t1',platform:'apns',token:APNS});
await say({type:'chat',id:'c1',text:'hi'});
assert.equal(await relay.poll(),true);
assert.deepEqual(delivered.map(m=>m.type),['chat'],'the token is never delivered to the page');
assert.deepEqual(relay.status().push,{platform:'apns'});
assert.deepEqual(JSON.parse(store.get('phone-pairing-push')!),{platform:'apns',token:APNS});

assert.deepEqual(await relay.notify(push,'fox-1'),{sent:true});
assert.equal(sent.length,1);
assert.equal(sent[0].pair,keys.id);assert.equal(sent[0].platform,'apns');assert.equal(sent[0].token,APNS);assert.equal(sent[0].collapse,'fox-1');
assert.deepEqual(await openBox(keys,PUSH_BOX_PLACE,sent[0].box),push,'the box is sealed whole');

// A restart keeps the token.
relay=make();
assert.deepEqual(relay.status().push,{platform:'apns'});
assert.deepEqual(await relay.notify(push),{sent:true});
assert.equal(sent.length,2);

// A relay without /api/push: the old /notify, and the pairing stays.
direct=false;
assert.deepEqual(await relay.notify(push),{sent:false,reason:'no-device'});
assert.equal(relay.status().state,'paired');
direct=true;

// A new token replaces it; a gone device is forgotten.
await say({type:'push',id:'t2',platform:'fcm',token:FCM});
await relay.poll();
assert.deepEqual(relay.status().push,{platform:'fcm'});
gone=true;
assert.deepEqual(await relay.notify(push),{sent:false,reason:'device-gone'});
assert.equal(relay.status().push,null);
assert.equal(store.has('phone-pairing-push'),false);
gone=false;

// The phone takes it back; ending the pairing forgets it too.
await say({type:'push',id:'t3',platform:'apns',token:APNS});
await relay.poll();
assert.deepEqual(relay.status().push,{platform:'apns'});
await say({type:'push',id:'t4',platform:'',token:''});
await relay.poll();
assert.equal(relay.status().push,null);
assert.equal(store.has('phone-pairing-push'),false);
await say({type:'push',id:'t5',platform:'apns',token:APNS});
await relay.poll();
assert.ok(store.has('phone-pairing-push'));
await relay.end();
assert.equal(store.has('phone-pairing-push'),false);

// A browser's pairing takes no token.
const web=createPhoneRelay({fetch,vault,name:()=>'Mac',userAgent:'check',relay:'http://127.0.0.1:9',kind:'web',deliver:async message=>{delivered.push(message);return true;}});
const webKeys=await pairKeys(readPairLink((await web.start()).link!,'web').secret);
const browser=async(path:string,init:RequestInit={})=>(await local.fetch(new Request('http://127.0.0.1:9'+path,{...init,headers:{Authorization:'Bearer '+webKeys.phoneToken,'Content-Type':'application/json'}}))).json();
await browser(`/api/pair/${webKeys.id}`);
await browser(`/api/pair/${webKeys.id}/messages`,{method:'POST',body:JSON.stringify({box:await sealBox(webKeys,boxPlace('to','desktop'),{type:'push',id:'w1',platform:'apns',token:APNS})})});
delivered.length=0;
await web.poll();
assert.deepEqual(delivered,[]);
assert.equal(store.has('web-pairing-push'),false);
await web.end();

console.log('PASS phone push: the token stays on the computer, notifications go through the stateless /api/push, older relays still work.');
