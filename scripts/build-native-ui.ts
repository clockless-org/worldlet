import {THEMES,DEFAULT_BUILD_THEME_ID} from '../ui/themes/index.ts';
import {installActivityCollector} from '../platform/bridge/activity-collector.js';
import {holdMedia} from '../platform/bridge/media-hold.js';
import {pictureInPicture} from '../platform/bridge/picture-in-picture.js';
import {installVideoFormatWatch} from '../platform/bridge/video-formats.js';
import {installWebRecorder} from '../platform/bridge/web-record.js';
import {installLoginWatch} from '../platform/bridge/login-watch.js';
import {installPasskeyWatch} from '../platform/bridge/passkey-watch.js';
import {installMeetingAudio} from '../platform/bridge/meeting-audio.js';
import {buildAppletRuntime} from './build-applet-runtime.ts';
import {APP_DEFINITIONS} from '../core/applets/catalog.ts';
import {validateAttentionRegistrations} from '../core/attention/attention-center.ts';
import {buildWorldAssets} from './build-world-assets.ts';
import {BUILTIN_STYLE} from '../ui/components/style.ts';
import {buildBrand} from './build-brand.ts';
import {buildUI} from './build-ui.ts';
import {buildDefines} from './build-info.ts';
import {build,type Plugin} from 'esbuild';
import {cp,mkdir,readFile,writeFile,copyFile,rm} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
import {existsSync,renameSync} from 'node:fs';
const root=fileURLToPath(new URL('../',import.meta.url));
const defines=buildDefines({channel:process.env.WORLDLET_BUILD_CHANNEL||(process.env.WORLDLET_RELEASE_MANIFEST?'release':'dev')});
const startup=await readFile(path.join(root,'ui/shell/world-startup.html'),'utf8');
const resourceVersion=String(Date.now());
// Keep the running app usable if a rebuild is interrupted or fails.
// A Dev watcher may prepare an isolated candidate; the default remains the normal build output.
const published=process.env.WORLDLET_UI_BUILD_PUBLISH_DIR?path.resolve(process.env.WORLDLET_UI_BUILD_PUBLISH_DIR):path.join(root,'dist/WorldletWeb');
const output=path.join(root,`dist/.WorldletWeb-build-${process.pid}`);
await mkdir(output,{recursive:true});
process.env.WORLDLET_UI_BUILD_OUTPUT=output;
await writeFile(path.join(output,'attention-applets.json'),JSON.stringify(validateAttentionRegistrations(APP_DEFINITIONS.flatMap(app=>app.attention?[app.attention]:[]))));
await buildAppletRuntime(root,output);
await buildBrand(pathToFileURL(path.join(output,'brand/')));
for(const name of ['pixi-world.css','world-startup.css'])await copyFile(path.join(root,'ui/shell',name),path.join(output,name));
await copyFile(path.join(root,'ui/applets/gmail/focus.css'),path.join(output,'mail-focus.css'));
// Draft Fox anatomy performances ship only with the dev resource pack (build-companion-presentation.ts),
// so every other channel bundles an inert runtime instead of ~150 KB of unreachable studies.
const draftAnatomy:Plugin={name:'dev-only-fox-anatomy',setup(build){build.onResolve({filter:/\/fox-anatomy-runtime\.ts$/},()=>({path:path.join(root,'ui/companion/fox-anatomy-runtime-release.ts')}));}};
// The Rive Fox (runtime ~2.7 MB) also ships only with the dev resource pack for now.
const devChannel=JSON.parse(defines.__WORLDLET_CHANNEL__)==='dev';
const projectionWorker=await build({entryPoints:[path.join(root,'ui/world/world-projection-worker.ts')],bundle:true,format:'iife',minify:true,write:false});
// Also retain the exact worker program for native-host diagnostic fixtures.
await writeFile(path.join(output,'world-projection-worker.js'),projectionWorker.outputFiles[0].text);
// Plain scripts the page and the native browser load by name: written in TypeScript, emitted as the files those loaders expect.
// The bundles are independent, so they build together; dev-electron reruns this for every candidate.
const bundles=[build({entryPoints:[path.join(root,'core/index.ts')],outfile:path.join(output,'shared-core.js'),bundle:true,format:'iife',globalName:'WorldletCore',target:'es2022'}),...['world-startup','browser-observer','pcm-worklet'].map(name=>build({entryPoints:[path.join(root,name==='browser-observer'?'platform/bridge':'ui/shell',name+'.ts')],outfile:path.join(output,name+'.js'),bundle:true,format:'iife',minify:true})),
 build({entryPoints:[path.join(root,'ui/index.ts')],outfile:path.join(output,'worldlet.js'),define:{...defines,__WORLDLET_PROJECTION_WORKER__:JSON.stringify(projectionWorker.outputFiles[0].text)},bundle:true,format:'iife',minify:true,plugins:devChannel?[]:[draftAnatomy]})];
