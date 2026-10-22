import assert from 'node:assert/strict';
import {REMOTE_TURN_LIMITS,boxPlace,pairKeys,pairLink,readPairLink,sealBox,phoneDesktop,readRemoteToHost,readRemoteToClient,remoteAssembler,remoteHostInfo,remoteParts,remoteSessionWorld,remoteTurnRequest,fitRemoteView} from '../api/checks.ts';
import {harnessSessionThread,harnessThreadPlace} from '../api/checks.ts';
import {createPhoneRelay} from '../api/checks.ts';
import {createRemoteAgentHost} from '../api/checks.ts';
import {createRemoteAgentLink} from '../api/checks.ts';
import {RemoteHarnessRuntime} from '../api/checks.ts';
import {memoryRoom} from './memory-room.ts';
import {roomEntry} from '../platform/web/index.ts';

// Fox on another computer's Agent end to end without a second computer (the public web platform's README, Another computer's Agent):
// the pairing room in memory (memory-room.ts), the host's agent pairing (the phone module's pairing with `kind: 'agent'`)
// with its turn runner over a simulated Agent, and the client Worldlet's link and Harness runtime over a simulated World.
const room=memoryRoom(),WebSocket=room.Socket as any;
const noFetch=(async()=>{throw new Error('nothing goes to the relay');}) as typeof fetch;
const sleep=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
const store=()=>{const map=new Map<string,string>();return {map,vault:{get:(id:string)=>map.get(id)??null,set:(id:string,v:string)=>void map.set(id,v),delete:(id:string)=>void map.delete(id)}};};
type Row=Record<string,any>;

// A computer's code is its own kind of link: a phone refuses it, and the client refuses a phone's.
const secret=Uint8Array.from({length:32},(_,i)=>i);
const agentLink=pairLink({secret,name:'Mac mini',kind:'agent'}),phoneLink=pairLink({secret,name:'Mac mini'});
assert.match(agentLink,/^worldlet:\/\/agent\?v=1&s=AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8&n=Mac\+mini$/);
assert.deepEqual(readPairLink(agentLink,'agent'),{secret,relay:'https://worldlet.ai',name:'Mac mini'});
assert.throws(()=>readPairLink(agentLink),/not a Worldlet pairing code/);
assert.throws(()=>readPairLink(phoneLink,'agent'),/another computer/);
assert.deepEqual(await pairKeys(readPairLink(agentLink,'agent').secret),await pairKeys(readPairLink(phoneLink).secret),'the same keys and boxes as a phone');
console.log('PASS a computer’s code is a distinct link kind over the phone’s keys and boxes.');

// The shared rules: a session thread survives the trip, a view that is too large loses its largest parts first, and a
// message too long for one box (multi-byte text included) goes in parts that come back whole, in any order.
for(const thread of ['main','item:item-1','applet:notes'])assert.equal(harnessSessionThread(harnessThreadPlace(thread)),thread);
assert.deepEqual(Object.keys(fitRemoteView({here:{title:'Notes'},browsing:'x'.repeat(80_000)})),['here']);
const long={type:'done',id:'m1',at:Date.now(),turn:'t1',message:'狐'.repeat(70_000)+'x'.repeat(50_000)};
const pieces=remoteParts(long);
assert.ok(pieces.length===3&&pieces.every(p=>p.type==='part'),'260 KB of UTF-8 goes as three parts');
for(const piece of pieces)assert.ok(JSON.stringify(piece).length<REMOTE_TURN_LIMITS.partBytes*1.4+200);
const assembler=remoteAssembler();
const shuffled=[pieces[2],pieces[0],pieces[1]].map(p=>readRemoteToClient(p) as any);
assert.ok(shuffled.every(p=>p?.type==='part'));
assert.equal(assembler.add(shuffled[0]),null);assert.equal(assembler.add(shuffled[0]),null,'a repeated part adds nothing');
assert.equal(assembler.add(shuffled[1]),null);
assert.deepEqual(readRemoteToClient(assembler.add(shuffled[2])),long);
assert.deepEqual(remoteParts({id:'s',at:1,type:'cancel',turn:'t'}),[{id:'s',at:1,type:'cancel',turn:'t'}],'a short message goes as itself');
assert.throws(()=>remoteParts({id:'x',at:1,text:'y'.repeat(REMOTE_TURN_LIMITS.partBytes*REMOTE_TURN_LIMITS.parts+1)}),/too long/);
// What the host reads: a turn, a tool's answer, a cancel; nothing a phone sends.
for(const message of [{type:'chat',id:'c1',text:'Hi',at:Date.now()},{type:'attention',id:'item-1',action:'done',at:Date.now()},{type:'order',id:'o1',said:'ship it',at:Date.now()},{type:'widget',id:'w',at:Date.now()},{type:'turn',id:'t',at:Date.now(),text:'',thread:'main'},{type:'turn',id:'t',at:Date.now(),text:'Hi',thread:'elsewhere'},{type:'tool-result',id:'r',at:Date.now(),call:'c1',result:{}}])
 assert.equal(readRemoteToHost(message),null,JSON.stringify(message));
