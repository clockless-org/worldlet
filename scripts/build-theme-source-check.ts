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
 const manifest={contractVersion:3,id:'first',updatedAt:'2026-10-09T23:14:20Z',title:'First',assets:'assets',presentation:'presentation.json'};
 assert.doesNotThrow(()=>parseBuildThemeManifest({...manifest,updatedAt:undefined}));
 assert.throws(()=>parseBuildThemeManifest({...manifest,updatedAt:'yesterday'}),/updatedAt/);
 // A theme is static: a manifest that names code, a stylesheet or Applet scenes is refused.
 assert.throws(()=>parseBuildThemeManifest({...manifest,entry:'entry.ts'}),/manifest fields/);
 assert.throws(()=>parseBuildThemeManifest({...manifest,appletPages:'host'}),/manifest fields/);
 assert.throws(()=>parseBuildThemeManifest({...manifest,contractVersion:2}),/contract v3/);
 const source=path.join(tmp,'source'),consumer=path.join(tmp,'consumer');await fs.mkdir(path.join(source,'assets'),{recursive:true});await fs.mkdir(path.join(consumer,'ui'),{recursive:true});
 const write=async(id:string)=>{await fs.writeFile(path.join(source,'theme.json'),JSON.stringify({...manifest,id}));};
 const presentation:any={tokens:{bodyFont:'Inter, system-ui, sans-serif',displayFont:'Georgia, serif',bodySize:16,titleSize:34,ink:'#203b30',paper:'#fff8e8',accent:'#315f48',focus:'#386747',radius:8,controlHeight:40},fonts:[]};
 await fs.writeFile(path.join(source,'presentation.json'),JSON.stringify(presentation));
 // The host lays out the World and Applet pages; a presentation that places them is refused.
 assert.throws(()=>parseThemePresentation({...presentation,world:{}}),/presentation fields/);
 assert.throws(()=>parseThemePresentation({...presentation,tokens:{...presentation.tokens,bodySize:9}}),/readable/);
 // HUD material and sound are optional; a malformed one fails before it is shown. The companion is not a theme's.
 assert.doesNotThrow(()=>parseThemePresentation({...presentation,hud:{skin:{log:{image:'assets/p.svg',slice:[4,4,4,4],width:4}}},sound:{events:{'mail.received':'assets/m.wav'}}}));
 assert.throws(()=>parseThemePresentation({...presentation,hud:{skin:{bubble:{image:'assets/p.svg',slice:[4,4,4,4],width:4}}}}),/hud skin/);
 assert.throws(()=>parseThemePresentation({...presentation,hud:{skin:{log:{image:'https://example.com/p.png',slice:[4,4,4,4],width:4}}}}),/asset path/);
 assert.throws(()=>parseThemePresentation({...presentation,sound:{events:{'mail.sent':'assets/m.wav'}}}),/sound events/);
 // A theme's own Applet icons are pictures in its package, keyed by Applet.
 assert.doesNotThrow(()=>parseThemePresentation({...presentation,icons:{gmail:'assets/gmail.png'}}));
 assert.throws(()=>parseThemePresentation({...presentation,icons:{Gmail:'assets/gmail.png'}}),/applet icons/);
 assert.throws(()=>parseThemePresentation({...presentation,icons:{gmail:'assets/gmail.txt'}}),/applet icons/);
 // A theme's Artifact look is static files it names: rules and prompt in Markdown, reference pictures, materials, colours.
 const artifact={style:'assets/artifact/STYLE.md',prompt:'assets/artifact/PROMPT.md',references:[{image:'assets/artifact/a.webp',role:'Primary'}],materials:[{id:'paper',image:'assets/artifact/paper.webp',usage:'Paper'}],colors:{paper:'#f7efdc',moss:'#315f48'}};
 assert.doesNotThrow(()=>parseThemePresentation({...presentation,artifact}));
 assert.doesNotThrow(()=>parseThemePresentation({...presentation,artifact:{style:artifact.style,prompt:artifact.prompt,references:artifact.references}}));
 assert.throws(()=>parseThemePresentation({...presentation,artifact:{...artifact,render:'assets/artifact/render.md'}}),/artifact fields/);
 assert.throws(()=>parseThemePresentation({...presentation,artifact:{...artifact,style:'assets/artifact/style.css'}}),/artifact style/);
 assert.throws(()=>parseThemePresentation({...presentation,artifact:{...artifact,references:[]}}),/artifact references/);
 assert.throws(()=>parseThemePresentation({...presentation,artifact:{...artifact,materials:[artifact.materials[0],artifact.materials[0]]}}),/artifact materials/);
 assert.throws(()=>parseThemePresentation({...presentation,artifact:{...artifact,colors:{gold:'#aa7b35'}}}),/artifact colors/);
 assert.throws(()=>parseThemePresentation({...presentation,artifact:{...artifact,colors:{ink:'green'}}}),/artifact colors/);
 await write('first');await fs.writeFile(path.join(source,'assets','test.txt'),'fixture');
 await importBuildTheme(source,consumer);const lock=path.join(consumer,'ui/theme-packages/first/source-lock.json'),initial=await fs.readFile(lock,'utf8');
 assert.equal(JSON.parse(initial).updatedAt,manifest.updatedAt);assert.equal(JSON.parse(initial).contractVersion,3);assert.equal('version' in JSON.parse(initial),false);
 // The generated index imports only the package's JSON.
 assert.doesNotMatch(await fs.readFile(path.join(consumer,'ui/theme-packages/first/index.ts'),'utf8'),/\.ts'|\.css/);
 await importBuildTheme(source,consumer);assert.equal(await fs.readFile(lock,'utf8'),initial);
 await fs.writeFile(path.join(source,'theme.json'),JSON.stringify({...manifest,contractVersion:99}));await assert.rejects(importBuildTheme(source,consumer),/Invalid build theme/);assert.equal(await fs.readFile(lock,'utf8'),initial);
 await write('second');await importBuildTheme(source,consumer);assert.equal(JSON.parse(await fs.readFile(path.join(consumer,'ui/theme-packages/second/theme.json'),'utf8')).id,'second');
 assert.equal(await fs.readFile(lock,'utf8'),initial,'importing another theme leaves the first untouched');
 assert.match(await fs.readFile(path.join(consumer,'ui/theme-packages/index.ts'),'utf8'),/THEME_PACKAGES=\[theme_first,theme_second\]/);
 const output=path.join(tmp,'output');await fs.mkdir(path.join(output,'theme-assets'),{recursive:true});await fs.writeFile(path.join(output,'theme-assets','stale.txt'),'old');assert.deepEqual((await buildThemeSource(consumer,output)).map(t=>t.id),['first','second']);await assert.rejects(fs.stat(path.join(output,'theme-assets/stale.txt')));assert.equal(await fs.readFile(path.join(output,'theme-assets/second/test.txt'),'utf8'),'fixture');
 // Code and stylesheets are refused, wherever they sit in the package.
 for(const file of ['entry.ts','theme.css','assets/draw.js']){await fs.writeFile(path.join(source,file),'export default 1');await assert.rejects(validateBuildTheme(source),/A theme is static/);await fs.rm(path.join(source,file));}
 await fs.writeFile(path.join(source,'presentation.json'),JSON.stringify({...presentation,icons:{gmail:'assets/missing.png'}}));await assert.rejects(validateBuildTheme(source),/Missing declared asset/);
 await fs.writeFile(path.join(source,'presentation.json'),JSON.stringify(presentation));
 await fs.symlink(path.join(source,'theme.json'),path.join(source,'assets','escape.json'));await assert.rejects(validateBuildTheme(source),/symlink/);
 // Windows: path.join gives '\' but TypeScript asks for '/'; the in-memory check file must still be found (Release 4080–4087 failed here).
 const windowsPath=path.join(tmp,'windows')+'\\__check__.ts',options={noEmit:true,types:[]};
 assert.deepEqual(ts.getPreEmitDiagnostics(ts.createProgram([windowsPath],options,withVirtualFile(ts.createCompilerHost(options),windowsPath,'export const ok=1;'))).map(d=>d.code),[]);
 console.log('PASS theme contract: Windows-style in-memory check path, static manifest and presentation, the Artifact look, duplicate, side-by-side packages and registry, replacement, failed import preservation, per-theme assets, code and stylesheet rejection');
}finally{await fs.rm(tmp,{recursive:true,force:true});}
