// DoorDash through its official CLI in the Platform (core/accounts/doordash.ts, platform/electron/src/modules/sources/
// doordash.ts), with no Harness: a failed or timed-out cart change is uncertain and never retried, nothing like a
// credential or the CLI's error output reaches Fox, payment is never an operation, checkout links are DoorDash's
// own, a connection made in Fox's earlier Agent profile is kept, and Fox's use_doordash is admitted by its turn first.
// Never starts dd-cli or touches an account.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {doordashArgs,doordashOutcome,validDoordashCheckout} from '../core/accounts/index.ts';
import {DoorDash,DoorDashSourceAccess} from '../platform/electron/src/modules/sources/doordash.ts';
import {withTempDir} from './test-temp.ts';

for(const run of [{timedOut:false,exitCode:1,stdout:'private token=must-not-leak'},{timedOut:false,exitCode:0,stdout:'not-json'},{timedOut:false,exitCode:0,stdout:'x'.repeat(1_000_001)},
 {timedOut:false,exitCode:0,stdout:JSON.stringify({success:false})},{timedOut:false,exitCode:0,stdout:JSON.stringify({item_errors:[{message:'one item failed'}],added:1})},{timedOut:true,exitCode:null,stdout:''}]){
 for(const operation of ['cart_list','cart_add']){
  const result=doordashOutcome(operation,run);
  assert.equal(result.ok,false);assert.equal(result.uncertain,operation==='cart_add');
  assert.ok(!JSON.stringify(result).includes('must-not-leak'));
 }
}
const added=doordashOutcome('cart_add',{timedOut:false,exitCode:0,stdout:JSON.stringify({cart_id:'fixture',token:'private',nested:{Authorization:'x',ok:1},success:true})});
assert.deepEqual(added,{ok:true,data:{cart_id:'fixture',nested:{ok:1},success:true}});
for(const operation of ['submit','payment','order_submit'])assert.throws(()=>doordashArgs(operation,{}),/Unsupported DoorDash operation/,'payment submission never becomes available');
assert.deepEqual(doordashArgs('search',{query:'pho','address-id':'a1'}).slice(0,7),['--json-output','search','--query','pho','--address-id','a1','--limit']);
assert.deepEqual(doordashArgs('preview',{'cart-uuid':'c','include-work-benefits':true}).slice(0,6),['--json-output','order','preview','--cart-uuid','c','--include-work-benefits']);
assert.throws(()=>doordashArgs('search',{query:'pho'}),/Missing or unsupported/);
assert.throws(()=>doordashArgs('history',{max:21}),/exceeds request limit/);
assert.throws(()=>doordashArgs('cart_add',{'store-id':'s','menu-id':'m','items-json':'[{"item_id":"1","item_name":"x","quantity":0}]'}),/quantity/);
assert.throws(()=>doordashArgs('cart_add',{'store-id':'s','menu-id':'m','items-json':'[]','fulfillment':'drone'}),/1–30 items|delivery or pickup/);
assert.ok(validDoordashCheckout('https://www.doordash.com/checkout'));
for(const url of ['https://doordash.com.evil.test/checkout','https://evil.test/','https://user:secret@doordash.com/','http://doordash.com/'])assert.ok(!validDoordashCheckout(url),url);
assert.throws(()=>doordashOutcome('checkout',{timedOut:false,exitCode:0,stdout:JSON.stringify({url:'https://evil.test/pay'})}),/unsupported checkout host/);

await withTempDir('worldlet-doordash-',async temp=>{
 const home=path.join(temp,'home'),legacy=path.join(temp,'agent','private','hermes'),folder=path.join(temp,'accounts','doordash');
 fs.mkdirSync(legacy,{recursive:true});
 const runs:string[][]=[];
 let answer=(args:string[])=>({timedOut:false,exitCode:0,stdout:args[0]==='login'?'':JSON.stringify({carts:[]})});
 const doordash=new DoorDash({folder,legacyHomes:()=>[legacy],home,run:async(_command,args)=>{runs.push(args);return answer(args);}});
 assert.deepEqual(await doordash.request('status'),{ok:true,installed:false,enabled:false,version:null,accountVerified:false});
 assert.match(String((await doordash.request('login')).error),/npm run setup:doordash/);
 fs.mkdirSync(path.dirname(doordash.binary()),{recursive:true});fs.writeFileSync(doordash.binary(),'#!/bin/sh\n',{mode:0o755});
 // A connection made earlier in Fox's Agent profile stays connected, now the World's.
 fs.writeFileSync(path.join(legacy,'doordash_enabled.json'),'{"enabled":true}\n');
 assert.equal((await doordash.request('status')).enabled,true);
 assert.ok(fs.existsSync(path.join(folder,'enabled.json')));
 assert.deepEqual(await doordash.request('disconnect'),{ok:true});
 assert.equal(fs.existsSync(path.join(legacy,'doordash_enabled.json')),false,'disconnecting forgets the earlier mark too');
 assert.equal((await doordash.request('status')).enabled,false);
 // Sign-in: DoorDash's own login, then a read proves the account works.
 assert.deepEqual(await doordash.request('login'),{ok:true,enabled:true,accountVerified:true});
 assert.deepEqual(runs.map(args=>args.slice(0,3)),[['login'],['--json-output','cart','list']]);
 // Fox's use_doordash: through the source access every Agent gets, admitted by the turn first.
 runs.length=0;
 const asked:any[]=[];
 const access=new DoorDashSourceAccess(doordash,()=>({run:async()=>{throw new Error('not DoorDash');},cancel(){},steer:async()=>false}));
 const allow=async(event:any)=>{asked.push(event.args);return {ok:true};};
 const result=await access.run({action:'sourceTool',name:'use_doordash',args:{operation:'cart_list',parameters:{}}},'',allow);
 assert.deepEqual(result,{ok:true,data:{carts:[]}});
 assert.deepEqual(asked,[{name:'use_doordash',operation:'cart_list'}]);
 await assert.rejects(access.run({action:'sourceTool',name:'use_doordash',args:{operation:'cart_add',parameters:{}}},'',async()=>({error:'Ask the person first.'})),/Ask the person first/);
 assert.equal(runs.length,1,'a refused cart change never runs');
 answer=()=>({timedOut:true,exitCode:null,stdout:''});
 assert.equal((await access.run({action:'sourceTool',name:'use_doordash',args:{operation:'cart_remove',parameters:{'cart-uuid':'c','cart-item-id':'i'}}},'',allow)).uncertain,true);
 assert.equal(runs.length,2,'a timed-out cart change is not retried');
 await assert.rejects(access.run({action:'sourceRequest',provider:'gmail',operation:'read'},''),/not DoorDash/);
});
console.log('PASS DoorDash in the Platform: uncertain cart failures never retried, no credentials or error output reach Fox, no payment operation, DoorDash-only checkout links, an earlier connection kept, use_doordash admitted by its turn; no real CLI or account used');
