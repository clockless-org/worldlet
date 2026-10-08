import assert from 'node:assert/strict';
import {applyMemoryEdits} from '../core/companion/memory-edits.ts';
const archive:any={memories:[{id:'a',kind:'user',text:'Old'},{id:'b',kind:'longTerm',text:'Keep'},{id:'c',kind:'soul',text:'Identity'}],conversations:[{text:'History remains'}]};
const corrected=applyMemoryEdits(archive,{user:'New'});
assert.equal(corrected.memories.find(m=>m.kind==='user')?.text,'New');assert.equal(archive.memories[0].text,'Old');
assert.equal(applyMemoryEdits(archive,{user:''}).memories.find(m=>m.kind==='user')?.text,'');
assert.equal(corrected.memories.find(m=>m.kind==='soul')?.text,'Identity');assert.deepEqual(corrected.conversations,archive.conversations);
for(const edits of [{soul:'Changed'},{user:5},{longTerm:'x'.repeat(1_000_001)},[],null])assert.throws(()=>applyMemoryEdits(archive,edits));
console.log('PASS explicit memory correction/clear, untouched identity/history, immutable input and malformed-edit rejection');
