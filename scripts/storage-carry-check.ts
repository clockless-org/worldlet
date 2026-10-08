// A page moving between the website engines takes its site's localStorage along (core/browser/storage-carry.ts).
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {STORAGE_CARRY,carriedStorage,storageCarryScript} from '../core/browser/index.ts';

const store=(entries:Record<string,string>={})=>{const map=new Map(Object.entries(entries));return {map,getItem:(k:string)=>map.has(k)?map.get(k)!:null,setItem:(k:string,v:string)=>{map.set(k,String(v));},clear:()=>map.clear()};};
const run=(script:string,origin:string,local=store(),session=store())=>{vm.runInNewContext(script,{location:{origin},localStorage:local,sessionStorage:session,Date,JSON});return {local,session};};

assert.deepEqual(carriedStorage(JSON.stringify([['token','abc'],['theme','dark']])),[['token','abc'],['theme','dark']]);
assert.deepEqual(carriedStorage([]),[]);
for(const bad of ['nope','{"a":1}',JSON.stringify([['a',1]]),JSON.stringify([['a']]),null,42,JSON.stringify([['k','x'.repeat(STORAGE_CARRY.bytes+1)]])])
 assert.equal(carriedStorage(bad),null,'not carried: '+String(bad).slice(0,40));
console.log('PASS only a list of string pairs within the size limit is carried');

const script=storageCarryScript('https://x.com',[['token','a"b</script> '],['theme','dark']],Date.now(),'id1');
const moved=run(script,'https://x.com',store({stale:'1',theme:'light'}));
assert.deepEqual(Object.fromEntries(moved.local.map),{token:'a"b</script> ',theme:'dark'},'the new engine’s copy becomes the moved page’s');
// A later document in the same tab keeps what the site changed since.
moved.local.setItem('theme','blue');
run(script,'https://x.com',moved.local,moved.session);
assert.equal(moved.local.getItem('theme'),'blue','applied once per tab');
assert.deepEqual(Object.fromEntries(run(script,'https://evil.example',store({a:'1'})).local.map),{a:'1'},'another origin is untouched');
assert.deepEqual(Object.fromEntries(run(storageCarryScript('https://x.com',[['t','1']],Date.now()-STORAGE_CARRY.ms-1,'id2'),'https://x.com',store({a:'1'})).local.map),{a:'1'},'an old carry is not applied');
console.log('PASS a moved page’s first document gets its site’s localStorage once, before the site’s scripts, on its origin only');
