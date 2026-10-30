// A World page in a web browser (contracts/web-world.ts) does not offer what its window has no equivalent for: its
// socket's handshake turns those HostFeatures off (WEB_PAGE_FEATURES), the page merges them over the snapshot's
// (platform/bridge/features.ts), and Fox's tools that need them answer that they are not available in a browser
// window. The app's own page, which hears nothing from a socket, keeps every flag as before. The real page in headless
// Chromium is checked by node-host-check.ts.
import assert from 'node:assert/strict';
import {PAGE_FEATURES} from '../contracts/platform.ts';
import {WEB_PAGE_FEATURES,WEB_PAGE_UNAVAILABLE,webDenied} from '../contracts/web-world.ts';
import {hostFeatures,pageFeatures} from '../platform/bridge/features.ts';
import {appletSupport,appletsOffPage} from '../context/applets/applet-support.ts';
import {pageToolFeature} from '../agent/gate/page-features.ts';
import {createWorldToolRuntime} from '../platform/bridge/world-tool-runtime.ts';
import {createWebPage,type PageSocket} from '../platform/host/web-page.ts';
import {hostCapabilities} from '../platform/host/capabilities.ts';

// 1. The page flags: on for every app window, older hosts and fixtures that leave them out; off only when said.
const app={platform:'macos',hostCapabilities:hostCapabilities(()=>true)};
for(const key of PAGE_FEATURES){
 assert.equal(hostFeatures(app,{})[key],true,`the app's window has ${key}`);
 assert.equal(hostFeatures({platform:'windows'},{})[key],true,`a host from before the flags keeps ${key}`);
 assert.equal(hostFeatures({platform:'macos',hostCapabilities:{version:1,features:{}}},{})[key],true,`a snapshot that leaves out ${key} keeps it`);
 assert.equal(hostFeatures({platform:'macos',hostCapabilities:{version:1,features:{[key]:false}}},{})[key],false,`a host without ${key} says so`);
}
assert.equal(hostFeatures({platform:'macos',hostCapabilities:{version:1,features:{}}},{}).localMusic,false,'host services still fail closed');
// A host that does not implement the action behind a page flag reports it off (the Node host has no browser or voice).
const headless=hostCapabilities(feature=>!['websitePages','youtube','worldAudio','voice','madePages'].includes(feature)).features;
for(const key of PAGE_FEATURES)assert.equal(headless[key],false,`a host without ${key}'s action reports it off`);

// 2. The page's own transport turns them off whatever the snapshot says; the app's page has no such flags.
assert.deepEqual(pageFeatures({}),{},'the app\'s page hears no page flags');
assert.deepEqual(pageFeatures({worldletWebHost:{features:WEB_PAGE_FEATURES}}),WEB_PAGE_FEATURES);
const web=hostFeatures(app,WEB_PAGE_FEATURES);
for(const key of Object.keys(WEB_PAGE_FEATURES))assert.equal((web as unknown as Record<string,boolean>)[key],false,`a browser's World page has no ${key}`);
assert.equal(web.browserBookmarks,true,'flags the page does not touch stay as the host says');
const mac={platform:'macos',hostCapabilities:{version:1,features:{leadingWindowControls:true}}};
assert.equal(hostFeatures(mac,{}).leadingWindowControls,true,'the Mac app keeps room for its window buttons');
assert.equal(hostFeatures(mac,WEB_PAGE_FEATURES).leadingWindowControls,false,'a browser\'s page has no window buttons over its corner');
for(const key of ['websitePages','youtube','worldAudio','localMusic','voice','madePages'])assert.ok(WEB_PAGE_UNAVAILABLE[key as keyof typeof WEB_PAGE_UNAVAILABLE]?.includes('browser window'),`${key} says why it is missing`);

// What Fox made shows in a native view over the app's window: a browser's page is told so, and a card there keeps its
// template (artifactPages `get` and `make` stay; `show` is refused, which the card takes as no page).
for(const body of [{action:'widgetPlayer',operation:'show'},{action:'widgetPlayer',operation:'hide'},{action:'madeGamePlayer',operation:'show'},{action:'artifactPages',operation:'show'},{action:'artifactPages',operation:'layout'}])
 assert.equal(webDenied(body),WEB_PAGE_UNAVAILABLE.madePages,`${body.action} ${body.operation} is refused with the reason`);