assert.equal(readRemoteToClient({type:'tool',id:'t',at:Date.now(),turn:'t1',call:'c1',name:'rm -rf /',args:{}}),null,'a tool name is a name');
assert.equal(readRemoteToHost({type:'approval-answer',id:'a',at:Date.now(),turn:'t1',approval:'p1',choice:'everything'}),null,'an answer is one of the choices');
console.log('PASS threads, views, parts and the messages each side reads.');

// The host: Worldlet on the always-on computer, its Agent simulated. A turn streams words and a step, asks for a World
// tool (which must come back from the client) and answers with what the tool said.
const hostVault=store(),bodies:Row[]=[],answered:[string,string][]=[];
let approvalLimit=60_000;
let agentRun:(body:Row,onEvent:(event:Row)=>Promise<Row|null>,signal:AbortSignal)=>Promise<Row>;
const defaultRun=async(body:Row,onEvent:(event:Row)=>Promise<Row|null>,_signal:AbortSignal)=>{
 bodies.push(body);
 await onEvent({type:'progress',name:'Looking at your notes'});
 const notes=await onEvent({type:'tool',id:'world-1',name:'open_applet',args:{applet:'notes'}});
 await onEvent({type:'approval',request:{id:'perm-1',title:'Run a command',choices:['once','deny']}});
 await onEvent({type:'response_start'});
 const reply=`Opened ${notes?.opened} on your laptop. `+'Long answer. '.repeat(Number(body.text.match(/\d+/)?.[0]??0));
 for(let i=0;i<reply.length;i+=1000)await onEvent({type:'delta',text:reply.slice(i,i+1000)});
 return {message:reply};
};
agentRun=defaultRun;
const toClient:Row[]=[],agentAnswers=new Map<string,(choice:string)=>void>();
const remoteHost=createRemoteAgentHost({send:message=>{toClient.push(message as Row);return host.send(message);},name:()=>'Mac mini',client:()=>host.status().phone?.name||'computer',
 agents:async()=>['main','writer'],answer:(id,choice)=>{answered.push([id,choice]);agentAnswers.get(id)?.(choice);},get approvalMs(){return approvalLimit;},gather:20,run:(body,onEvent,signal)=>agentRun(body,onEvent,signal)});
const delivered:string[]=[];
const host=createPhoneRelay({fetch:noFetch,vault:hostVault.vault,name:()=>'Mac mini',userAgent:'check',kind:'agent',read:readRemoteToHost,room:{WebSocket},
 deliver:message=>{delivered.push(message.type);return remoteHost.receive(message);}});
let hosting=true,advertise=true;
const hostLoop=(async()=>{while(hosting){await host.poll(0);if(host.paired){const desktop=phoneDesktop({name:'Mac mini',version:'2026.10.8'},Date.now());await host.publish('desktop',advertise?{...desktop,agent:remoteHostInfo([{id:'main',name:'Main',main:true},{id:'writer',name:'Writer',model:'opus'}])}:desktop);}await sleep(30);}})();

