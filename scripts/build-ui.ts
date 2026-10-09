import {buildThemeSource} from './build-theme-source.ts';
import {build} from 'esbuild';
import sharp from 'sharp';
import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import path from 'node:path';
import {UI_TOKENS,uiTokenCSS} from '../ui/components/tokens.ts';
import {BUILTIN_STYLE} from '../ui/components/style.ts';
import {THEMES} from '../ui/themes/index.ts';
export async function buildUI(root,output){
 const selectedThemeCSS=await buildThemeSource(root,output);
 // Historical styles stay below the current system, even if they use more specific selectors.
 const legacy=(await Promise.all(['room.css','notion.css','homestead.css'].map(n=>readFile(path.join(root,'ui/shell',n),'utf8')))).join('\n').replace(/!important/g,'');
 const layers=await Promise.all(['foundations','components','layout','states','hud'].map(async n=>`@layer ${n}{\n${await readFile(path.join(root,'ui/components',n+'.css'),'utf8')}
${n==='components'?(await Promise.all([...['youtube','stripe','weather','moment','ongoing'].map(key=>key+'/panel.css'),'_shared/games.css'].map(file=>readFile(path.join(root,'ui/applets',file),'utf8')))).join('\n'):''}\n}`));
 const builtinControls='resources/styles/builtin/controls.css';
 // Each other registered theme's controls (Village's are the built-in layer below), then the surfaces every theme can paint (ui/themes/theme-surfaces.css).
 const themeControls=(await Promise.all([...THEMES.values()].filter(t=>t.pack.hud.controls!==builtinControls).map(t=>readFile(path.join(root,t.pack.hud.controls),'utf8')))).join('\n')+'\n'+await readFile(path.join(root,'ui/themes/theme-surfaces.css'),'utf8')+'\n'+await readFile(path.join(root,'ui/themes/build-theme.css'),'utf8');
 const controls=await readFile(path.join(root,builtinControls),'utf8');
 await writeFile(path.join(output,'worldlet-ui.css'),`@layer legacy,foundations,components,layout,states,hud,controls;\n@layer legacy{${legacy}}\n@layer foundations{${uiTokenCSS()}}\n${layers.join('\n')}\n@layer controls{${controls}}\n${await readFile(path.join(root,'ui/attention/attention-preview.css'),'utf8')}\n${themeControls}\n${selectedThemeCSS}`);
 await mkdir(path.join(output,'hud'),{recursive:true});
 for(const [name,file] of Object.entries(BUILTIN_STYLE.hud))await copyFile(path.join(root,file),path.join(output,'hud',name+'.png'));
 await mkdir(path.join(output,'attention'),{recursive:true});
 for(const [name,file] of Object.entries(BUILTIN_STYLE.attention)){const target=path.join(output,'attention',name+'.webp');if(file.endsWith('.webp'))await copyFile(path.join(root,file),target);else await sharp(path.join(root,file)).resize({width:768,withoutEnlargement:true}).webp({quality:82}).toFile(target);}
 await mkdir(path.join(output,'fonts'),{recursive:true});
 const fonts=['InterVariable.woff2','InterVariable-Italic.woff2','INTER-LICENSE.txt'];
 for(const n of fonts)await copyFile(path.join(root,'resources/common/fonts',n),path.join(output,'fonts',n));
 await copyFile(path.join(root,'ui/components/gallery.html'),path.join(output,'ui-gallery.html'));
 await build({entryPoints:[path.join(root,'ui/components/gallery-entry.ts')],outfile:path.join(output,'ui-gallery.js'),bundle:true,format:'iife',minify:true});
 await writeFile(path.join(output,'ui-tokens.json'),JSON.stringify(UI_TOKENS,null,2));
 return ['worldlet-ui.css','ui-gallery.js','ui-gallery.html','ui-tokens.json',...Object.keys(BUILTIN_STYLE.attention).map(n=>'attention/'+n+'.webp'),...fonts.map(n=>'fonts/'+n),...Object.keys(BUILTIN_STYLE.hud).map(n=>'hud/'+n+'.png')];
}
