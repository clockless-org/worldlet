import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {parseBuildThemeManifest,parseThemePresentation} from '../ui/themes/build-theme-contract.ts';
import {validateBuildTheme,importBuildTheme,buildThemeSource} from './build-theme-source.ts';
import ts from 'typescript';
import {withVirtualFile} from './ts-virtual-file.ts';
const tmp=await fs.mkdtemp(path.join(os.tmpdir(),'worldlet-theme-contract-'));
try{
 const manifest={contractVersion:2,id:'first',updatedAt:'2026-10-09T23:14:20Z',title:'First',entry:'entry.ts',stylesheet:'theme.css',assets:'assets',presentation:'presentation.json',applets:[]};
 assert.doesNotThrow(()=>parseBuildThemeManifest({...manifest,updatedAt:undefined}));
 assert.throws(()=>parseBuildThemeManifest({...manifest,updatedAt:'yesterday'}),/updatedAt/);
 const source=path.join(tmp,'source'),consumer=path.join(tmp,'consumer');await fs.mkdir(path.join(source,'assets'),{recursive:true});await fs.mkdir(path.join(consumer,'ui'),{recursive:true});
 const write=async(id:string)=>{await fs.writeFile(path.join(source,'theme.json'),JSON.stringify({...manifest,id}));await fs.writeFile(path.join(source,'entry.ts'),`import type {BuildTheme} from '@worldlet/theme'; const theme:BuildTheme={contractVersion:2,id:'${id}',renderWorld:()=>({dispose(){},update(){},event(){return false;},anchor(){return null;},bounds(){return null;}}),renderApplet:()=>({dispose(){}})};export default theme;`);await fs.writeFile(path.join(source,'theme.css'),`:root{--theme-ink:#123456}`);};
 const presentation=JSON.parse(await fs.readFile(new URL('../ui/theme-packages/village-map/presentation.json',import.meta.url),'utf8'));
 const scene={...presentation.fallback,background:'assets/test.txt'};presentation.world=scene;presentation.fallback=scene;presentation.applets={};presentation.fonts=[];delete presentation.icons;await fs.writeFile(path.join(source,'presentation.json'),JSON.stringify(presentation));
 assert.throws(()=>parseThemePresentation({...presentation,world:{...scene,slots:{content:[.9,0,.2,1]}}}),/bounded|content/);
 // HUD material and sound are optional; a malformed one fails before it is shown. The companion is not a theme's.
 assert.doesNotThrow(()=>parseThemePresentation({...presentation,hud:{skin:{log:{image:'assets/p.svg',slice:[4,4,4,4],width:4}}},sound:{events:{'mail.received':'assets/m.wav'}}}));
 assert.throws(()=>parseThemePresentation({...presentation,hud:{skin:{bubble:{image:'assets/p.svg',slice:[4,4,4,4],width:4}}}}),/hud skin/);
 assert.throws(()=>parseThemePresentation({...presentation,hud:{skin:{log:{image:'https://example.com/p.png',slice:[4,4,4,4],width:4}}}}),/asset path/);
 assert.throws(()=>parseThemePresentation({...presentation,sound:{events:{'mail.sent':'assets/m.wav'}}}),/sound events/);
 // A theme's own Applet icons are pictures in its package, keyed by Applet.
 assert.doesNotThrow(()=>parseThemePresentation({...presentation,icons:{gmail:'assets/gmail.png'}}));
 assert.throws(()=>parseThemePresentation({...presentation,icons:{Gmail:'assets/gmail.png'}}),/applet icons/);
 assert.throws(()=>parseThemePresentation({...presentation,icons:{gmail:'assets/gmail.txt'}}),/applet icons/);
 await write('first');await fs.writeFile(path.join(source,'assets','test.txt'),'fixture');
 await importBuildTheme(source,consumer);const lock=path.join(consumer,'ui/theme-packages/first/source-lock.json'),initial=await fs.readFile(lock,'utf8');
 assert.equal(JSON.parse(initial).updatedAt,manifest.updatedAt);assert.equal('version' in JSON.parse(initial),false);
 await importBuildTheme(source,consumer);assert.equal(await fs.readFile(lock,'utf8'),initial);
 await fs.writeFile(path.join(source,'theme.json'),JSON.stringify({...manifest,contractVersion:99}));await assert.rejects(importBuildTheme(source,consumer),/Invalid build theme/);assert.equal(await fs.readFile(lock,'utf8'),initial);
 await write('second');await importBuildTheme(source,consumer);assert.equal(JSON.parse(await fs.readFile(path.join(consumer,'ui/theme-packages/second/theme.json'),'utf8')).id,'second');
 // Packages sit side by side; the registry lists every one so the app can switch between them.
 assert.equal(await fs.readFile(lock,'utf8'),initial,'importing another theme leaves the first untouched');
 assert.match(await fs.readFile(path.join(consumer,'ui/theme-packages/index.ts'),'utf8'),/THEME_PACKAGES=\[theme_first,theme_second\]/);
 const output=path.join(tmp,'output');await fs.mkdir(path.join(output,'theme-assets'),{recursive:true});await fs.writeFile(path.join(output,'theme-assets','stale.txt'),'old');assert.deepEqual((await buildThemeSource(consumer,output)).map(t=>t.id),['first','second']);assert.match(await fs.readFile(path.join(output,'theme-second.css'),'utf8'),/123456/);await assert.rejects(fs.stat(path.join(output,'theme-assets/stale.txt')));assert.equal(await fs.readFile(path.join(output,'theme-assets/second/test.txt'),'utf8'),'fixture');
 await fs.writeFile(path.join(source,'theme.css'),"a{background:url('theme-assets/missing.png')}");await assert.rejects(validateBuildTheme(source),/Missing CSS asset/);await write('second');
 // The shared Pixi runtime is the one library a package may import by name; it is not bundled into the package.
 await fs.appendFile(path.join(source,'entry.ts'),"\nimport 'pixi.js/unsafe-eval';\nimport {Container} from 'pixi.js';\nexport const layer:Container|null=null;");await validateBuildTheme(source);await write('second');
 await fs.writeFile(path.join(source,'entry.ts'),"import fs from 'node:fs';export default fs");await assert.rejects(validateBuildTheme(source),/Theme (?:code )?imports only local/);
 await fs.writeFile(path.join(source,'entry.ts'),"export default {contractVersion:1,id:'bad',renderApplet:()=>true}");await assert.rejects(validateBuildTheme(source),/not assignable|renderWorld/);
 await write('second');await fs.writeFile(path.join(tmp,'private.ts'),'export type Private=string');await fs.appendFile(path.join(source,'entry.ts'),"\nimport type {Private} from '../private.ts';");await assert.rejects(validateBuildTheme(source),/import escapes/);
 await write('second');await fs.symlink(path.join(source,'theme.json'),path.join(source,'assets','escape.json'));await assert.rejects(validateBuildTheme(source),/symlink/);
 // Windows: path.join gives '\' but TypeScript asks for '/'; the in-memory check file must still be found (Release 4080–4087 failed here).
 const windowsPath=path.join(tmp,'windows')+'\\__check__.ts',options={noEmit:true,types:[]};
 assert.deepEqual(ts.getPreEmitDiagnostics(ts.createProgram([windowsPath],options,withVirtualFile(ts.createCompilerHost(options),windowsPath,'export const ok=1;'))).map(d=>d.code),[]);
 console.log('PASS theme contract: Windows-style in-memory check path, typed source, duplicate, side-by-side packages and registry, replacement, failed import preservation, per-theme assets and stylesheets, version and boundary rejection');
}finally{await fs.rm(tmp,{recursive:true,force:true});}
