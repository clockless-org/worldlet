// An Agent on another computer runs Fox's background work too (owner decision 2026-10-09: the Harness runs the
// conversation and the background work alike, wherever it is; core/phone/README.md#another-computers-agent): a turn on
// the background lane carries its flags across, the host runs it on its own background lane beside the person's turn
// (up to two at once), and a host that does not say it runs lanes is sent none.
import assert from 'node:assert/strict';
import {readRemoteHostInfo,readRemoteToHost,remoteHostInfo,remoteTurnBody,remoteTurnRequest} from '../core/phone/index.ts';
import {createRemoteAgentHost} from '../platform/electron/src/modules/phone/remote-host.ts';

type Row=Record<string,unknown>;
const thread=JSON.stringify(['overview','']);
// The flags of a check Worldlet started cross over, and the host's body asks its Agent for the same.
const check=remoteTurnRequest({action:'chat',text:'Check mail',thread,_background:true,monitor:true,allowActions:false},{id:'t1',at:Date.now(),lane:'background'});
assert.deepEqual([check.lane,check.background,check.monitor,check.actions],['background',true,true,false]);
const read=readRemoteToHost(JSON.parse(JSON.stringify(check)));
assert.ok(read&&read.type==='turn');
const body=remoteTurnBody(read as typeof check,{world:'remote:laptop',agents:[]});
assert.deepEqual([body._background,body.monitor,body.allowActions],[true,true,false]);
// The person's line carries none.
const line=remoteTurnRequest({action:'chat',text:'Hi',thread},{id:'t2',at:Date.now()});
assert.equal('lane' in line||'background' in line||'monitor' in line||'actions' in line,false);
const plain=remoteTurnBody(line,{world:'remote:laptop',agents:[]});
assert.equal('_background' in plain||'allowActions' in plain,false);
// A host says it runs lanes; an older one's slot does not.
assert.equal(readRemoteHostInfo({agent:remoteHostInfo([])})?.lanes,true);
assert.equal(readRemoteHostInfo({agent:{v:2,agents:[]}})?.lanes,undefined);

// The host: the person's turn and up to two background turns at once, each on its own lane.
const sent:Row[]=[],started:{body:Row;lane?:string;finish:()=>void}[]=[];
const host=createRemoteAgentHost({send:async message=>{sent.push(message as Row);},client:()=>'laptop',name:()=>'Mac mini',agents:async()=>[],gather:0,
 run:(body,_onEvent,_signal,lane)=>new Promise<Row>(resolve=>{started.push({body,lane,finish:()=>resolve({message:'done '+body.text})});})});
const turn=(id:string,text:string,lane?:'background')=>({...remoteTurnRequest({action:'chat',text,thread,...lane?{_background:true}:{}},{id,at:Date.now(),...lane?{lane}:{}})});
const settle=()=>new Promise(resolve=>setTimeout(resolve,20));
await host.receive(turn('p1','Hi'));await host.receive(turn('b1','Check mail','background'));await host.receive(turn('b2','Check calendar','background'));
await settle();
assert.deepEqual(started.map(s=>[s.body.text,s.lane??'person',s.body._background===true]),[['Hi','person',false],['Check mail','background',true],['Check calendar','background',true]],'the person\'s turn and two background turns run together');
await host.receive(turn('b3','Check news','background'));await host.receive(turn('p2','Again'));await settle();
const refused=(id:string)=>sent.find(m=>m.type==='done'&&m.turn===id)?.error as string;
assert.match(refused('b3'),/busy with other background work/);assert.match(refused('p2'),/still answering your other message/);
assert.equal(started.length,3);
for(const s of started)s.finish();await settle();
assert.deepEqual(['p1','b1','b2'].map(id=>sent.find(m=>m.type==='done'&&m.turn===id)?.message),['done Hi','done Check mail','done Check calendar']);
assert.equal(host.busy,false);
// A cancel reaches the turn it names.
await host.receive(turn('b4','Long check','background'));await settle();
let aborted=false;const last=started.at(-1)!;
await host.receive({type:'cancel',id:'c1',at:Date.now(),turn:'b4'});
await settle();last.finish();await settle();
aborted=sent.some(m=>m.type==='done'&&m.turn==='b4'&&m.cancelled===true);
assert.equal(aborted,true);
console.log('PASS remote lanes: background flags cross over, the host runs the person\'s turn and up to two background turns at once on its own lanes, refuses more, cancels by turn, and an older host is sent none');