// The client: Worldlet on the laptop pastes the host's code. An older host, which lists no turn protocol, is refused.
const clientVault=store();let ended=0;
const client=createRemoteAgentLink({vault:clientVault.vault,name:()=>'Laptop',version:'2026.10.8',WebSocket,onEnded:()=>{ended++;}});
advertise=false;
let started=await host.start();
await assert.rejects(client.pair(started.link!),/too old/,'a host without the turn protocol is not paired');
advertise=true;
started=await host.start();
assert.equal(started.state,'waiting');assert.match(started.link!,/^worldlet:\/\/agent\?/);
await assert.rejects(client.pair(pairLink({secret:readPairLink(started.link!,'agent').secret,name:'Mac mini'})),/another computer/,'a phone code is refused');
await assert.rejects(client.pair(started.link!.replace('&m=room','')),/older Worldlet/,'a code from before the room is refused');
const paired=await client.pair(started.link!);
assert.deepEqual({...paired,seenAt:0},{state:'paired',computer:'Mac mini',version:'2026.10.8',seenAt:0});
assert.ok(Date.now()-paired.seenAt!<1000,'a host in the room is seen now');
await sleep(200);
assert.equal(host.status().state,'paired');assert.deepEqual(host.status().phone,{name:'Laptop',version:'2026.10.8'});
assert.ok(hostVault.map.has('agent-pairing')&&!hostVault.map.has('phone-pairing'),'the host keeps it beside, not instead of, the phone’s pairing');
assert.ok(clientVault.map.has('remote-agent'));
assert.deepEqual(client.agents(),[{id:'main',name:'Main',main:true},{id:'writer',name:'Writer',model:'opus'}],'the host’s agents reach the client for its Applet menus');
console.log('PASS the client pairs in the phone’s role, and the host answers with its slot and its agents.');

// The laptop's World, simulated: its World tools answer here, under its own turn.
const worldCalls:Row[]=[];
const world=async(event:Row)=>{if(event.type==='tool'){worldCalls.push(event);return {opened:'Laptop Notes'};}return null;};
const runtime=new RemoteHarnessRuntime(client,()=>({run:async(body:any)=>({message:'here:'+(body.mode??body.action)}),steer:async()=>false,cancel(){}}));
const events:Row[]=[];
const chat=(text:string,more:Row={})=>({action:'chat',mode:'chat',session:'fox-1',text,style:'You are Nova. The person likes short answers.',context:{here:{title:'Groceries',kind:'item'}},history:[{role:'user',text:'Earlier'},{role:'assistant',text:'Sure.'}],...more});
const result=await runtime.run(chat('What is on this card? 400',{thread:JSON.stringify(['attention:item-7','view']),harnessAgent:'writer'}),'/nonexistent',event=>{events.push(event);return world(event);});
const expected='Opened Laptop Notes on your laptop. '+'Long answer. '.repeat(400);
assert.equal(result.message,expected,'a reply longer than 4,000 characters arrives whole');
assert.equal(events.filter(e=>e.type==='delta').map(e=>e.text).join(''),expected,'and streams whole');
assert.deepEqual(worldCalls,[{type:'tool',id:'c1',name:'open_applet',args:{applet:'notes'}}],'the World tool ran in the laptop’s World');
assert.ok(events.some(e=>e.type==='progress'&&e.name==='Looking at your notes'));
const shown=events.find(e=>e.type==='approval');
assert.equal(shown?.request.id,'perm-1');assert.equal(shown?.request.title,'Run a command');assert.deepEqual(shown?.request.choices,['once','deny']);
assert.ok(shown?.request.expiresAt>Date.now(),'the prompt reached the laptop’s approval card with its deadline');
assert.deepEqual(answered,[['perm-1','deny']],'a prompt still open when the turn ends is declined');
const sent=bodies[0];
assert.equal(harnessSessionThread(sent.thread),'item:item-7','the item card’s own thread');
assert.equal(sent.harnessWorld,remoteSessionWorld('Laptop'));assert.equal(sent.harnessWorld,'remote:Laptop','apart from the host’s own threads');
assert.equal(sent.style,'You are Nova. The person likes short answers.','the laptop’s companion instructions');
assert.deepEqual(sent.context,{here:{title:'Groceries',kind:'item'}},'the laptop’s current view');
assert.deepEqual(sent.history,[{role:'user',text:'Earlier'},{role:'assistant',text:'Sure.'}]);
assert.equal(sent.harnessAgent,'writer');assert.equal(sent.session,'remote-fox-1');assert.equal(sent.mode,'chat');
console.log('PASS a turn carries the laptop’s instructions and view, runs in its thread’s session there, and its World tool runs here.');