await writeFile(path.join(output,'native-applet-launchers.json'),JSON.stringify(APP_DEFINITIONS.filter(a=>a.nativeBundleIds?.length).map(a=>({key:a.key,bundleIds:a.nativeBundleIds}))));
await mkdir(path.join(output,'assets'),{recursive:true});
await copyFile(path.join(root,'resources/illustrations/tennis-sam.png'),path.join(output,'assets/tennis-sam.png'));
await copyFile(path.join(root,'resources/styles/builtin/assets/companion/sprites-v4/walking.png'),path.join(output,'assets/fox-walking.png'));
await copyFile(path.join(root,BUILTIN_STYLE.companion.portrait),path.join(output,'assets/fox-startup.png'));
await copyFile(path.join(root,'resources/common/ASTRONOMY-LICENSE.txt'),path.join(output,'ASTRONOMY-LICENSE.txt'));
await copyFile(path.join(root,'node_modules/typebox/license'),path.join(output,'TYPEBOX-LICENSE.txt'));
const themePayloads=[];for(const id of THEMES.keys())themePayloads.push((await buildWorldAssets(root,output,JSON.parse(defines.__WORLDLET_CHANNEL__),id)).registration);
await writeFile(path.join(output,'environment-assets.js'),themePayloads.join('\n')+`\n{let id='village';try{id=localStorage.getItem('worldlet-theme-v1')||id;}catch{}const p=globalThis.__WORLDLET_THEME_ASSETS__[id]||globalThis.__WORLDLET_THEME_ASSETS__.village;globalThis.__WORLDLET_25D_ASSETS__=p.world;globalThis.__WORLDLET_ENV_ASSETS__=p.environment;document.documentElement.dataset.worldTheme=p.world.theme.id;const still=p.environment.surfaces?.startup||(!p.environment.companionRive&&p.environment.companionPortrait),img=document.querySelector('.startup-fox');if(still&&img)img.src=still;}`);
await Promise.all(bundles);
await writeFile(path.join(output,'index.html'),`<!doctype html><html lang="en-US" data-build-theme="${DEFAULT_BUILD_THEME_ID}" data-bundle-version="${resourceVersion}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self'; font-src 'self'; img-src 'self' data: blob: https://i.ytimg.com https://yt3.ggpht.com https://yt3.googleusercontent.com; connect-src 'none'; worker-src blob:; media-src 'self' data:; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'"><title>Worldlet</title><link rel="icon" href="brand/worldlet-app-icon.svg" type="image/svg+xml"><link rel="stylesheet" href="brand/brand.css"><link rel="stylesheet" href="world-startup.css"><link rel="preload" href="worldlet.js" as="script"><link rel="stylesheet" href="worldlet-ui.css"><link rel="stylesheet" href="native.css"><link rel="stylesheet" href="pixi-world.css"><link rel="stylesheet" href="mail-focus.css"><link rel="stylesheet" href="theme-${DEFAULT_BUILD_THEME_ID}.css" data-theme-style="${DEFAULT_BUILD_THEME_ID}"></head><body>${startup}<main id="app" hidden></main><main id="contextSpace" hidden></main><p id="nativeNotice" role="status"></p><script src="environment-assets.js?v=${resourceVersion}"></script><script src="world-startup.js?v=${resourceVersion}"></script></body></html>`);
await writeFile(path.join(output,'native.css'),'.notion-top{top:40px}#nativeNotice:empty{display:none}#nativeNotice{position:fixed;top:42%;left:20%;right:20%;z-index:10;background:#fff8e9;padding:24px;border-radius:16px}.notion-wordmark{letter-spacing:.15em}\n'+await readFile(path.join(root,'ui/companion/desktop-companion.css'),'utf8'));
await mkdir(path.join(output,'brands'),{recursive:true});for(const file of ['google.png','github.png','hermes.png','openclaw.svg','pi.svg'])await copyFile(path.join(root,'resources/brands/'+file),path.join(output,'brands/'+file));
console.log('Built bundled Worldlet 2.5D interface');

await buildUI(root,output);


await writeFile(path.join(output,'build-info.json'),defines.__WORLDLET_BUILD__);

