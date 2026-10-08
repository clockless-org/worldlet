import assert from 'node:assert/strict';
import {curatedSourceRead,getApp} from '../core/applets/index.ts';
assert.deepEqual(curatedSourceRead({provider:'todoist',operation:'list',cursor:'next'}),{provider:'todoist',operation:'list',cursor:'next',connectionProvider:'todoist'});
assert.equal(curatedSourceRead({provider:'todoist',operation:'read',id:'123abc'}).id,'123abc');
for(const input of [{provider:'slack',operation:'list'},{provider:'todoist',operation:'delete'},{provider:'todoist',operation:'list',id:'x'},{provider:'todoist',operation:'read',id:'../x'},{provider:'todoist',operation:'read',id:'x',cursor:'next'},{provider:'todoist',operation:'list',url:'https://evil.test'}])assert.throws(()=>curatedSourceRead(input));
assert.equal(curatedSourceRead({provider:'google-drive',operation:'read',id:'file_123-abc'}).id,'file_123-abc');
assert.equal(getApp('todoist')?.fullView.kind,'scene');
assert.equal(getApp('todoist')?.connection.provider,'todoist');
console.log('PASS curated source plans: bounded reads, no ignored fields or arbitrary endpoints; Todoist native routing.');
for(const key of ['google-docs','google-sheets','google-slides']){
 assert.equal(getApp(key)?.connection.provider,'google-drive');
 assert.equal(getApp(key)?.fullView.kind,'scene');
 assert.equal(curatedSourceRead({provider:key,operation:'list'}).connectionProvider,'google-drive');
}
assert.equal(getApp('supabase')?.fullView.kind,'scene');
assert.equal(getApp('linear')?.fullView.kind,'scene');
assert.equal(curatedSourceRead({provider:'linear',operation:'read',id:'ENG-142'}).connectionProvider,'linear');
assert.equal(curatedSourceRead({provider:'supabase',operation:'list'}).connectionProvider,'supabase');
assert.equal(curatedSourceRead({provider:'docker',operation:'list'}).localTool,'docker');
assert.equal(curatedSourceRead({provider:'docker',operation:'read',id:'a'.repeat(64)}).id,'a'.repeat(64));
assert.throws(()=>curatedSourceRead({provider:'docker',operation:'read',id:'--help'}));
assert.throws(()=>curatedSourceRead({provider:'docker',operation:'list',cursor:'next'}));
