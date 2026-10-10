import assert from 'node:assert/strict';
import {validateWorldItem} from '../core/items/world-item-validation.ts';
import {readFileSync} from 'node:fs';
import {processedAttentionContent,ATTENTION_CONTENT_LIMITS,attentionReasonWords} from '../core/attention/attention-content.ts';
import services from '../core/tools/services.json' with {type:'json'};
import {matterCopy} from '../ui/attention/matter-copy.ts';
import {attentionPreviewData} from '../core/attention/attention-preview.ts';
import {projectWorldItems} from '../core/items/world-items.ts';
import {planAttention,finishAttentionBudget} from '../core/attention/attention-center.ts';
import {prepareWorldItem} from '../core/items/world-item-state.ts';
const original='2026 HYSTA Annual Conference | AI innovation, founders and many more details';
const item=processedAttentionContent({id:'meeting',provider:'google-calendar',kind:'event',title:'HYSTA annual conference',reason:'Your conference is tomorrow.',summary:'A full-day conference. Review the agenda before going.',locationName:'Santa Clara Convention Center',location:'5001 Great America Pkwy, Santa Clara, CA',start:'2026-09-26T09:00:00-07:00',end:'2026-09-26T21:00:00-07:00',status:'open',sources:[{provider:'google-calendar',id:'event',quote:original}]});
assert.equal(item.context,item.reason,'Legacy alias has one authoritative reason');
assert.throws(()=>processedAttentionContent({...item,title:original}),'Reject long copy rather than truncating it');
assert.throws(()=>processedAttentionContent({...item,reason:undefined}));
assert.throws(()=>processedAttentionContent({...item,summary:''}));
for(const title of ['Prepare the final report for this review','界'.repeat(40),'🦊'.repeat(40)]){
 const bounded=processedAttentionContent({...item,title,reason:'界'.repeat(56),summary:'界'.repeat(240)});
 validateWorldItem(bounded,{start:Date.parse(String(item.start))/1000,end:Date.parse(String(item.end))/1000});
 const projection:any={pages:[],roots:['root']};projectWorldItems(projection,[bounded]);
 const preview=attentionPreviewData(projection.pages[0]);
 assert.equal(preview.title,title);assert.equal(preview.reason,bounded.reason);assert.equal(preview.summary,bounded.summary);
}
for(const [field,max] of [['title',40],['reason',56],['summary',1200]] as const)
 assert.throws(()=>processedAttentionContent({...item,[field]:'界'.repeat(max+1)}),`${field} remains bounded`);
const world:any={pages:[],roots:['root']};projectWorldItems(world,[item]);
const card=attentionPreviewData(world.pages[0]);
assert.equal(card.title,item.title);assert.equal(card.summary,item.summary);assert.equal(card.reason,item.reason);
assert.equal(card.location,item.locationName);assert.ok(card.locationURL.includes('5001'));
assert.equal(world.pages[0].activities.length,1);
const shelf=matterCopy({},[{pageId:world.pages[0].id,state:'event',context:'Wrong original fallback'}],new Map([[world.pages[0].id,world.pages[0]]]));
assert.equal(shelf.actionTitle,item.title);assert.equal(shelf.context,item.reason);
const legacy:any={pages:[],roots:['root']};projectWorldItems(legacy,[{...item,title:original,attentionContentVersion:undefined}]);
assert.equal(legacy.pages[0].activities.length,0,'Unprocessed originals cannot enter the Center');
const previous={...item,status:'dismissed',statusOrigin:'user',snoozedUntil:'2026-09-27T00:00:00Z'};
assert.equal(prepareWorldItem(item,previous,'meeting','identity','pass','now').status,'dismissed');
const fact:any={id:'fact',provider:'google-calendar',sourceId:'event',revision:2,title:original,text:'Conference',observedAt:0,changedAt:1,expiresAt:10000,removed:false,keys:[],attributes:{start:item.start}};
const plan=planAttention([fact],{seen:{fact:2}},100,['google-calendar'])!;
assert.ok(plan,'Old already-seen Calendar facts must be reprocessed');
const budget=finishAttentionBudget({},plan,100,true,[fact]);
assert.equal(budget.contentVersion,1);assert.equal(planAttention([fact],budget,101,['google-calendar']),null);
console.log('PASS model-authored Title/Reason/Summary, location projection, raw-copy exclusion, migration and user-state preservation');

assert.throws(()=>processedAttentionContent({...item,provider:'gmail'}),/eventDisposition/);
assert.equal(processedAttentionContent({...item,provider:'gmail',eventDisposition:'confirmed'}).eventDisposition,'confirmed');

const markdown='### Before you go\n- Bring **2 documents**.\n- Confirm attendance.';
const rich=processedAttentionContent({...item,summary:markdown});
const richWorld:any={pages:[],roots:['root']};projectWorldItems(richWorld,[rich]);
assert.equal(attentionPreviewData(richWorld.pages[0]).summary,markdown);

