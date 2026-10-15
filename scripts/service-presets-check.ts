import assert from 'node:assert/strict';
import path from 'node:path';
import {withTempDir} from './test-temp.ts';
import {SERVICE_PRESET_LIMITS} from '../contracts/service-presets.ts';
import {PRESET_REASONS,readServicePresetRead,readStoredServicePreset,removeServicePreset,saveServicePreset,servicePresetRead} from '../core/accounts/index.ts';
import {WorldLedger} from '../platform/electron/src/store/ledger.ts';
import {createServicePresets,loadServicePresets} from '../platform/electron/src/modules/sources/service-presets.ts';

// Service presets (contracts/service-presets.ts, core/accounts/services/presets.ts): named, saved reads of a Worldlet
// Service, checked as the Service's own reader checks them, holding no key, kept in world.sqlite.
const now='2026-10-15T12:00:00.000Z',later='2026-10-15T13:00:00.000Z';
const refused=(work:()=>unknown,reason:string|RegExp)=>assert.throws(work,(error:Error)=>typeof reason==='string'?error.message===reason:reason.test(error.message));
const signups={id:'weekly-signups',name:'Weekly signups',provider:'posthog',read:{operation:'query',query:'SELECT toStartOfWeek(timestamp) AS week, count() AS signups FROM events WHERE event = \'signed_up\' GROUP BY week ORDER BY week LIMIT 12;'}};

