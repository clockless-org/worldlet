import assert from 'node:assert/strict';
import {PUSH_BOX_PLACE,boxPlace,openBox,pairKeys,readPairLink,readRoomFrame,roomEntry,sealBox,type PairKeys,type PhoneMessage} from '../core/phone/index.ts';
import {createLocalRelay} from '../platform/electron/src/modules/phone/local-relay.ts';
import {createPhoneRelay} from '../platform/electron/src/modules/phone/relay.ts';
import {memoryRoom} from './memory-room.ts';

// The phone's pairing in the pairing room (core/phone/README.md#room): the computer's code says `m=room` and the computer
// waits in the room as well as on the relay. An older app pairs on the relay as before. An app that comes to the room
// moves the pairing there, also one paired on the relay before: the relay's pairing is deleted, and slots, the phone's
// name and its messages pass only while both are connected; a phone that comes back gets everything at once. The
// notification token the phone handed over is the only way to wake it (no `/notify`). The relay here is the in-memory
// one (local-relay.ts) and the room memory-room.ts.
const RELAY='http://127.0.0.1:9',APNS='a'.repeat(64);
const local=createLocalRelay(),room=memoryRoom();
const calls:string[]=[];
const fetch=(async(input:string|URL|Request,init?:RequestInit)=>{
 const request=new Request(input,init),path=new URL(request.url).pathname;
 calls.push(request.method+' '+path.replace(/\/api\/pair\/[^/]+/,'/api/pair/:id'));
 if(path==='/api/push')return Response.json({sent:true,token:(await request.json()).token});
 return local.fetch(request);
}) as typeof globalThis.fetch;
const store=new Map<string,string>(),vault={get:(id:string)=>store.get(id)??null,set:(id:string,v:string)=>{store.set(id,v);},delete:(id:string)=>{store.delete(id);}};
const delivered:PhoneMessage[]=[];
const make=()=>createPhoneRelay({fetch,vault,name:()=>'Mac',userAgent:'check',relay:RELAY,room:{WebSocket:room.Socket as any},deliver:async message=>{delivered.push(message);return true;}});
const sleep=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
const until=async(ok:()=>boolean,what:string)=>{for(let i=0;i<100&&!ok();i++)await sleep(20);assert.ok(ok(),what);};
const relayGet=async(keys:PairKeys)=>(await local.fetch(new Request(`${RELAY}/api/pair/${keys.id}`,{headers:{Authorization:'Bearer '+keys.phoneToken}}))).status;

// A phone app in the room: what the computer sent, by slot, and whether the computer is there.
async function phone(keys:PairKeys){
 const slots=new Map<string,any>();let computer=false,ended=false;
 const {url,protocols}=await roomEntry(keys,RELAY,'phone'),ws=new room.Socket(url,protocols);
 ws.onmessage=async({data})=>{
  const event=JSON.parse(String(data));
  if(event.t==='desktop'){computer=event.online;return;}
  const frame=readRoomFrame(event.data);if(!frame)return;
  if('s' in frame)slots.set(frame.s,await openBox(keys,boxPlace('slot',frame.s),frame.b));
  if('e' in frame){await openBox(keys,boxPlace('slot','end'),frame.e);ended=true;}
 };
 await until(()=>ws.readyState===1,'the phone is in the room');
 const frame=(value:object)=>ws.send(JSON.stringify({data:JSON.stringify(value)}));
 return {slots,get computer(){return computer;},get ended(){return ended;},close:()=>ws.close(),
  name:async(name:string)=>frame({s:'phone',b:await sealBox(keys,boxPlace('slot','phone'),{v:1,name,version:'2'})}),
  say:async(value:object)=>frame({m:await sealBox(keys,boxPlace('to','desktop'),{...value,at:new Date().toISOString()})})};
}
const attention={v:1,at:new Date().toISOString(),now:[],later:[],accounts:[]};
const push={v:1 as const,id:'n1',at:Date.now(),kind:'fox' as const,title:'Fox',body:'Done',open:{conversation:true as const}};

// An older app scanning the code pairs on the relay, as before.
let mac=make();
let status=await mac.start();
assert.match(status.link!,/^worldlet:\/\/pair\?v=1&s=[A-Za-z0-9_-]{43}&n=Mac&r=http%3A%2F%2F127\.0\.0\.1%3A9&m=room$/);
let keys=await pairKeys(readPairLink(status.link!).secret);
assert.equal(await relayGet(keys),200,'the first poll completes the pairing on the relay');
await mac.poll();
assert.equal(mac.status().state,'paired');
assert.equal(await mac.publish('attention',attention),true);
assert.ok(calls.includes('PUT /api/pair/:id/slots/attention'),'an older app reads the relay');

