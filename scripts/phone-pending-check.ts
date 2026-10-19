import assert from 'node:assert/strict';
import {boxPlace,pairKeys,readPairLink,sealBox} from '../agent/base/index.ts';
import {createLocalRelay} from '../platform/electron/src/modules/shell/local-relay.ts';
import {createPhoneRelay} from '../platform/electron/src/modules/shell/relay.ts';

// A phone's message the computer cannot take yet (the World page not there, say) is kept on the computer and offered
// again, while the relay's cursor moves on: a message left on the relay came back at once on every long poll, about four
// requests a second, for as long as the computer could not take it (owner's traffic report 2026-10-14). The relay here
// is the in-memory one (local-relay.ts), which answers like worker/pairing.ts.
const local=createLocalRelay();
let requests=0;
const fetch=(async(input:string|URL|Request,init?:RequestInit)=>{requests++;return local.fetch(new Request(input,init));}) as typeof globalThis.fetch;
const store=new Map<string,string>(),vault={get:(id:string)=>store.get(id)??null,set:(id:string,v:string)=>{store.set(id,v);},delete:(id:string)=>{store.delete(id);}};
let taking=false;const delivered:string[]=[];
const make=()=>createPhoneRelay({fetch,vault,name:()=>'Mac',userAgent:'check',relay:'http://127.0.0.1:9',deliver:async message=>{if(!taking)return false;delivered.push(message.id);return true;}});
let relay=make();
const keys=await pairKeys(readPairLink((await relay.start()).link!).secret);
const phone=async(path:string,init:RequestInit={})=>{const r=await local.fetch(new Request('http://127.0.0.1:9'+path,{...init,headers:{Authorization:'Bearer '+keys.phoneToken,'Content-Type':'application/json'}}));assert.ok(r.ok,path+' '+r.status);return r.json();};
const say=async(value:object)=>phone(`/api/pair/${keys.id}/messages`,{method:'POST',body:JSON.stringify({box:await sealBox(keys,boxPlace('to','desktop'),{...value,at:new Date().toISOString()})})});
await phone(`/api/pair/${keys.id}`);
await relay.poll();
assert.equal(relay.status().state,'paired');

// Not taken: it arrives once, and the next long poll waits instead of answering at once with the same message.
await say({type:'attention',id:'a1',action:'done'});
assert.equal(await relay.poll(1),true);
assert.deepEqual(delivered,[]);
assert(store.get('phone-pairing-pending')?.includes('"a1"'),'the computer keeps it');
const before=requests,started=Date.now();
assert.equal(await relay.poll(1),false,'nothing new');
assert(Date.now()-started>=900,'the long poll waits');
assert.equal(requests-before,1);

// A restart keeps it; once the computer can take it, it is taken once.
relay=make();
taking=true;
await relay.poll();
assert.deepEqual(delivered,['a1']);
assert.equal(store.has('phone-pairing-pending'),false);

// Ending the pairing forgets what was kept.
taking=false;
await say({type:'chat',id:'c1',text:'hi'});
await relay.poll();
assert(store.has('phone-pairing-pending'));
await relay.end();
assert.equal(store.has('phone-pairing-pending'),false);
console.log('PASS a message the computer cannot take yet is kept on the computer: the long poll waits, a restart keeps it, it is taken then.');