// Each Service's reads, as its reader checks them.
assert.deepEqual(readServicePresetRead('posthog',signups.read),{operation:'query',query:signups.read.query.slice(0,-1)},'a trailing semicolon goes');
assert.deepEqual(readServicePresetRead('posthog',{operation:'read',id:'dashboards',query:'Growth'}),{operation:'read',id:'dashboards',query:'Growth'});
assert.deepEqual(readServicePresetRead('github',{operation:'search',query:'repo:example/app repo:example/site is:open is:pr'}),{operation:'search',query:'repo:example/app repo:example/site is:open is:pr'});
assert.deepEqual(readServicePresetRead('github',{operation:'read',id:'example/app#12'}),{operation:'read',id:'example/app#12'});
assert.deepEqual(readServicePresetRead('github',{operation:'list'}),{operation:'list'});
assert.deepEqual(readServicePresetRead('cloudflare',{operation:'read',id:'workers'}),{operation:'read',id:'workers'});
refused(()=>readServicePresetRead('posthog',{operation:'query',query:'DELETE FROM events'}),/read-only SELECT/);
refused(()=>readServicePresetRead('posthog',{operation:'query',query:'SELECT 1 LIMIT 500'}),/at most 200 rows/);
refused(()=>readServicePresetRead('posthog',{operation:'query',query:'SELECT 1',id:'dashboards'}),/takes a query/);
refused(()=>readServicePresetRead('posthog',{operation:'read',id:'persons'}),/Read one PostHog list/);
refused(()=>readServicePresetRead('posthog',{operation:'search',query:'x'}),/read with query or read/);
refused(()=>readServicePresetRead('github',{operation:'search',query:'x'.repeat(257)}),/256 characters/);
refused(()=>readServicePresetRead('github',{operation:'read',id:'not an id'}),/owner\/repo#123/);
refused(()=>readServicePresetRead('github',{operation:'list',query:'is:open'}),/takes nothing else/);
refused(()=>readServicePresetRead('cloudflare',{operation:'read',id:'graphql'}),/workers or zones/);
refused(()=>readServicePresetRead('stripe',{operation:'read'}),PRESET_REASONS.service);
refused(()=>readServicePresetRead('__proto__',{operation:'read'}),PRESET_REASONS.service);
refused(()=>readServicePresetRead('github',{operation:'search',query:'is:open',cursor:'2'}),PRESET_REASONS.invalid);
// No key, token or password anywhere in a preset, and no control characters.
refused(()=>readServicePresetRead('github',{operation:'search',query:'ghp_'+'a'.repeat(36)}),PRESET_REASONS.secret);
refused(()=>readServicePresetRead('posthog',{operation:'query',query:'SELECT \'sk-'+'b'.repeat(30)+'\''}),PRESET_REASONS.secret);
refused(()=>saveServicePreset([],{...signups,name:'Key phx_'+'c'.repeat(40)+'1'},now),PRESET_REASONS.secret);
refused(()=>saveServicePreset([],{...signups,note:'Bearer '+'d'.repeat(30)},now),PRESET_REASONS.secret);
refused(()=>saveServicePreset([],{...signups,name:'two\nlines'},now),PRESET_REASONS.control);
refused(()=>saveServicePreset([],{...signups,name:'‮flipped'},now),PRESET_REASONS.control);
refused(()=>saveServicePreset([],{...signups,token:'x'},now),PRESET_REASONS.invalid);
refused(()=>saveServicePreset([],{...signups,read:{...signups.read,key:'x'}},now),PRESET_REASONS.invalid);
for(const id of ['','Weekly','-a','a'.repeat(SERVICE_PRESET_LIMITS.id+1),'a b','../x'])refused(()=>saveServicePreset([],{...signups,id},now),PRESET_REASONS.id);
refused(()=>saveServicePreset([],{...signups,name:''},now),PRESET_REASONS.name);
refused(()=>saveServicePreset([],{...signups,name:'x'.repeat(SERVICE_PRESET_LIMITS.name+1)},now),PRESET_REASONS.name);

// Saving: a new ID adds, a known ID replaces and keeps when it was made; the cap; removing.
const first=saveServicePreset([],signups,now);
assert.deepEqual(first.preset,{id:'weekly-signups',name:'Weekly signups',provider:'posthog',read:{operation:'query',query:signups.read.query.slice(0,-1)},createdAt:now,updatedAt:now});
const again=saveServicePreset(first.presets,{...signups,name:'Signups by week',note:'For the board.'},later);
assert.deepEqual([again.presets.length,again.preset.name,again.preset.note,again.preset.createdAt,again.preset.updatedAt],[1,'Signups by week','For the board.',now,later]);
let many=again.presets;
for(let n=1;n<SERVICE_PRESET_LIMITS.presets;n++)many=saveServicePreset(many,{id:'p'+n,name:'P'+n,provider:'github',read:{operation:'list'}},now).presets;
refused(()=>saveServicePreset(many,{id:'one-more',name:'One more',provider:'github',read:{operation:'list'}},now),PRESET_REASONS.full);
assert.equal(saveServicePreset(many,{...signups,name:'Still replaceable'},later).presets.length,SERVICE_PRESET_LIMITS.presets);
assert.deepEqual(removeServicePreset(again.presets,'weekly-signups'),[]);
refused(()=>removeServicePreset(again.presets,'nope'),PRESET_REASONS.missing);
// A stored preset is checked again; one that no longer passes is not used.
assert.deepEqual(readStoredServicePreset(again.preset),again.preset);
assert.equal(readStoredServicePreset({...again.preset,read:{operation:'query',query:'DROP TABLE events'}}),null);
assert.equal(readStoredServicePreset({...again.preset,createdAt:'yesterday'}),null);
// The one read a preset makes: always its first page.
assert.deepEqual(servicePresetRead(again.preset),{provider:'posthog',operation:'query',query:signups.read.query.slice(0,-1)});
assert.deepEqual(servicePresetRead(saveServicePreset([],{id:'flags',name:'Flags',provider:'posthog',read:{operation:'read',id:'feature-flags'}},now).preset),{provider:'posthog',operation:'read',id:'feature-flags'});

// On the host: the `servicePresets` action keeps them in world.sqlite (`state.service-presets`), never in the practice
// World, and answers every preset after each change.
await withTempDir('worldlet-presets-',async dir=>{
 const ledger=new WorldLedger(path.join(dir,'world'));
 let own=true,clock=now;
 const presets=createServicePresets({ledger:()=>own?ledger:null,now:()=>clock});
 try{
  assert.deepEqual(presets.handle({action:'servicePresets',operation:'list'}),{presets:[]});
  const saved=presets.handle({operation:'save',preset:signups});
  assert.equal(saved.preset?.id,'weekly-signups');assert.deepEqual(saved.presets.map(p=>p.id),['weekly-signups']);
  presets.handle({operation:'save',preset:{id:'open-prs',name:'Open pull requests',provider:'github',read:{operation:'search',query:'repo:example/app is:open is:pr'}}});
  clock=later;
  presets.handle({operation:'save',preset:{...signups,name:'Signups by week'}});
  assert.deepEqual(ledger.servicePresets().map(row=>[row.id,row.name,row.createdAt,row.updatedAt]),[['open-prs','Open pull requests',now,now],['weekly-signups','Signups by week',now,later]]);
  assert.throws(()=>presets.handle({operation:'save',preset:{...signups,read:{operation:'query',query:'DROP TABLE events'}}}),/read-only SELECT/);
  assert.throws(()=>presets.handle({operation:'save',preset:{...signups,name:'sk-'+'e'.repeat(30)}}),(error:Error)=>error.message===PRESET_REASONS.secret);
  assert.throws(()=>presets.handle({operation:'rename'}),/Unknown presets operation/);
  assert.deepEqual(presets.handle({operation:'delete',id:'open-prs'}).presets.map(p=>p.id),['weekly-signups']);
  assert.deepEqual(ledger.servicePresets().map(row=>row.id),['weekly-signups'],'deleted from the ledger');
  assert.throws(()=>presets.handle({operation:'delete',id:'open-prs'}),(error:Error)=>error.message===PRESET_REASONS.missing);
  // A stored row that no longer passes is left out, not used.
  ledger.saveServicePreset({id:'broken',name:'Broken',provider:'posthog',read:{operation:'query',query:'DELETE FROM events'},createdAt:now,updatedAt:now});
  assert.deepEqual(loadServicePresets(ledger).map(p=>p.id),['weekly-signups']);
  assert.ok(!JSON.stringify(ledger.servicePresets()).match(/token|apiKey|authorization/i),'no key is kept with a preset');
  own=false;
  assert.throws(()=>presets.handle({operation:'list'}),/your own World/,'not in the practice World');
 }finally{ledger.close();}
});
console.log('PASS Service presets: each read checked as its Service checks it, no keys or control characters, the cap, saved and removed in world.sqlite only in the person\'s own World.');
