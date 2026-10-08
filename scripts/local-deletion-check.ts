import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {localDeletionRequest,localDeletionRecord,localDeletionSources,localDeletionTrail} from '../core/items/index.ts';
import {hostFeatures} from '../platform/bridge/features.ts';
import {bundleScript} from './browser-test.ts';

assert.equal(hostFeatures({platform:'windows'}).localDataDeletion,false);
assert.equal(hostFeatures({platform:'windows',hostCapabilities:{version:1,features:{}}}).localDataDeletion,false);
assert.equal(hostFeatures({platform:'windows',hostCapabilities:{version:1,features:{localDataDeletion:true}}}).localDataDeletion,true);
assert.equal(hostFeatures({platform:'macos'}).localDataDeletion,true);
assert.throws(()=>localDeletionRequest({action:'deleteSourceData',provider:' '}));
assert.throws(()=>localDeletionRequest({action:'unknown'}));
assert.doesNotMatch(localDeletionRequest({action:'clearWorldContent'}).detail,/this Mac/);
assert.deepEqual(localDeletionSources({provider:'gmail',connections:[{id:'account',provider:'gmail'}],sources:[{id:'a',origin:'gmail'},{id:'b',origin:'import',connectionID:'account'},{id:'c',origin:'notion'}]}),['a','b']);
const record={id:'mixed',provider:'notion',sources:[{provider:'gmail',id:'g'},{provider:'notion',id:'n'}],attentionDependencies:[{id:'["gmail","g"]'},{id:'["notion","n"]'},{id:'invalid'}]};
const scrubbed=localDeletionRecord({provider:'gmail',bucket:'items',key:'mixed',record});
assert.equal(record.sources.length,2,'Core does not mutate input');
assert.deepEqual(scrubbed.sources,[{provider:'notion',id:'n'}]);
assert.deepEqual(scrubbed.attentionDependencies,[{id:'["notion","n"]'}]);
assert.equal(scrubbed.attentionInvalidated,true);
assert.equal(localDeletionRecord({provider:'gmail',bucket:'reviews',record:{id:'gone',reason:'private'},gone:['gone']}),null);
assert.equal(localDeletionRecord({provider:null,bucket:'items',record}),null);
assert.deepEqual(localDeletionRecord({provider:null,bucket:'conversation',record}),record);
// One item: its revisions and review trail go; other items, sources and caches stay.
assert.throws(()=>localDeletionRequest({action:'deleteWorldItem'}));
const single=localDeletionRequest({action:'deleteWorldItem',id:'mixed'});
assert.deepEqual([single.provider,single.item,single.clearMailReviews],[null,'mixed',false]);
assert.equal(localDeletionRecord({...single,bucket:'items',key:'mixed',record}),null);
assert.equal(localDeletionRecord({...single,bucket:'reviews',key:'run:mixed',record:{id:'mixed',runId:'run'}}),null);
assert.deepEqual(localDeletionRecord({...single,bucket:'items',key:'other',record:{id:'other',sources:record.sources}}),{id:'other',sources:record.sources});
assert.deepEqual(localDeletionRecord({...single,bucket:'attention-context',key:'current',record:{id:'current',facts:[{provider:'gmail'}]}}),{id:'current',facts:[{provider:'gmail'}]});
// Task reviews and browser receipts: deleting one item or one provider removes only the trail
// that refers to it; clearing everything removes all of it.
const review=(id:string,provider:string)=>({id:'r-'+id,previous:{id,provider},candidates:[{id,provider}],proposal:{id,provider},runId:'run'});
assert.equal(localDeletionRecord({...single,bucket:'task-reviews',key:'r-mixed',record:review('mixed','notion')}),null);
assert.deepEqual(localDeletionRecord({...single,bucket:'task-reviews',key:'r-other',record:review('other','notion')}),review('other','notion'),'another item’s review stays');
assert.equal(localDeletionRecord({...single,bucket:'task-reviews',record:{proposal:{provider:'notion'},candidates:[{id:'mixed'}]}}),null,'a review naming the item as a candidate goes');
assert.equal(localDeletionRecord({provider:'gmail',bucket:'task-reviews',record:review('a','gmail')}),null);
assert.deepEqual(localDeletionRecord({provider:'gmail',bucket:'task-reviews',record:review('b','notion')}),review('b','notion'),'another provider’s review stays');
assert.equal(localDeletionRecord({provider:'gmail',bucket:'task-reviews',record:review('b','notion'),gone:['b']}),null,'a review of a removed item goes');
assert.equal(localDeletionRecord({provider:null,bucket:'task-reviews',record:review('b','notion')}),null);
assert.equal(localDeletionTrail({item:'mixed',gone:['mixed'],bucket:'browser-actions',record:{id:'x',taskID:'mixed'}}),true);
assert.equal(localDeletionTrail({item:'mixed',gone:['mixed'],bucket:'browser-actions',record:{id:'x',taskID:'other',task:{provider:'notion'}}}),false);
assert.equal(localDeletionTrail({provider:'notion',bucket:'browser-actions',record:{id:'x',taskID:'other',task:{provider:'notion'}}}),true);
assert.equal(localDeletionTrail({provider:'gmail',bucket:'browser-actions',record:{id:'x',taskID:'other',task:{provider:'notion'}}}),false);
assert.equal(localDeletionTrail({source:'s1',gone:[],bucket:'task-reviews',record:{proposal:{id:'p',sources:[{local:true,id:'s1'}]}}}),true,'a forgotten local source takes reviews that carry it');
assert.equal(localDeletionTrail({source:'s1',gone:[],bucket:'task-reviews',record:review('p','notion')}),false);

const bundle=await bundleScript({entryPoints:['ui/onboarding/world-onboarding.ts'],globalName:'DeletionOnboarding'});
const browser=await chromium.launch();
try {
 const page=await browser.newPage();
 for(const supported of [false,true]) {
  await page.setContent('<main></main>');await page.addScriptTag({content:bundle});
  await page.evaluate(supported=>{
   const state={platform:'windows',hostCapabilities:{version:1,features:{localDataDeletion:supported}},sources:[],connections:[{provider:'gmail',status:'connected'}],onboarding:{completed:true}};
   (window as any).deletionCalls=[];
   const onboarding=(window as any).DeletionOnboarding.mountWorldOnboarding({root:document.querySelector('main'),state,view:{setGuide:guide=>{if(guide?.body)document.querySelector('main').replaceChildren(guide.body);},revealGuide:()=>{}},call:async(action,body)=>{(window as any).deletionCalls.push({action,body});return action==='snapshot'?state:{cancelled:true};}});
   onboarding.show('connection','home','gmail');
  },supported);
  // Provider display names belong to the catalog, so locate the deletion action by prefix.
  const deletion=page.getByRole('button',{name:/^Delete .* data$/});
  assert.equal(await deletion.count(),supported?1:0);
  assert.doesNotMatch(await page.locator('main').innerText(),/this Mac|delete it below/);
  if(supported) {
   await deletion.click();
   assert.deepEqual(await page.evaluate(()=>(window as any).deletionCalls),[{action:'deleteSourceData',body:{provider:'gmail'}}],'Cancellation does not report deletion or refresh saved state');
  }
 }
 console.log('PASS local deletion policy, capability gating and cancelled UI request');
} finally {await browser.close();}
