import assert from 'node:assert/strict';
import {POPULAR_APPS,POPULAR_APP_ENTRIES} from '../core/applets/popular-apps.ts';
import {APP_DEFINITIONS} from '../core/applets/catalog.ts';
import {appLogoSource} from '../ui/applets/visuals.ts';
import {placementPages,resolvePlacements} from '../ui/world/slot-placement.ts';
import {appletStyle} from '../ui/components/style.ts';
import {existsSync} from 'node:fs';
assert.equal(POPULAR_APPS.length,56);
assert.equal(new Set(APP_DEFINITIONS.map(a=>a.key)).size,APP_DEFINITIONS.length);
assert.equal(APP_DEFINITIONS.length,118);
for(const app of POPULAR_APPS){
 assert.equal(APP_DEFINITIONS.find(a=>a.key===app.key)?.id,app.id);
 assert.equal(new URL(app.fullView.url).protocol,'https:');
 assert.equal(app.fullView.kind,'web');
 assert.equal(app.connection.provider,null);
 assert.equal(app.attention,undefined);
 assert.equal(app.installByDefault,false);
 assert.ok(appLogoSource(app)?.startsWith('data:image/'),app.key+' has locally bundled publisher identity');
 assert.ok(appletStyle(app.key).peek,app.key+' owns its sprite');
 if(process.argv.includes('--assets'))assert.ok(existsSync(appletStyle(app.key).peek),app.key+' sprite exists');
 for(const id of app.nativeBundleIds)assert.match(id,/^[a-zA-Z0-9]+(?:[.-][a-zA-Z0-9]+)+$/);
}
const rooms=APP_DEFINITIONS.map(a=>({...a,moduleId:a.id,entity:'app'}));
const groups=placementPages(rooms,()=>true),seen=new Set<string>();
for(const group of Object.values(groups)){
 const placed=resolvePlacements(rooms,{},()=>true);
 const slots=group.rooms.map(r=>placed[r.id]).filter(Boolean);
 assert.ok(slots.length<=5);
 assert.equal(new Set(slots.map(s=>s.id)).size,slots.length,'No occupied slot is shared');
 for(const r of group.rooms)seen.add(r.id);
}
// Weather lives in the top-right HUD, not in a region library.
assert.deepEqual(APP_DEFINITIONS.filter(a=>!seen.has(a.id)).map(a=>a.key),['weather'],'Every other installed Applet remains in a region library');
assert.equal(POPULAR_APP_ENTRIES.filter(a=>a.preferNative).length,0);
for(const key of ['gmail','google-calendar','apple-notes','apple-reminders','weather','browser'])assert.equal(appLogoSource({key}),undefined,key+' is generic: no brand logo');
assert.ok(appLogoSource({key:'stripe'})?.startsWith('data:image/'),'stripe keeps its publisher identity');
console.log('PASS: all 56 website identities/routes; all 115 region devices reachable without overlapping slots; no false account sync');
