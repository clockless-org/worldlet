import assert from 'node:assert/strict';
import {emptyRegionLayout,moveRegionApplet,parseRegionLayout,pinnedPlace,pinRegionApplet,recentlyUsedFirst,readRegionLayout,recordAppletUse} from '../ui/world/region-layout.ts';
import {updateOnboarding} from '../core/onboarding/onboarding.ts';
import {WORLD_APPS} from '../core/applets/catalog.ts';
import {recommendForArea,appletHost,AREA_RECOMMEND_LIMIT} from '../core/applets/area-recommend.ts';
import {WORLD_LAYOUT} from '../ui/world/world-layout.ts';
import {APPLET_SPRITES} from '../ui/world/applet-sprites.ts';
import {resolvePlacements,freePlacements,nearestPlacement,sameAnchor,slotsForApplet} from '../ui/world/slot-placement.ts';
const rooms=WORLD_APPS.map(a=>({key:a.key,moduleId:a.id,entity:'app'}));
const all=resolvePlacements(rooms,{},()=>true);
for(const key of ['apple-notes','apple-reminders'])assert.equal(WORLD_APPS.find(a=>a.key===key)?.region,'home');
for(const [region,r] of Object.entries(WORLD_LAYOUT.regions)){
 assert.equal(r.placements.length,5);
 const [a,b,c,d,e]=r.placements.map(s=>s.anchor),near=(x,y)=>assert(Math.abs(x-y)<1e-8,region+' shares the same court spacing');
 near(b[0]-a[0],.048);near(c[0]-b[0],.048);near(e[0]-d[0],.048);
 near(d[1]-a[1],.04);near(e[1],d[1]);near(b[1],a[1]);near(c[1],a[1]);near((d[0]+e[0])/2,b[0]);
 assert.deepEqual(r.placements,[...r.placements].sort((a,b)=>a.anchor[1]-b.anchor[1]||a.anchor[0]-b.anchor[0]),region+' slots follow back-to-front, left-to-right order');
 const members=rooms.filter(a=>a.key!=='weather'&&APPLET_SPRITES[a.key]?.region===region).slice(0,5).reverse();
 const pinned=emptyRegionLayout();pinned.pins[region]=members.map(a=>a.moduleId);
 const positions=resolvePlacements(rooms,{},()=>true,{},pinned);
 members.forEach((a,i)=>assert.equal(positions[a.moduleId].id,r.placements[i].id,'resident order maps to the same ground slot'));
}
assert(Object.keys(all).length<=30,'At most five Applets per region');
assert.equal(new Set(Object.values(all).map(s=>s.id)).size,Object.keys(all).length,'No overlapping occupancy');
const visible=r=>r.moduleId==='app-gmail'||r.moduleId==='app-google-calendar';
const layout=resolvePlacements(rooms,{'app-gmail':[.99,.99]},visible);
assert(sameAnchor(layout['app-gmail'].anchor,APPLET_SPRITES.gmail.anchor),'Legacy coordinates reset to new terrain');
const targets=freePlacements('gmail','app-gmail',layout);
assert(!targets.some(s=>s.id===layout['app-google-calendar'].id));
assert(targets.some(s=>s.id===layout['app-gmail'].id),'Own source slot remains valid');
const next=targets.find(s=>s.id!==layout['app-gmail'].id)!;
assert.equal(nearestPlacement(targets,next.anchor,1)?.id,next.id);
assert.equal(nearestPlacement(targets,[0,0],1),null,'Invalid drop cannot persist');
const saved={'app-gmail':next.anchor,'app-google-calendar':next.anchor};
const migrated=resolvePlacements(rooms,saved,visible);
assert.notEqual(migrated['app-gmail'].id,migrated['app-google-calendar'].id,'Conflicting saves resolve deterministically');
const prefs=emptyRegionLayout();const index=slotsForApplet('gmail').findIndex(s=>s.id===next.id);moveRegionApplet(prefs,'app-gmail','home',index);
const restart=resolvePlacements(rooms,{},visible,{},JSON.parse(JSON.stringify(prefs)));
assert.equal(restart['app-gmail'].id,next.id,'Pinned placement survives serialization');
assert.equal(slotsForApplet('unknown').length,0);
const recent=emptyRegionLayout();recent.usage={old:100,new:1};recent.lastUsedAt={old:1000,new:2000};
assert.deepEqual([{moduleId:'old',title:'A'},{moduleId:'new',title:'B'}].sort((a,b)=>recentlyUsedFirst(a,b,recent)).map(a=>a.moduleId),['new','old'],'Recently used goes by last use, not frequency');
const oldStorage=globalThis.localStorage;
Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:()=>JSON.stringify({...recent,lastUsedAt:{new:2000,invalid:-1}})}});
assert.deepEqual(readRegionLayout('fixture').lastUsedAt,{new:2000});
Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:()=>JSON.stringify({usage:{old:100}})}});
assert.deepEqual(readRegionLayout('fixture').lastUsedAt,{},'old frequency counts are not fabricated timestamps');
Object.defineProperty(globalThis,'localStorage',{configurable:true,value:oldStorage});
const before=resolvePlacements(rooms,{},visible,{},prefs);
const withNotes=resolvePlacements(rooms,{},r=>visible(r)||r.moduleId==='app-apple-notes',{},prefs);
assert(withNotes['app-apple-notes'],'using a new app fills free ground space');assert.deepEqual(withNotes['app-gmail'],before['app-gmail'],'pinned place stays fixed');
console.log('PASS named slots: complete catalog, legacy fallback, occupied exclusion, snap, invalid drop and reload.');
// Owner request 2026-10-04: an area's places hold its most recently used Applets, the most recent first, and a
// pinned Applet keeps its place.
const home=rooms.filter(a=>a.key!=='weather'&&APPLET_SPRITES[a.key]?.region==='home'),homeSlots=WORLD_LAYOUT.regions.home.placements;
assert(home.length>6,'Home has more Applets than places');
const order=(layout:any)=>{const placed=resolvePlacements(rooms,{},()=>true,{},layout);return homeSlots.map(slot=>Object.keys(placed).find(id=>placed[id].id===slot.id)??null);};
const used=emptyRegionLayout(),catalogOrder=order(used);
assert.deepEqual(order(JSON.parse(JSON.stringify(used))),catalogOrder,'never-used Applets keep their catalog order');
const sixth=home[home.length-1].moduleId;assert(!catalogOrder.includes(sixth));
let t=1000;for(const a of home.slice(0,5))recordAppletUse(used,a.moduleId,t+=10);
assert.deepEqual(order(used),home.slice(0,5).reverse().map(a=>a.moduleId),'the most recently used stands in the first place');
recordAppletUse(used,sixth,t+=10);
const afterSixth=order(used);
assert.equal(afterSixth[0],sixth,'using an Applet beyond the ground brings it to the front');
assert(!afterSixth.includes(home[0].moduleId),'the least recently used leaves the ground');
pinRegionApplet(used,home[0].moduleId,'home',3);
recordAppletUse(used,home[1].moduleId,t+=10);
const pinnedOrder=order(used);
assert.equal(pinnedOrder[3],home[0].moduleId,'a pinned Applet keeps its place');
assert.equal(pinnedOrder[0],home[1].moduleId,'the others still follow recent use around it');
assert.deepEqual(pinnedPlace(used,home[0].moduleId),{region:'home',index:3});
assert.deepEqual(order(parseRegionLayout(JSON.parse(JSON.stringify(used)))),pinnedOrder,'the layout comes back from the World unchanged');
pinRegionApplet(used,home[0].moduleId,'home',null);
assert.equal(pinnedPlace(used,home[0].moduleId),null);assert(!order(used).includes(home[0].moduleId),'unpinned, it follows recent use again');
assert.deepEqual(parseRegionLayout({version:1,pins:{home:[home[4].moduleId]}}).pins,{},'version 1 pins were every filled place, not the person\'s, so they are not read');
// An Applet that came into the World on its own (a moment or ongoing Applet) counts its arrival as a use.
const arrived={key:'moment',moduleId:'app-wgt-abcdefghij',entity:'app',region:'home',installByDefault:false,arrivedAt:t+=10};
const withMoment=resolvePlacements([...rooms,arrived],{},()=>true,{},used);
assert.equal(withMoment[arrived.moduleId]?.id,homeSlots[0].id,'a new moment Applet stands in front');
// The layout is kept in the World's configuration (onboarding.regionLayout), bounded there.
const kept=updateOnboarding({version:1,presets:['home'],completed:true},{operation:'regionLayout',layout:{...used,usage:{x:-1,y:2},extra:true}});
assert.deepEqual(parseRegionLayout(kept.regionLayout),{...parseRegionLayout(used),usage:{y:2}});assert.equal((kept.regionLayout as any).extra,undefined);assert.deepEqual((kept.regionLayout as any).usage,{y:2});
assert.throws(()=>updateOnboarding({version:1,presets:['home'],completed:true},{operation:'regionLayout',layout:[]}),/Invalid area layout/);
// An Area recommends related Applets the person does not have yet (owner Order 2026-10-07): its own category first,
// then installed apps, then sites visited in Worldlet's browser, then catalog order; never theirs, never removed ones.
{
 const apps=WORLD_APPS.map(a=>({id:a.id,key:a.key,category:a.region,host:appletHost(a)}));
 const mine=new Map([['app-github','work'],['app-slack','work']]);
 const work=recommendForArea({area:'work',apps,mine});
 assert.equal(work.length,AREA_RECOMMEND_LIMIT,'eight at most');
 assert.ok(work.every(id=>WORLD_APPS.find(a=>a.id===id)?.region==='work'&&!mine.has(id)),'only Work Applets the person does not have');
 assert.deepEqual(work,apps.filter(a=>a.category==='work'&&!mine.has(a.id)).slice(0,AREA_RECOMMEND_LIMIT).map(a=>a.id),'catalog order without other signals');
 const ranked=recommendForArea({area:'work',apps,mine,installed:new Set(['zoom']),visits:{'linear.app':4,'m.vercel.com':9}});
 assert.deepEqual(ranked.slice(0,3),['app-zoom','app-vercel','app-linear'],'installed, then visited (subdomains count), then catalog order');
 assert.ok(!recommendForArea({area:'work',apps,mine,removed:new Set(['app-zoom']),installed:new Set(['zoom'])}).includes('app-zoom'),'removed Applets are not pushed back');
 // Moving Spotify into Work makes Explore Applets related to Work, after Work's own.
 const moved=recommendForArea({area:'work',apps,mine:new Map([...mine,['app-spotify','work']]),limit:200});
 assert.ok(moved.includes('app-youtube')&&moved.indexOf('app-youtube')>moved.indexOf('app-zoom'),'moved-in categories follow the Area\'s own');
 assert.ok(!recommendForArea({area:'work',apps,mine,limit:200}).includes('app-youtube'),'unrelated categories stay out');
}
console.log('PASS ground follows recent use: most recent first, pins hold, moments arrive in front, kept in the World.');
