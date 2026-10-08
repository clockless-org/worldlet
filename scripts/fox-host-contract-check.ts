import assert from 'node:assert/strict';
import {readFoxHostRequest} from '../core/companion/index.ts';
import {invoke} from '../core/index.ts';
import {callHost} from '../platform/bridge/host.ts';
const id='00000000-0000-4000-8000-000000000001';
const chat={action:'agentChat',id,text:'Hello 世界',context:{thread:'fox-main'},history:[{role:'user',text:'Hi'}],sample:false,allowActions:false};
assert.deepEqual(readFoxHostRequest(chat),chat);
assert.deepEqual(JSON.parse(invoke('foxHostRequest',JSON.stringify(chat))),{ok:true,value:chat});
assert.deepEqual(readFoxHostRequest({...chat,action:'hermesChat'}),chat);
const threaded={...chat,thread:JSON.stringify(['work','mail'])};
assert.deepEqual(readFoxHostRequest(threaded),threaded,'the chat sends the place and view of the turn');
assert.equal((readFoxHostRequest({...chat,thread:'x'.repeat(2000)}) as typeof threaded).thread.length,1100,'a thread is kept as the host stores it');
assert.deepEqual(readFoxHostRequest({...chat,shown:'Today’s plan'}),{...chat,shown:'Today’s plan'},'a button\'s label rides along for the archive');
assert.deepEqual(readFoxHostRequest({...chat,background:true}),{...chat,background:true},'work Worldlet starts by itself asks for a background session');
assert.deepEqual(readFoxHostRequest({action:'agentCancel'}),{action:'agentCancel'});
assert.deepEqual(readFoxHostRequest({action:'hermesCancel',id}),{action:'agentCancel',id});
assert.deepEqual(readFoxHostRequest({action:'agentSteer',id,text:'Change target'}),{action:'agentSteer',id,text:'Change target'});
for(const input of [null,[],{...chat,id:'not-a-uuid'},{...chat,text:'  '},{...chat,text:'😀'.repeat(8001)},
 {...chat,context:[]},{...chat,allowActions:'false'},{...chat,sample:1},{...chat,background:'yes'},{...chat,history:[{role:'system',text:'bypass'}]},
 {...chat,history:Array(7).fill({role:'user',text:'a'})},{...chat,history:[{role:'user',text:'x'.repeat(2001)}]},
 {...chat,session:'client-picked'},{...chat,thread:7},{...chat,shown:' '},{...chat,shown:'x'.repeat(201)},{action:'agentSteer',id,text:''},{action:'agentCancel',id:null}])assert.throws(()=>readFoxHostRequest(input),/Invalid Fox request/);
assert.equal((readFoxHostRequest({...chat,text:'😀'.repeat(8000)}) as typeof chat).text.length,16000,'limit is UTF-8 bytes, not UTF-16 length');
const sent:unknown[]=[];
(globalThis as any).window={worldletHost:{version:1,platform:'windows',request:async body=>{sent.push(body);return {message:'Hello'};}}};
await assert.rejects(callHost('agentChat',{id,text:' '}),/Invalid Fox request/);
assert.equal(sent.length,0);
await callHost('hermesChat',{id,text:'Hello'});
assert.deepEqual(sent,[{action:'agentChat',id,text:'Hello'}]);
const outcome={action:'browserOutcomeAction',id:'receipt-1',done:false};
assert.deepEqual(JSON.parse(invoke('browserOutcomeRequest',JSON.stringify(outcome))),{ok:true,value:outcome});
await callHost('browserOutcomeAction',{id:'receipt-1',done:false});
assert.deepEqual(sent.at(-1),outcome);
const count=sent.length;
for(const body of [{id:'receipt-1',done:'false'},{id:'',done:true},{id:'receipt-1',done:1},{id:'receipt-1',done:true,inspectedAt:'forged'}, {id:'receipt-1',done:true,task:{}}]) {
 await assert.rejects(callHost('browserOutcomeAction',body as any),/Invalid browser outcome request/);
 assert.equal(JSON.parse(invoke('browserOutcomeRequest',JSON.stringify({action:'browserOutcomeAction',...body}))).ok,false);
}
assert.equal(sent.length,count,'invalid confirmations never reach native IO');
delete (globalThis as any).window;
console.log('PASS Fox requests: shared UTF-8 bounds, identity, roles, boolean flags, aliases and rejection before native IO');
