import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {invoke} from '../core/index.ts';
import {contextChunks,mergeSourceAnalysis} from '../core/context/index.ts';
const fixtures=JSON.parse(readFileSync(new URL('./fixtures/source-analysis.json',import.meta.url),'utf8'));
for(const fixture of fixtures){
 const result=JSON.parse(invoke('sourceAnalysisValidate',JSON.stringify(fixture.input)));
 assert.equal(result.ok,fixture.valid,fixture.name);
 if(result.ok){assert.equal(result.value[0].sourceRevision,'r2');assert.equal(result.value[0].activityVersion,1);assert.equal(result.value[0].model,undefined);}
}
const text='原'.repeat(23999)+'🌍e\u0301';
const chunks=contextChunks(text);
assert.equal(chunks.join(''),text);
assert.ok(chunks.every(c=>Buffer.byteLength(c)<=24000));
assert.deepEqual(contextChunks(''),[]);
assert.throws(()=>contextChunks('text',0));
console.log(`PASS ${fixtures.length} shared source-analysis cases: evidence, dates, types, Unicode and trusted projection`);

const mergeFixtures=JSON.parse(readFileSync(new URL('./fixtures/source-analysis-merge.json',import.meta.url),'utf8'));
for(const fixture of mergeFixtures){
 const before=JSON.stringify(fixture.input);
 const result=JSON.parse(invoke('sourceAnalysisMerge',before));
 assert.equal(result.ok,!fixture.error,fixture.name);
 if(result.ok){assert.deepEqual(result.value,fixture.expected,fixture.name);assert.deepEqual(mergeSourceAnalysis(fixture.input.source,fixture.input.chunks),fixture.expected);}
 else assert.throws(()=>mergeSourceAnalysis(fixture.input.source,fixture.input.chunks));
 assert.equal(JSON.stringify(fixture.input),before);
}
const chunk={...fixtures[0].input.items[0],sourceId:'s:chunk:0',summary:'e\u0301'.repeat(2401),facts:Array.from({length:13},(_,i)=>({text:'Fact',quote:String(i)})),activities:Array(9).fill({kind:'task',title:'Task',quote:'Evidence'})};
const merged=JSON.parse(invoke('sourceAnalysisMerge',JSON.stringify({source:{id:'s',revision:'v3'},chunks:[chunk]}))).value;
assert.equal(merged.summary,'e\u0301'.repeat(2400));assert.equal(merged.facts.length,12);assert.equal(merged.activities.length,8);
console.log('PASS source-analysis merge: deterministic ties, source order, bounded Unicode, evidence dedup and empty input');

const requestInput={sourceId:'s:chunk:0',title:'Original',text:'原文 🌍',now:'2026-09-27T12:00:00Z',topics:['z','a','z',null,'',...Array.from({length:105},(_,i)=>`topic-${String(i).padStart(3,'0')}`)]};
const request=JSON.parse(invoke('sourceAnalysisRequest',JSON.stringify(requestInput)));
assert.equal(request.ok,true);
assert.deepEqual(request.value.sources,[{sourceId:requestInput.sourceId,title:requestInput.title,text:requestInput.text}]);
assert.equal(request.value.now,requestInput.now);
assert.equal(request.value.existingTopics.length,100);
assert.equal(request.value.existingTopics[0],'a');
assert.equal(request.value.existingTopics.at(-1),'topic-098');
assert.deepEqual(JSON.parse(invoke('sourceAnalysisRequest',JSON.stringify({...requestInput,topics:[...requestInput.topics].reverse()}))).value,request.value);
assert.equal(JSON.parse(invoke('sourceAnalysisRequest',JSON.stringify({...requestInput,now:'invalid'}))).ok,false);
console.log('PASS source request preserves originals and applies deterministic deduplicated topic budget');
