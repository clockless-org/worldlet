// The sample world is Kelvin's fictional week, authored in sample-persona.json.
// This check reads the data the way the app does and holds it to the rules a real
// world is held to: every record owned once, every link resolving, every attention
// item within the contract, every Applet with something to show, dates that resolve.
import assert from 'node:assert/strict';
import dataset from '../ui/world/sample-persona.json' with {type:'json'};
import {WORLD_APPS} from '../core/applets/catalog.ts';
import {GAME_APPLETS,RANDOM_GAME_URL} from '../core/applets/definitions/games.ts';
import {WORLD_PRESETS} from '../ui/world/world-presets.ts';
import {makeSampleWorld} from '../ui/world/sample-data.ts';
import {sampleItems} from '../ui/world/sample-persona.ts';

const world=makeSampleWorld(),notes=world.pages.filter(p=>p.id!=='sample-root'&&!p.webApp&&!p.worldItemId),items=world.pages.filter(p=>p.worldItemId);
const ids=new Set(notes.map(p=>p.id)),titles=new Set(notes.map(p=>p.title)),page=id=>notes.find(p=>p.id===id);
assert.equal(dataset.fictional,true);assert.equal(notes.length,dataset.notes.length);assert.equal(ids.size,notes.length);
assert.deepEqual(new Set(world.apps.map(a=>a.moduleId)),new Set(WORLD_APPS.map(a=>a.id)));
assert.equal(world.matters.length,dataset.matters.length);
// The X terminal is a functional device, not one of the fictional records.
assert.equal(world.pages.filter(p=>p.webApp?.kind==='x').length,1);
// Every note is owned by exactly one Matter; every item by the Applet that published it.
const owned=world.spaces.flatMap(r=>r.children).filter(id=>id!=='device-x');
assert.equal(new Set(owned).size,owned.length,'nothing is owned twice');
assert.deepEqual(new Set(owned),new Set([...ids,...items.map(p=>p.id)]),'everything is owned');
for(const p of notes)assert.equal(world.matters.some(m=>m.children.includes(p.id)),true,p.id+' belongs to a Matter');
for(const p of items)assert.equal(world.apps.find(a=>a.key===p.sourceProvider)?.children.includes(p.id),true,p.id+' belongs to its Applet');
for(const room of world.spaces){assert.ok(room.moduleId,room.id);assert.ok(room.status,room.id+' status');}
// Each region holds the Matters its recipe has slots for, in the order the data declares.
const slots={home:4,work:5,library:1,money:5,health:1,travel:0,people:1};
for(const preset of WORLD_PRESETS){const rows=world.matters.filter(m=>m.region===preset.id);assert.equal(rows.length,slots[preset.id],preset.id+' matters');assert.deepEqual(rows.map(m=>m.slot),rows.map((_,i)=>i),preset.id+' slot order');}
assert.deepEqual(world.matters.filter(m=>m.region==='money').map(m=>m.key).slice(-3),['japan','camping','memories'],'trips live in Life, after its own two');
for(const p of notes){
 assert.ok(!/\p{Script=Han}|\{\{/u.test(p.text),p.id+' English and resolved dates');
 assert.equal(p.text,p.title+'\n'+p.markdown);
 assert.match(p.provenance[0].label,new RegExp('Fictional .* record · '+dataset.name));
 assert.ok(p.matter&&p.applet,p.id+' names its Matter and Applet');
 for(const [,target]of p.markdown.matchAll(/\[\[([^\]]+)\]\]/g))assert.ok(titles.has(target),p.id+' links '+target);
}
// Attention items: the contract every Applet publishes through, with evidence in the notes.
const authored=sampleItems();assert.equal(items.length,authored.length);assert.equal(items.length,7,'curated seven-item attention panel');
const providers=new Set(WORLD_APPS.map(a=>a.key));
for(const item of authored){
 assert.ok(item.title.length<=24&&item.title.split(/\s+/).length<=4,'title fits one line: '+item.title);
 assert.ok(item.context.length<=64,'context fits two lines: '+item.title);
 assert.ok(item.summary.length>40,'summary has room to explain: '+item.title);
 assert.ok(providers.has(item.provider),item.provider);
 assert.ok(['task','event','update'].includes(item.kind));
 for(const evidence of item.sources){const original=page(evidence.id);assert.ok(original?.text.includes(evidence.quote),'Exact cross-Applet evidence: '+evidence.id);}
 const source=page(item.sources[0].id);assert.ok(source,item.title+' cites a note');
 assert.ok(source.text.includes(item.sources[0].quote),item.title+' quotes its note exactly');
 assert.ok(!/\{\{/.test(item.summary+item.sources[0].quote+(item.start||'')),item.title+' resolved');
 if(item.kind==='event'){const start=Date.parse(item.start);assert.ok(start>Date.now()-86400000&&start<Date.now()+31*86400000,item.title+' happens within the month');}
}
assert.deepEqual(['event','task','update'].map(kind=>authored.filter(i=>i.kind===kind).length),[2,2,3]);
assert.equal(authored.filter(i=>i.kind==='update'&&i.priority==='high').length,1);
const meetings=authored.filter(i=>i.kind==='event').map(i=>Date.parse(i.start)-Date.now());
assert.ok(meetings.some(ms=>ms>0&&ms<3600000)&&meetings.some(ms=>ms>86400000));
// Every default Applet has sample content, reads as Sample, and lights up; optional ones stay hidden until unlocked.
// Games read nothing and hold no records: in the sample they stay plain Local games, never a sample connection.
// The Random game is the one website among them: it opens worldlet.ai/games/random/.
const gameKeys=new Set(GAME_APPLETS.map(a=>a.key)),games=world.apps.filter(a=>gameKeys.has(a.key));assert.equal(games.length,5,'the Games area holds its five games');
assert.equal(games.filter(a=>a.fullView?.kind==='game').length,4,'four boards');assert.equal(games.find(a=>a.key==='random-game')?.fullView?.url,RANDOM_GAME_URL);
for(const app of games){assert.equal(app.children.length+app.sampleRecords.length,0,app.moduleId+' holds no records');if(app.fullView?.kind==='game')assert.equal(app.status.label,'Local',app.moduleId+' status');assert.ok(!world.moduleConnections?.some(c=>c.provider===(app.provider||app.key)),app.moduleId+' claims no sample connection');}
const defaultApps=world.apps.filter(a=>a.installByDefault!==false&&!gameKeys.has(a.key));
for(const app of defaultApps){
 assert.ok(app.children.length+app.sampleRecords.length>0,app.moduleId+' has nothing to show');
 assert.equal(app.status.state,'sample',app.moduleId+' status');assert.match(app.status.label,/^(?:Preset content · )?\d+ /);
}
assert.equal(world.buildings.filter(b=>b.unbuilt).length,0,'every region is built');
const sampleProviders=new Set(world.moduleConnections.map(c=>c.provider));
for(const app of defaultApps)assert.ok(sampleProviders.has(app.provider||app.key),app.moduleId+' reads as a sample connection');
// Optional Applets with authored notes read as sample connections too; nothing else does.
for(const provider of sampleProviders)assert.ok(world.apps.some(a=>(a.provider||a.key)===provider&&a.children.length+a.sampleRecords.length>0),provider+' has sample content');
// The trip diorama and the persona.
assert.match(page('sample-profile').text,/Yiwen/);assert.match(page('sample-japan-booking').text,/\$180/);assert.match(page('sample-runway').text,/198,800/);
assert.equal((new Date(page('sample-japan-calendar').sceneFacts.returnDate).getTime()-new Date(page('sample-japan-calendar').sceneFacts.departure).getTime())/86400000,6);
assert.deepEqual(world.matters.find(m=>m.key==='japan').trip,{route:'sample-japan-map',calendar:'sample-japan-calendar',flight:'sample-japan-flight',stay:'sample-japan-booking'});
assert.equal(world.viewObjects.length,world.apps.length+world.matters.length);for(const o of world.viewObjects)for(const id of o.pageIds)assert.ok(ids.has(id)||id==='device-x'||items.some(p=>p.id===id));
assert.equal(world.persona.name,dataset.name);assert.equal(world.profilePageId,'sample-profile');assert.ok(world.persona.summary);
for(const id of world.sampleTour)assert.ok(ids.has(id),'tour stop '+id);
for(const d of world.sampleDecisions)assert.ok(ids.has(d.pageId)&&d.choices.length===2,'decision '+d.id);
// A settled item comes back settled, and goes quiet the way the ledger would make it.
const settled=makeSampleWorld({itemStatus:{'sample-item-1':'done','sample-item-6':'dismissed'}});
assert.equal(settled.pages.find(p=>p.worldItemId==='sample-item-1').activities.length,0);assert.equal(settled.pages.find(p=>p.worldItemId==='sample-item-6').events.length,0);
assert.equal(world.pages.find(p=>p.worldItemId==='sample-item-1').activities.length,1);
console.log('PASS '+notes.length+' fictional English notes in '+world.matters.length+' Matters, '+items.length+' attention items within the contract and quoting their notes, every Applet with sample content and a Sample status, resolved dates, complete ownership and all related-note links');

// Exercise real fixture edits across reloads; the canonical authored seed stays untouched.
const {createContentStore}=await import('../ui/shell/content-store.ts');
const pages=new Map(world.pages.map(p=>[p.id,p])),sections=world.spaces,values=new Map();
const storage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v)};
let store=createContentStore({pages,sections,key:'fixture-edits',storage});
const mutate=(name,args)=>store.mutate(name,args,{operationId:crypto.randomUUID()});
const created=mutate('create_content',{place_id:'place-matter-home',title:'Balcony door',body:'Plane the bottom edge before the visit.'});assert.equal(created.ok,true);
let result=mutate('patch_content',{id:'sample-mail-lease',revision:store.revision('sample-mail-lease'),field:'body',old_text:'$1,560',new_text:'$1,540'});assert.equal(result.ok,true);
assert.match(pages.get('sample-mail-lease').markdown,/1,540/);assert.ok(sections.find(r=>r.id==='place-matter-home').children.includes(created.id));
const fresh=makeSampleWorld();store=createContentStore({pages,sections:fresh.spaces,key:'fixture-edits',storage});assert.ok(pages.has(created.id));assert.match(pages.get('sample-mail-lease').markdown,/1,540/);
result=mutate('delete_content',{id:created.id,revision:store.revision(created.id)});assert.equal(result.ok,true);assert.equal(pages.has(created.id),false);
result=mutate('restore_content',{id:created.id});assert.equal(result.ok,true);assert.ok(pages.has(created.id));
assert.match(makeSampleWorld().pages.find(p=>p.id==='sample-mail-lease').markdown,/1,560/);
console.log('PASS sample create, precise edit, local persistence, delete, restore and unchanged canonical seed');