// The app updates and comes to the room: the pairing moves there and the relay's copy is deleted.
const desktopSlot={v:1,at:new Date().toISOString(),name:'Mac',version:'1',push:true,room:true};
await mac.publish('desktop',desktopSlot);
let app=await phone(keys);
await until(()=>app.computer&&mac.open,'the computer meets the app');
await until(()=>app.slots.has('attention')&&app.slots.has('desktop'),'everything the computer has, at once');
assert.equal(app.slots.get('desktop').room,true);
await until(()=>store.get('phone-pairing')?.includes('"room":true')===true,'kept in the room');
await until(()=>calls.includes('DELETE /api/pair/:id'),'the relay pairing is deleted');
assert.equal(await relayGet(keys),404,'the relay keeps nothing more');
assert.ok((mac.status().seenAt??0)>Date.now()-1000,'a phone in the room is seen now');

// Slots, the name and messages pass while both are there; the token stays here and wakes the phone.
calls.length=0;
await mac.publish('conversation',{v:1,at:'',busy:false,name:'Fox',messages:[]});
await until(()=>app.slots.has('conversation'),'a slot reaches the app');
await app.name('Pixel');
await until(()=>mac.status().phone?.name==='Pixel','the phone says its name');
await app.say({type:'chat',id:'c1',text:'hello'});
await app.say({type:'push',id:'t1',platform:'apns',token:APNS});
await until(()=>delivered.length===1&&mac.status().push?.platform==='apns','a line and the token');
assert.deepEqual(delivered.map(m=>m.type),['chat']);
assert.ok(!calls.some(c=>c.startsWith('PUT')||c.includes('/messages')),'nothing goes to the relay');
assert.deepEqual(await mac.notify(push),{sent:true});
assert.deepEqual(calls.filter(c=>c.includes('push')||c.includes('notify')),['POST /api/push']);
await app.say({type:'chat',id:'c1',text:'hello'});
await mac.poll();
assert.equal(delivered.length,1,'a message is taken once');

// The app goes away: nothing is sent; when it comes back it gets the newest at once.
app.close();
await until(()=>!mac.open,'the app left');
assert.equal(await mac.publish('attention',{...attention,later:[{id:'x'}]}),false);
app=await phone(keys);
await until(()=>app.slots.get('attention')?.later?.length===1,'the newest on return');

// A restart keeps the pairing in the room.
app.close();
mac=make();
assert.equal(mac.status().state,'paired');
await mac.poll();
app=await phone(keys);
await until(()=>mac.open&&app.computer,'they meet again after a restart');
assert.deepEqual(await mac.notify(push),{sent:true},'the kept token still wakes it');
await app.say({type:'push',id:'t2',platform:'',token:''});
await until(()=>mac.status().push===null,'the token taken back');
calls.length=0;
assert.deepEqual(await mac.notify(push),{sent:false,reason:'no-device'});
assert.deepEqual(calls,[],'no relay to ask');

// Unpairing on the computer tells the app.
await mac.end();
await until(()=>app.ended,'the app hears the pairing is off');
assert.equal(store.has('phone-pairing'),false);

// A new code met in the room straight away: the relay pairing made with the code is deleted.
mac=make();
keys=await pairKeys(readPairLink((await mac.start()).link!).secret);
app=await phone(keys);
await until(()=>mac.status().state==='paired'&&mac.open,'paired in the room');
await until(()=>store.get('phone-pairing')?.includes('"room":true')===true&&calls.includes('DELETE /api/pair/:id'),'nothing left on the relay');
assert.equal(await relayGet(keys),404);
// The app unpairs: the computer forgets it.
await app.say({type:'chat',id:'c9',text:'bye'});
const endFrame=await sealBox(keys,boxPlace('slot','end'),{end:true});
const {url,protocols}=await roomEntry(keys,RELAY,'phone'),ws=new room.Socket(url,protocols);
await until(()=>ws.readyState===1,'a second connection');
ws.send(JSON.stringify({data:JSON.stringify({e:endFrame})}));
await until(()=>mac.status().state==='none','the computer forgets the pairing');
ws.close();app.close();
assert.equal(PUSH_BOX_PLACE,'push');

console.log('PASS phone room: an older app keeps the relay, an app in the room moves the pairing there and the relay keeps nothing, slots on return, the kept token wakes it.');