await import('./build-hermes.ts');
await import('./build-local-tools.ts');
await mkdir(path.join(output,'browser'),{recursive:true});
await copyFile(path.join(root,'platform/browser/agent_browser.py'),path.join(output,'browser/agent_browser.py'));
// Development rehearsal site; the native browser serves it only in Dev builds.
await cp(path.join(root,'platform/browser/demo'),path.join(output,'demo'),{recursive:true});
await writeFile(path.join(output,'browser/activity-observer.js'),'('+installActivityCollector.toString()+')().read()');
await writeFile(path.join(output,'browser/media-hold.js'),'('+holdMedia.toString()+')()');
// What the built-in browser records of a page (core/browser/web-record.ts), installed in its isolated world.
await writeFile(path.join(output,'browser/web-record.js'),'('+installWebRecorder.toString()+')()');
// Saved sign-ins (core/browser/saved-logins.ts): every website page's isolated world, the built-in browser's own.
await writeFile(path.join(output,'browser/login-watch.js'),'('+installLoginWatch.toString()+')()');
await writeFile(path.join(output,'browser/passkey-watch.js'),'('+installPasskeyWatch.toString()+')()');
// Meetings pages' call-audio hooks, a function of the binding's name (engine/page.ts calls it with one).
await writeFile(path.join(output,'browser/meeting-audio.js'),'('+installMeetingAudio.toString()+')');
// A function of its mode ('probe', 'enter', 'leave'); the host calls it with one.
await writeFile(path.join(output,'browser/picture-in-picture.js'),'('+pictureInPicture.toString()+')');
// Every CEF website page's video-format counts (core/browser/video-formats.ts), a function of the formats' pattern.
await writeFile(path.join(output,'browser/video-formats.js'),'('+installVideoFormatWatch.toString()+')');
// Focus on website pages (core/browser/page-focus.ts): its rules with Readability, run in the page's isolated world.
await build({entryPoints:[path.join(root,'platform/bridge/page-focus.ts')],outfile:path.join(output,'browser/page-focus.js'),bundle:true,format:'iife',minify:true,target:'es2022'});
await copyFile(path.join(root,'node_modules/@mozilla/readability/LICENSE.md'),path.join(output,'READABILITY-LICENSE.txt'));
// The development app polls this marker. Writing it here means any rebuild reloads it,
// not only the ones dev-electron.ts triggers from a watched directory.


await mkdir(path.join(output,"audio"),{recursive:true});
await copyFile(path.join(root,"resources/audio/bridge-at-dusk.m4a"),path.join(output,"audio/bridge-at-dusk.m4a"));

await copyFile(path.join(root,"resources/audio/village-air.m4a"),path.join(output,"audio/village-air.m4a"));

for(const name of ["quiet-workshop","morning-path","ocean-shore","soft-rain","forest-air"])await copyFile(path.join(root,`resources/audio/${name}.m4a`),path.join(output,`audio/${name}.m4a`));

await copyFile(path.join(root,"resources/audio/CC0-SOURCES.json"),path.join(output,"audio/CC0-SOURCES.json"));
// A local allowlist for the single native ambience channel; callers send IDs, never paths.
const themeTracks={};
for(const {pack} of THEMES.values())if(pack.motion.sound.presentation){
 const directory=path.join(output,'audio/themes',pack.id);await mkdir(directory,{recursive:true});
 for(const [id,source] of Object.entries(pack.motion.sound.ambient)){
  const file='themes/'+pack.id+'/'+id+path.extname(source);
  await copyFile(path.join(root,source),path.join(output,'audio',file));
  themeTracks['theme:'+pack.id+':'+id]={file,...pack.motion.sound.presentation.labels[id],source:pack.title+' original ambience'};
 }
}
await writeFile(path.join(output,'audio/theme-tracks.json'),JSON.stringify(themeTracks));


await copyFile(path.join(root,'ui/applets/youtube/player.html'),path.join(output,'youtube-player.html'));

// Publish only after every runtime helper and asset has been staged.
const previous=published+`.previous-${process.pid}`;
await mkdir(path.dirname(published),{recursive:true});
// Windows file scanners can briefly hold a freshly staged tree; retry those denials for about three seconds.
const move=async(from:string,to:string)=>{for(let attempt=1;;attempt++)try{return renameSync(from,to);}catch(error){if(attempt>=8||!['EPERM','EBUSY'].includes((error as NodeJS.ErrnoException).code??''))throw error;await new Promise(resolve=>setTimeout(resolve,attempt*100));}};
try{if(existsSync(published))await move(published,previous);await move(output,published);}
catch(error){if(existsSync(previous)&&!existsSync(published))await move(previous,published);await rm(output,{recursive:true,force:true});throw error;}
await writeFile(path.join(published,'.dev-reload'),String(Date.now()));
await rm(previous,{recursive:true,force:true});