// An Applet's thread, with an agent the host does not have; then a reply far past one box.
await runtime.run(chat('In the Applet 3',{thread:JSON.stringify(['object:app-notes','']),harnessAgent:'ghost'}),'/nonexistent',world);
assert.equal(harnessSessionThread(bodies[1].thread),'applet:notes');assert.equal(bodies[1].harnessAgent,undefined,'an agent the host lacks is not used');
assert.equal((await runtime.run(chat('Main 30000'),'/nonexistent',world)).message.length,'Opened Laptop Notes on your laptop. '.length+13*30000,'a 390 KB reply arrives whole');
assert.equal(harnessSessionThread(bodies[2].thread),'main');
// A long view and instructions go in parts and arrive whole.
const view={here:{title:'Big'},note:'é'.repeat(50_000)};
await runtime.run(chat('Parts 1',{style:'ü'.repeat(39_000),context:view}),'/nonexistent',world);
assert.deepEqual(bodies[3].context,view);assert.equal(bodies[3].style,'ü'.repeat(39_000));
assert.ok(delivered.includes('part'),'the long turn went in parts');
console.log('PASS Applet threads keep their own session, only the host’s agents are used, and long turns and replies go in parts.');

// Which turns stay on this computer's own Agent (background work went to the paired computer too in
// clockless-org/worldlet#81) is the app's to test, in that repository's scripts/remote-lanes-check.ts.
const status=await runtime.run({action:'status'},'/nonexistent') as Row;
assert.deepEqual(status.location,{kind:'remote',computer:'Mac mini'});assert.equal(status.capabilities.cancel,true);
console.log('PASS the remote Harness sends only Fox’s conversation and reports its location.');

// The host Agent's permission prompts are answered on the laptop's approval card: allow, deny, or no answer in time.
agentRun=async(body,onEvent)=>{
 bodies.push(body);
 const choice=await new Promise<string>(resolve=>{agentAnswers.set('perm-'+body.text,resolve);void onEvent({type:'approval',request:{id:'perm-'+body.text,title:'Send the email',detail:'mail ada@example.com',choices:['once','always','deny']}});});
 agentAnswers.delete('perm-'+body.text);
 await onEvent({type:'response_start'});await onEvent({type:'delta',text:'Choice: '+choice});
 return {message:'Choice: '+choice};
};
const adapterApprovals={answer:(id:string,choice:any)=>client.answer(id,choice)};
const card=(choice:string|null)=>async(event:Row)=>{
 if(event.type==='approval'&&choice){
  assert.equal(event.request.detail,'mail ada@example.com');
  setTimeout(()=>void adapterApprovals.answer(event.request.id,choice),50);
 }
 return null;
};
answered.length=0;
assert.equal((await runtime.run(chat('allow'),'/nonexistent',card('once'))).message,'Choice: once');
assert.equal((await runtime.run(chat('refuse'),'/nonexistent',card('deny'))).message,'Choice: deny');
approvalLimit=300;
assert.equal((await runtime.run(chat('silent'),'/nonexistent',card(null))).message,'Choice: deny');
assert.deepEqual(answered,[['perm-allow','once'],['perm-refuse','deny'],['perm-silent','deny']]);
await assert.rejects(client.answer('perm-silent','once'),/already answered or has expired/,'an answer after the turn is refused');
approvalLimit=60_000;
agentRun=defaultRun;
console.log('PASS the host Agent’s permission prompts are answered on the laptop: allow, deny, and no answer in time is Deny.');

