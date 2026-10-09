import assert from 'node:assert/strict';
import {APP_DEFINITIONS} from '../core/applets/catalog.ts';
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
