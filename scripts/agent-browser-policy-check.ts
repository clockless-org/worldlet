import assert from 'node:assert/strict';
import {browserElementPolicy,browserDriverSnapshot} from '../core/browser/agent-browser.ts';
const link={role:'link',name:'Read article',url:'https://example.com/page',href:'/article'};
assert.equal(browserElementPolicy(link).receipt,false);
for(const href of ['https://outside.example/path','//outside.example/','\\\\outside.example/','javascript:alert(1)'])assert.equal(browserElementPolicy({...link,href}).receipt,true);
assert.equal(browserElementPolicy({...link,name:'Cancel subscription'}).receipt,true);
assert.equal(browserElementPolicy({name:'Submit request',role:'button'}).receipt,true);
assert.equal(browserElementPolicy({name:'Annual billing',role:'tab'}).receipt,false);
assert.equal(browserElementPolicy({name:'Search',role:'textbox'}).editable,true);
for(const facts of [{name:'Password'},{type:'password'},{autocomplete:'cc-number'},{autocomplete:'one-time-code'}])assert.ok(browserElementPolicy({role:'textbox',...facts}).error);
const result=browserDriverSnapshot({documentId:'d1',url:'https://example.com',snapshot:{snapshot:'heading Hello\ntextbox Password SECRET\nlink Article',refs:{e1:{role:'textbox',name:'Password'},e2:{role:'link',name:'Article'}}}});
assert.equal(result.driver,'agent-browser');assert.equal(result.elements.length,1);assert.ok(!result.text.includes('SECRET'));
console.log('PASS agent-browser shared policy: same-site navigation, receipts, sensitive fields, snapshot projection');

for(const type of ['text','search','email'])assert.equal(browserElementPolicy({role:'combobox',name:'Search or jump to',type}).editable,true);
assert.equal(browserElementPolicy({role:'combobox',name:'Choose country'}).editable,false);
assert.equal(browserElementPolicy({role:'combobox',name:'Search',type:'text',readonly:true}).editable,false);
assert.equal(browserElementPolicy({role:'textbox',disabled:true}).editable,false);
assert.equal(browserElementPolicy({role:'combobox',contenteditable:'true'}).editable,true);
assert.ok(browserElementPolicy({role:'combobox',type:'text',autocomplete:'cc-number'}).error);
assert.equal(browserElementPolicy({role:'button',type:'button',name:'Search or jump to, type / to search'}).receipt,false);
for(const facts of [{type:'submit',name:'Search'},{name:'Search'},{type:'button',name:'Search and purchase'},{type:'button',name:'Delete search history'}])assert.equal(browserElementPolicy({role:'button',...facts}).receipt,true);
console.log('PASS editable comboboxes, read-only/disabled and payment fields, search launch vs submit');

const long=browserDriverSnapshot({snapshot:{snapshot:'Useful content '.repeat(2000)}});
assert.equal(long.truncated,true);assert.equal(long.text.length,24000);assert.match(long.guidance,/incomplete/);
assert.equal(result.truncated,false);

// Controls the text already shows with their refs are not listed again; ones it cut off still are.
const shown=browserDriverSnapshot({snapshot:{snapshot:'- button "Buy" [ref=e1]\n- heading "Shop" [level=1, ref=e2]\n- checkbox "Gift" [ref=e3, checked]',refs:{e1:{role:'button',name:'Buy'},e2:{role:'heading',name:'Shop'},e3:{role:'checkbox',name:'Gift'}}}});
assert.equal(shown.elements,undefined);assert.equal(shown.truncated,false);
const cut=browserDriverSnapshot({snapshot:{snapshot:'x'.repeat(24000)+'\n- button "Late" [ref=e9]',refs:{e9:{role:'button',name:'Late'}}}});
assert.deepEqual(cut.elements,[{ref:'e9',role:'button',label:'Late'}]);assert.equal(cut.truncated,true);
console.log('PASS snapshots list only controls the shortened text cut off');