for(const operation of ['get','make'])assert.equal(webDenied({action:'artifactPages',operation}),'',`artifactPages ${operation} stays`);

// 3. YouTube is left out of a browser's World and its catalog; the app's World is as before.
assert.deepEqual(appletsOffPage({}),[],'the app\'s World hides nothing');
assert.deepEqual(appletsOffPage(WEB_PAGE_FEATURES),['app-youtube'],'a browser\'s World draws no YouTube');
assert.equal(appletSupport('youtube',hostFeatures(app,{})).supported,true);
assert.match(appletSupport('youtube',web).reason||'',/browser window/,'YouTube says it needs the app');
assert.equal(appletSupport('browser',web).supported,true,'the Browser stays: its sites open in a new tab');

// 4. Fox's tools that need the page's window answer clearly in a browser, and run as before in the app.
assert.equal(pageToolFeature('use_youtube',{operation:'play'}),'youtube');
assert.equal(pageToolFeature('open_applet',{id:'app-youtube'}),'youtube');
assert.equal(pageToolFeature('open_applet',{id:'app-gmail'}),'');
assert.equal(pageToolFeature('automate_browser',{operation:'open'}),'websitePages');
assert.equal(pageToolFeature('automate_browser',{operation:'receipts'}),'','receipts are records on the host');
assert.equal(pageToolFeature('browse_web',{operation:'history'}),'','browsing history needs no page in view');
assert.equal(pageToolFeature('browse_web',{operation:'open'}),'websitePages');
assert.equal(pageToolFeature('scroll_browser',{direction:'down'}),'websitePages');
assert.equal(pageToolFeature('control_background_music',{operation:'status'}),'worldAudio');
assert.equal(pageToolFeature('control_local_music',{operation:'status'}),'localMusic');
assert.equal(pageToolFeature('inspect_world',{}),'');
const scope=globalThis as {worldletWebHost?:unknown};
const run=async()=>{
 const calls:string[]=[];
 const runtime=createWorldToolRuntime({execute:async(name:string)=>{calls.push(name);return {ok:true};},call:async(action:string)=>{calls.push(action);return {ok:true,playing:false};},request:'play the next video'});
 return {calls,results:[await runtime.callTool('use_youtube',{operation:'status'},'t1'),await runtime.callTool('scroll_browser',{direction:'down'},'t2'),await runtime.callTool('control_background_music',{operation:'status'},'t3')]};
};
const inApp=await run();
assert.ok(inApp.results.every(result=>!String((result as {error?:string}).error||'').includes('browser window')),'the app runs them as before');
scope.worldletWebHost={features:WEB_PAGE_FEATURES};
try{
 const inBrowser=await run();
 assert.deepEqual(inBrowser.results,[{error:WEB_PAGE_UNAVAILABLE.youtube},{error:WEB_PAGE_UNAVAILABLE.websitePages},{error:WEB_PAGE_UNAVAILABLE.worldAudio}],'a browser\'s page answers why');
 assert.deepEqual(inBrowser.calls,[],'and asks the host nothing for them');
}finally{delete scope.worldletWebHost;}

// 5. The host's side of the socket sends the flags in its handshake.
const sent:string[]=[];
const socket:PageSocket={send:text=>sent.push(text),close(){},onMessage(){},onClose(){}};
createWebPage({platform:'linux',dispatch:async()=>null,loaded(){},gone(){}}).connect(socket);
assert.deepEqual(JSON.parse(sent[0]),{h:{version:1,platform:'linux',features:WEB_PAGE_FEATURES}},'the handshake says what the page\'s window cannot do');
console.log('PASS web page features: a browser\'s World page hears what its window cannot do, hides YouTube, sound, voice and window buttons, refuses the native views of what Fox made, opens websites in a new tab, and Fox\'s tools that need them say so; the app\'s page is unchanged');
