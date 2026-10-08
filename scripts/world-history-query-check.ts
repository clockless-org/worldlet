import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import services from '../core/tools/services.json' with {type:'json'};
import {worldHistoryQuery,worldHistoryPage} from '../core/items/index.ts';
const folder=mkdtempSync(join(tmpdir(),'worldlet-history-query-')),file=join(folder,'history.sqlite');
let db=new DatabaseSync(file);
try {
db.exec('CREATE TABLE entries(seq INTEGER PRIMARY KEY,at REAL,kind TEXT,key TEXT,body TEXT)');
const insert=db.prepare('INSERT INTO entries VALUES(?,?,?,?,?)');
for(let seq=1;seq<=5;seq++)insert.run(seq,100+seq,'activity.page.content','',JSON.stringify({visitId:'visit-1',data:{text:'你好 '+seq+' '+ 'x'.repeat(10000)}}));
insert.run(6,106,'state.foo','',JSON.stringify({text:'你好'}));
const run=(args:Record<string,unknown>)=>{const p=worldHistoryQuery(args);const rows=db.prepare(p.sql).all(...p.values).map(r=>({...r,body:JSON.parse(String(r.body))})) as Parameters<typeof worldHistoryPage>[0]['rows'];return worldHistoryPage({...p,rows});};
let page=run({query:'你好',limit:2});assert.deepEqual(page.events.map(e=>e.seq),[5,4]);assert('nextBefore' in page);assert.equal(page.nextBefore,4);
page=run({query:'你好',before:4,limit:2});assert.deepEqual(page.events.map(e=>e.seq),[3,2]);
assert.deepEqual(run({after:3}).events.map(e=>e.seq),[4,5]);
assert.equal(run({kind:"' OR 1=1 --"}).events.length,0);
assert.equal(run({visitId:'visit-1'}).events.length,5);
let full='',offset=0;while(true){const detail=run({seq:5,contentOffset:offset}).events[0].content as {text:string;nextContentOffset?:number};full+=detail.text;if(detail.nextContentOffset===undefined)break;offset=detail.nextContentOffset;}
assert.equal(JSON.parse(full).body.text,'你好 5 '+'x'.repeat(10000));
for(const args of [{unknown:true},{limit:0},{before:-1},{contentOffset:1},{since:'yesterday'},{limit:201}])assert.throws(()=>worldHistoryQuery(args));
const secret=worldHistoryPage({limit:1,rows:[{seq:1,at:1,kind:'execution.tool.result',body:{data:{password:'never'}},payload:{apiKey:'never',answer:'ok'}}]});assert(!JSON.stringify(secret.events).includes('never'));
// Metadata-only identities are exact envelope filters, not searches over nested content.
const refs={requestId:'request-1',taskId:'task-1',surfaceId:'surface-1'};
for(const [seq,body] of [
 [7,refs],[8,refs],[9,{...refs,taskId:'task-2'}],[10,{...refs,requestId:'request-2'}],
 [11,{...refs,surfaceId:'surface-2'}],[12,{data:refs}],
] as Array<[number,Record<string,unknown>]>)insert.run(seq,100+seq,'world.action','fixture',JSON.stringify({id:'event-'+seq,observedAt:200+seq,...body}));
insert.run(13,113,'world.action','fixture',JSON.stringify(refs)); // Legacy rows with known references stay queryable.
insert.run(14,114,'state.fixture','fixture',JSON.stringify(refs));
const injection="' OR 1=1 --",long='x'.repeat(200);
for(const [seq,value] of [[15,injection],[16,long]] as const)insert.run(seq,100+seq,'world.action','fixture',JSON.stringify(Object.fromEntries(Object.keys(refs).map(key=>[key,value]))));
const sequences=(args:Record<string,unknown>)=>run(args).events.map(e=>e.seq);
assert.deepEqual(sequences({requestId:refs.requestId}),[13,11,9,8,7]);
assert.deepEqual(sequences({taskId:refs.taskId}),[13,11,10,8,7]);
assert.deepEqual(sequences({surfaceId:refs.surfaceId}),[13,10,9,8,7]);
assert.deepEqual(sequences(refs),[13,8,7]);
assert.deepEqual(sequences({...refs,taskId:'task-2'}),[9]);
assert.deepEqual(sequences({...refs,kind:'world.action',applet:'fixture',query:'request-1',since:'1970-01-01T00:01:48Z',until:'1970-01-01T00:01:53Z'}),[13,8]);
assert.deepEqual(sequences({...refs,visitId:'visit-1'}),[]);
assert.deepEqual(sequences({...refs,seq:7}),[7]);
assert.equal(JSON.parse((run({...refs,seq:7,contentOffset:0}).events[0].content as {text:string}).text).body.requestId,refs.requestId);
for(const key of Object.keys(refs)){
 assert.deepEqual(sequences({[key]:'missing'}),[]);
 assert.deepEqual(sequences({[key]:injection}),[15],'Injection-like text matches only the bound literal');
 assert.deepEqual(sequences({[key]:long}),[16]);
 for(const value of [null,1,false,[],{},'', 'x'.repeat(201),'bad\u0000id','bad\n'])assert.throws(()=>worldHistoryQuery({[key]:value}),/Invalid history/);
 const schema=services.find(tool=>tool.name==='read_world_history')!.parameters.properties[key];
 assert.equal(schema.type,'string');assert.equal(schema.minLength,1);assert.equal(schema.maxLength,200);
 const pattern=new RegExp(schema.pattern);assert.ok(pattern.test(injection));assert.ok(pattern.test(long));
 for(const value of ['', 'bad\u0000id','bad\n'])assert.equal(pattern.test(value),false,'Tool schema matches Core identity validation');
}
assert.throws(()=>worldHistoryQuery({requestID:'request-1'}),/Unknown history filter/);
const beforeReopen=run(refs);
db.close();db=new DatabaseSync(file);
assert.deepEqual(run(refs),beforeReopen,'Persisted references, times and legacy projection survive reopen');
assert.equal(run({...refs,seq:13}).events[0].legacy,true);
for(const ascending of [false,true]){
 const seen:unknown[]=[];let cursor=ascending?0:undefined;
 while(true){
  const result=run({...refs,limit:2,...(ascending?{after:cursor}:{before:cursor})});
  seen.push(...result.events.map(e=>e.seq));if(!result.hasMore)break;
  const next=Number(ascending?('nextAfter' in result?result.nextAfter:undefined):('nextBefore' in result?result.nextBefore:undefined));
  assert.ok(ascending?next>cursor!:cursor===undefined||next<cursor);cursor=next;
 }
 assert.deepEqual(seen,ascending?[7,8,13]:[13,8,7]);
}
console.log('PASS history exact correlation filters, bound values, validation, combined filters, reopened cursor pages, Unicode, bounded content and redaction');
} finally {db.close();rmSync(folder,{recursive:true,force:true});}