// Stop on the laptop stops the turn on the host; a second turn meanwhile is refused there.
let hostSignal:AbortSignal|null=null,release:(()=>void)|null=null;
agentRun=async(body,onEvent,signal)=>{
 bodies.push(body);hostSignal=signal;
 await onEvent({type:'response_start'});await onEvent({type:'delta',text:'Thinking'});
 await new Promise<void>((resolve,reject)=>{release=resolve;signal.addEventListener('abort',()=>reject(Object.assign(new Error('Cancelled.'),{name:'AbortError'})));});
 return {message:'late'};
};
const stopped:Row[]=[];
const slow=runtime.run(chat('Slow one'),'/nonexistent',event=>void stopped.push(event));
for(let i=0;i<100&&!stopped.some(e=>e.type==='delta');i++)await sleep(30);
assert.ok(stopped.some(e=>e.type==='delta'&&e.text==='Thinking'),'the host’s words reach the laptop while it works');
await remoteHost.receive(remoteTurnRequest(chat('Meanwhile'),{id:'meanwhile',at:Date.now()}));
for(let i=0;i<100&&!toClient.some(m=>m.turn==='meanwhile');i++)await sleep(30);
assert.match(toClient.find(m=>m.turn==='meanwhile')?.error??'',/still answering your other message/,'a second turn meanwhile is refused');
runtime.cancel();
await assert.rejects(slow,(e:any)=>e.name==='AbortError');
for(let i=0;i<100&&!hostSignal!.aborted;i++)await sleep(30);
assert.ok(hostSignal!.aborted,'the host’s turn was stopped');
for(let i=0;i<100&&remoteHost.busy;i++)await sleep(30);
assert.equal(remoteHost.busy,false);void release;
console.log('PASS Stop on the laptop cancels the host’s turn, and one turn runs there at a time.');

// The host takes nothing a phone sends from the laptop, and a tool answer for another turn is ignored.
agentRun=defaultRun;
const keys=await pairKeys(readPairLink(started.link!,'agent').secret);
const ran=bodies.length;delivered.length=0;
const {url,protocols}=await roomEntry(keys,'https://worldlet.ai','phone'),other=new WebSocket(url,protocols);
for(let i=0;i<100&&other.readyState!==1;i++)await sleep(10);
const say=async(message:object)=>other.send(JSON.stringify({data:JSON.stringify({m:await sealBox(keys,boxPlace('to','desktop'),message)})}));
for(const message of [{type:'attention',id:'item-1',action:'done'},{type:'chat',id:'c9',text:'On the card',item:'item-1'},{type:'order',id:'o1',said:'ship it'},{type:'tool-result',id:'x',at:Date.now(),turn:'nope',call:'c1',result:{}}])await say(message);
// The tool answer went last, so once it arrives the others had their chance.
for(let i=0;i<100&&!delivered.includes('tool-result');i++)await sleep(30);
assert.deepEqual(delivered,['tool-result'],'phone messages are not even read');
assert.equal(bodies.length,ran,'and no turn ran');
// A turn sealed long ago does not run when it finally arrives.
await say(remoteTurnRequest(chat('Old'),{id:'old',at:Date.now()-10*60_000}));
await sleep(300);
assert.equal(bodies.length,ran,'a late turn does not run');
other.close();
console.log('PASS the host carries out only its client’s turns, tool answers and cancels.');

// A host that is away gets no turn: the client says so, since nothing waits in the room.
hosting=false;await hostLoop;
room.dropDesktop();
for(let i=0;i<100&&client.status().seenAt!==null&&Date.now()-client.status().seenAt!<50;i++)await sleep(10);
delivered.length=0;
await assert.rejects(client.turn(chat('Are you there?'),()=>{}),/Mac mini is away/);
assert.deepEqual(delivered,[],'nothing was sent');
console.log('PASS a host that is away is reported, not queued for.');

// Unpairing on the host ends it on the client, which hears it in the room.
await host.poll(0);
for(let i=0;i<100&&!host.open;i++)await sleep(20);
await host.end();
for(let i=0;i<100&&ended===0;i++)await sleep(20);
assert.deepEqual(await client.heartbeat(),{state:'none'});
assert.ok(!clientVault.map.has('remote-agent'));assert.equal(ended,1,'the client is told, so Fox goes back to its own Agent');
await assert.rejects(client.turn(chat('Hi'),()=>{}),/Pair with Worldlet/);
console.log('PASS unpairing on the host ends the pairing on the client.');
