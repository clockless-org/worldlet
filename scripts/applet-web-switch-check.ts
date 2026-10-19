import {appletSupport} from '../context/applets/applet-support.ts';
import {hostFeatures} from '../platform/bridge/features.ts';
import assert from 'node:assert/strict';
import {APP_DEFINITIONS} from '../context/applets/catalog.ts';
// A native Applet whose service also has a website declares that site as `fullView.original`, which is what shows the
// Native / Web switch in its top bar (ui/shell/notion-world.ts syncAppletMode). Only Applets with no website of
// their own, or whose website is a different product from the native view, are listed here.
const NO_WEB=new Set(['apple-notes','apple-reminders','claude-code','codex','docker','meetings','messages','obsidian','voice-memos','weather']);
const native=APP_DEFINITIONS.filter(a=>a.fullView?.kind==='scene');
for(const app of native){
 const url=app.fullView.original?.url;
 if(NO_WEB.has(app.key)){assert.equal(url,undefined,app.key+' has no website to switch to');continue;}
 assert.ok(url&&new URL(url).protocol==='https:',app.key+' declares its website, so its Native / Web switch shows');
}
for(const key of NO_WEB)assert.ok(native.some(a=>a.key===key),key+' is still a native Applet');
console.log(`PASS ${native.length-NO_WEB.size} native Applets with a website show the Native / Web switch; ${NO_WEB.size} without one do not`);

// Branded services open their real sites; the four core paper Applets retain their custom Open views.
for(const key of ['github','notion','stripe','paypal','todoist','linear','supabase','google-drive','google-docs','google-sheets','google-slides']){
 const app=APP_DEFINITIONS.find(a=>a.key===key)!;assert.equal(app.fullView.kind,'web',key+' opens the original website');
 assert.ok(app.fullView.url&&new URL(app.fullView.url).protocol==='https:',key+' keeps a real HTTPS destination');
}
for(const key of ['gmail','google-calendar','apple-notes','apple-reminders'])assert.equal(APP_DEFINITIONS.find(a=>a.key===key)?.fullView.kind,'scene');

for(const key of ['google-drive','google-docs','google-sheets','google-slides','supabase','linear','todoist'])assert.equal(appletSupport(key,hostFeatures({platform:'windows',hostCapabilities:{version:1,features:{}}})).supported,true,'The original website does not require a native source reader: '+key);
