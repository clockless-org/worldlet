import assert from 'node:assert/strict';
import {WORLD_LAYOUT} from '../ui/world/world-layout.ts';
import {APPLET_SPRITES} from '../ui/world/applet-sprites.ts';
import {WORLD_PRESETS} from '../ui/world/world-presets.ts';
import {WORLD_APPS} from '../core/applets/catalog.ts';
import {extraPlacements,resolvePlacements} from '../ui/world/slot-placement.ts';
import {emptyRegionLayout} from '../ui/world/region-layout.ts';
const r=WORLD_LAYOUT.regions;
assert.deepEqual(r.home.center,[.523,.529]);
assert.ok(r.work.center[1]>r.health.center[1]);
assert.ok(r.people.center[0]<r.library.center[0]);
assert.ok(r.library.center[1]<r.home.center[1]);
assert.ok(r.travel.center[1]>r.home.center[1]);
assert.equal(WORLD_PRESETS.find(p=>p.id==='money').title,'Life');
assert.equal(WORLD_PRESETS.find(p=>p.id==='travel').title,'Entertainment');
assert.equal(WORLD_PRESETS.find(p=>p.id==='library').title,'Social');
assert.deepEqual(Object.keys(APPLET_SPRITES).sort(),WORLD_APPS.map(a=>a.key).sort());
for(const app of WORLD_APPS){
 const s=APPLET_SPRITES[app.key];assert.equal(s.region,app.region||null);
 if(!s.region)continue;
 const region=r[s.region], [x,y,w,h]=region.bounds;
 assert.ok(s.anchor[0]>=x&&s.anchor[0]<=x+w&&s.anchor[1]>=y&&s.anchor[1]<=y+h,app.key+' is inside its region');
 assert.deepEqual(region.slots[app.key].anchor,s.anchor);
 // Only the first five members stand on the ground; the rest wait on the region shelf.
 const ground=Object.keys(region.slots).slice(0,region.placements.length);if(!ground.includes(app.key))continue;
 for(const other of ground)if(other!==app.key){const t=region.slots[other];assert.ok(Math.hypot(s.anchor[0]-t.anchor[0],s.anchor[1]-t.anchor[1])>.025,app.key+' has a distinct slot');}
}
// A zoomed area keeps Applets at their overview size and uses the room for more of its own (owner request 2026-10-08).
const rooms=WORLD_APPS.map(a=>({...a,moduleId:a.id,entity:'app',region:a.region,buildingId:'building-'+a.region}));
const layout=emptyRegionLayout();rooms.filter(a=>a.region==='work').forEach((a,i)=>layout.lastUsedAt[a.id]=1000-i);
const ground=resolvePlacements(rooms,{},()=>true,{},layout);
assert.deepEqual(extraPlacements('work',1,rooms,()=>true,layout,ground),{},'nothing extra at the overview');
for(const zoom of [1.6,2.4]){
 const extra=extraPlacements('work',zoom,rooms,()=>true,layout,ground),ids=Object.keys(extra),[x,y,w,h]=r.work.bounds;
 assert.ok(ids.length>=8,'a zoomed Work shows more Applets: '+ids.length);
 assert.ok(ids.every(id=>!ground[id]&&rooms.find(a=>a.id===id).region==='work'),'only the area\'s own Applets beyond its five');
 // Recently used order continues the panel's list: the most recent extras take the rear places first.
 const order=rooms.filter(a=>a.region==='work'&&!ground[a.id]).map(a=>a.id).slice(0,ids.length);
 assert.deepEqual([...ids].sort((a,b)=>extra[a].anchor[1]-extra[b].anchor[1]||extra[a].anchor[0]-extra[b].anchor[0]),order);
 for(const id of ids){const [ax,ay]=extra[id].anchor;
  assert.ok(ax>x&&ax<x+w&&ay>y&&ay<r.work.label[1],id+' stands on the court above its name');
  for(const slot of r.work.placements)assert.ok(Math.abs(slot.anchor[0]-ax)>=.048/zoom*.9||Math.abs(slot.anchor[1]-ay)>=.04/zoom*.9,id+' clears the five places');
 }
}
console.log('PASS registered layout, stable IDs, all Applets in named region slots; a zoomed area shows more Applets beyond its five');