const {foxDoing}=await import('../ui/companion/fox-doing.ts');
assert.equal(foxDoing('automate_browser',{operation:'open',url:'https://www.example.com/private?token=secret'}),'Opening example.com');
assert.equal(foxDoing('automate_browser',{operation:'snapshot'}),'Reading the page');
assert.equal(foxDoing('automate_browser',{operation:'fill'}),'Filling in the form');

const actionItem=processedAttentionContent({...item,actionLabel:'Check weather'});
assert.equal(actionItem.actionLabel,'Check weather');
assert.throws(()=>processedAttentionContent({...item,actionLabel:'x'.repeat(33)}));
const actionWorld:any={roots:['root'],pages:[]};projectWorldItems(actionWorld,[actionItem]);
assert.equal(attentionPreviewData(actionWorld.pages[0]).actionLabel,'Check weather');
console.log('PASS bounded action labels survive shared projection into card actions');

const stagedTask=processedAttentionContent({provider:'gmail',kind:'task',title:'Review renewal',reason:'Decide before the renewal date',summary:'Review the renewal terms.',sources:[{provider:'gmail',id:'thread:fixture',quote:'Renewal terms'}]} as any);
validateWorldItem(stagedTask,{start:null,end:null});
if(stagedTask.attentionReason!==stagedTask.reason)throw Error('Task storage must reuse the required reason when the legacy alias is omitted');
console.log('PASS required task reason supplies legacy storage alias');

// The schema the model sees must carry the same card limits Core enforces; a looser
// schema lets over-long copy pass harness validation and fail only at the host (#reason-limit).
const upsert:any=(services as any[]).find(tool=>tool.name==='upsert_world_items');
const fields=upsert.parameters.properties.items.items.properties;
for(const key of ['title','reason','summary','actionLabel','locationName','location'] as const)
 assert.equal(fields[key].maxLength,ATTENTION_CONTENT_LIMITS[key],`upsert_world_items ${key}.maxLength must match Core`);
assert.match(fields.reason.description,new RegExp(`${ATTENTION_CONTENT_LIMITS.reasonWords} words and ${ATTENTION_CONTENT_LIMITS.reason} characters`));
assert.match(fields.reason.description,/attentionReason never replaces it/);
const brief={provider:'google-calendar',kind:'event',title:'SFO to JFK Flight',summary:'Pack tonight.',start:'2026-10-02T08:00:00-07:00',sources:[{provider:'google-calendar',id:'flight',quote:'Flight'}]} as any;
// Observed local-model output (57 characters): still rejected rather than truncated.
assert.throws(()=>processedAttentionContent({...brief,reason:'Confirmed departure requires travel preparation this week'}),/56 characters/);
assert.equal(processedAttentionContent({...brief,reason:'  Pack for the early Friday departure \n'}).reason,'Pack for the early Friday departure');
assert.equal(processedAttentionContent({...brief,reason:` ${'界'.repeat(56)} `}).reason,'界'.repeat(56),'Surrounding whitespace does not count toward the limit');
console.log('PASS model-facing schema mirrors Core card limits; only surrounding whitespace is normalized');

// Core counts reason words over whitespace runs.
const nineWords='Reply to Ms. Alvarez about pickup by Thursday noon';
assert.equal(attentionReasonWords(nineWords),ATTENTION_CONTENT_LIMITS.reasonWords+1);
assert.throws(()=>processedAttentionContent({...brief,reason:nineWords}),new RegExp(`at most ${ATTENTION_CONTENT_LIMITS.reasonWords} words`));
assert.equal(processedAttentionContent({...brief,reason:'Reply to Ms. Alvarez about pickup by Thursday'}).reason,'Reply to Ms. Alvarez about pickup by Thursday');

// Both field tables in core/attention/README.md state Core's limits, not a stale copy.
const readme=readFileSync(new URL('../core/attention/README.md',import.meta.url),'utf8');
for(const key of ['title','reason','summary','actionLabel','locationName','location'] as const){
 const rows=readme.split('\n').filter(line=>line.startsWith(`| \`${key}\` |`));
 assert.ok(rows.length>=(key==='actionLabel'?1:2),`core/attention/README.md lists ${key} in both field tables`);
 for(const row of rows){
  const chars=[...row.matchAll(/(\d+) characters/g)].map(m=>Number(m[1])),words=[...row.matchAll(/(\d+) words/g)].map(m=>Number(m[1]));
  assert.deepEqual(chars,[ATTENTION_CONTENT_LIMITS[key]],`README ${key} row must state Core's ${ATTENTION_CONTENT_LIMITS[key]} characters: ${row}`);
  // Title word counts are writing guidance ("3–4 words"); only reason has a word limit.
  if(key==='reason')assert.deepEqual(words,[ATTENTION_CONTENT_LIMITS.reasonWords],`README reason row must state Core's word limit: ${row}`);
 }
}
console.log('PASS reason word count and README field tables match Core limits');
