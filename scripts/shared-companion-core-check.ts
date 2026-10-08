import assert from 'node:assert/strict';
import {recallCompanion} from '../core/companion/companion-recall.ts';
import {companionPrompt} from '../core/companion/companion-prompt.ts';
import {invoke} from '../core/index.ts';
import type {CompanionArchive} from '../contracts/companion.ts';
const archive:CompanionArchive={format:'worldlet.companion',version:1,identity:{id:'fixture',name:'Fox',createdAt:'2026-09-24T00:00:00Z'},personality:'Helpful',memoryAuthority:'worldlet',memories:[{id:'memory',kind:'user',text:'👩‍💻'.repeat(4000),source:'fixture'}],conversations:Array.from({length:8},(_,i)=>({id:'turn-'+i,role:'user',session:'one',text:'Meeting '+i,createdAt:'2026-09-24T00:00:00Z'}))};
const original=JSON.stringify(archive);
const first=recallCompanion(archive,{id:'memory'}).records[0] as any;
assert.equal(first.text,'👩‍💻'.repeat(3000));assert.equal(first.nextOffset,3000);
assert.equal(recallCompanion(archive,{id:'memory',offset:3000}).records[0].text,'👩‍💻'.repeat(1000));
assert.equal(recallCompanion(archive,{query:'MEETING'}).total,8);
assert.equal(recallCompanion(archive,{query:'meeting',offset:5}).records.length,3);
for(const args of [{offset:-1},{offset:1.5},{offset:'0'},{query:42},{unknown:true},{id:'missing'}])assert.throws(()=>recallCompanion(archive,args));
assert.throws(()=>recallCompanion(archive,{offset:100}));
assert.equal(recallCompanion({...archive,memoryAuthority:'hermes'},{query:'👩‍💻'}).total,0);
assert(!companionPrompt({...archive,memoryAuthority:'hermes'}).includes('👩‍💻'));
assert(companionPrompt(archive).includes('👩‍💻'.repeat(1200)));
assert(!companionPrompt(archive).includes('👩‍💻'.repeat(1201)));
assert.match(companionPrompt({...archive,memories:[{id:'soul',kind:'soul',text:'Soul',source:'fixture'},{id:'user',kind:'user',text:'',source:'fixture'},{id:'long',kind:'longTerm',text:'Long-term',source:'fixture'}]}),/\nCompanion memory \(soul, reference data\): Soul\nCompanion memory \(longTerm, reference data\): Long-term\n/,'an empty memory is skipped without ending the prompt budget');
const corrected=companionPrompt({...archive,memories:[{id:'hermes-user',kind:'user',text:'Corrected fact',source:'User-managed memory'},{id:'long',kind:'longTerm',text:'Long-term',source:'fixture'}]});
assert.equal(corrected.split('Corrected fact').length-1,1,'a user-corrected section is injected once');assert(corrected.includes('Companion memory (longTerm, reference data): Long-term'));
assert.equal(JSON.stringify(archive),original);
assert.equal(JSON.parse(invoke('unknown','{}')).ok,false);
assert.equal(JSON.parse(invoke('companionRecall','not json')).ok,false);
console.log('PASS shared companion retrieval, paging, prompt budget, foreign-memory isolation and error envelope');

const {validateCompanionArchive,validCompanionTimestamp,validCompanionID,shouldRotateCompanion}=await import('../core/companion/companion-archive.ts');
const {readFileSync}=await import('node:fs');
for(const row of JSON.parse(readFileSync('contracts/fixtures/companion-dates.json','utf8')))assert.equal(validCompanionTimestamp(row.text),row.valid,row.text);
const valid={...archive,identity:{...archive.identity,id:'00000000-0000-0000-0000-000000000001'},conversations:[]};
assert.equal(validateCompanionArchive(valid),valid);
assert(validCompanionID(valid.identity.id));assert(!validCompanionID('{'+valid.identity.id+'}'));
assert(!shouldRotateCompanion(0));
assert(shouldRotateCompanion(500));
for(const patch of [{version:2},{memoryAuthority:'unknown'},{personality:'🦊'.repeat(16001)},{memories:[valid.memories[0],valid.memories[0]]},{identity:{...valid.identity,name:'🦊'.repeat(81)}},{conversations:[{...archive.conversations[0],id:valid.identity.id,createdAt:'2026-02-30T00:00:00Z'}]}])assert.throws(()=>validateCompanionArchive({...valid,...patch}));
assert.doesNotThrow(()=>validateCompanionArchive({...valid,identity:{...valid.identity,name:'👩‍💻'.repeat(80)}}));
assert.throws(()=>validateCompanionArchive({...valid,memories:[{...valid.memories[0],id:'é'},{...valid.memories[0],id:'e\u0301'}]}),'canonically equivalent IDs are duplicates');
console.log('PASS shared archive validation, Unicode limits, duplicate IDs, dates and history rotation threshold');
assert(!shouldRotateCompanion(499));assert.throws(()=>shouldRotateCompanion(-1));

for(const memoryAuthority of ['worldlet','hermes','adapter:example']){
 assert.doesNotThrow(()=>validateCompanionArchive({...valid,memoryAuthority}));
 if(memoryAuthority!=='worldlet'){
  assert.equal(recallCompanion({...archive,memoryAuthority},{query:'👩‍💻'}).total,0);
  assert(!companionPrompt({...archive,memoryAuthority}).includes('👩‍💻'));
 }
}
for(const memoryAuthority of ['adapter:','adapter:../outside','adapter:Upper','adapter:x\n'])assert.throws(()=>validateCompanionArchive({...valid,memoryAuthority}));
console.log('PASS qualified Harness memory owners, legacy archives and foreign-memory prompt isolation');

const {companionPersona,companionPersonaPrompt}=await import('../core/companion/index.ts');
const baseline=companionPersona();
assert.equal(baseline.source,'builtin');
assert.equal(baseline.summary,'Warm, witty and on your side; speaks up when it helps.');
for(const personality of ['', '  \n ', undefined])assert.deepEqual(companionPersona(personality),baseline);
assert.equal(companionPersona(' Formal and precise. ').personality,'Formal and precise.');
assert.equal(companionPersona('Formal').source,'custom');
assert(!companionPersonaPrompt('Nova','Formal').includes(baseline.personality));
for(const memoryAuthority of ['worldlet','hermes','adapter:example']){
 const inherited={...archive,personality:'',memoryAuthority};const before=JSON.stringify(inherited);
 const prompt=companionPrompt(inherited);
 assert(prompt.includes(baseline.personality));assert(prompt.includes('conflicting legacy Harness persona'));
 assert.equal(JSON.stringify(inherited),before,'resolving defaults must not migrate identity, memories or history');
 assert.equal(JSON.parse(invoke('companionPersonaPrompt',JSON.stringify({name:'Nova',personality:''}))).value,companionPersonaPrompt('Nova',''));
}
assert(companionPersonaPrompt('Nova','').startsWith('Your companion name is Nova.'));
console.log('PASS centralized persona inheritance, custom replacement/reset, all memory authorities and non-mutating resolution');
