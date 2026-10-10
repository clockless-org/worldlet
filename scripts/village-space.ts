import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

/**
 * The Village draws its World from its own copies of the host's space code, so it can live in a theme package that
 * imports only its own files. ui/world/village/space holds:
 * - copies of the host's pure modules, equal to them except that every import names a sibling file;
 * - space.json: the Village's areas, places and Applet sites as the host lays them out (ui/world/world-layout.ts,
 *   applet-sprites.ts), so the package needs neither the Applet catalog nor the theme registry.
 *
 *   node scripts/village-space.ts           refresh the copies and space.json (after changing any of them)
 *   node scripts/village-space.ts --check   fail when a copy or space.json differs from the host's
 */
const root=fileURLToPath(new URL('../',import.meta.url)),SPACE='ui/world/village/space';
export const SHARED=['ui/world/world-design.ts','ui/world/applet-optical-scales.json','ui/world/frame-budget.ts','ui/themes/scene-motion.ts','ui/world/region-core.ts','ui/world/slot-placement.ts'];
/** A host module as the Village keeps it: each import names its sibling copy. */
export const localImports=(source:string)=>source.replace(/(from\s+|import\s+)'(?:\.{1,2}\/)+(?:[^']*\/)?([^'/]+)'/g,"$1'./$2'");
async function space(){
 const {WORLD_LAYOUT,THEME_WORLD}=await import('../ui/world/world-layout.ts');
 const {APPLET_SPRITES}=await import('../ui/world/applet-sprites.ts');
 return JSON.stringify({world:THEME_WORLD,layout:WORLD_LAYOUT,sprites:APPLET_SPRITES},null,1)+'\n';
}
async function expected(){
 const files:Record<string,string>={};
 for(const file of SHARED)files[path.basename(file)]=localImports(await readFile(path.join(root,file),'utf8'));
 files['space.json']=await space();
 return files;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const files=await expected();
 if(process.argv.includes('--check')){
  for(const [name,text] of Object.entries(files)){
   const actual=await readFile(path.join(root,SPACE,name),'utf8').catch(()=>null);
   assert.equal(actual,text,`${SPACE}/${name} differs from the host's; run node scripts/village-space.ts`);
  }
  console.log(`PASS Village space: ${SHARED.length} copies equal the host's modules, and space.json is the host's layout`);
 }else{
  await mkdir(path.join(root,SPACE),{recursive:true});
  for(const [name,text] of Object.entries(files))await writeFile(path.join(root,SPACE,name),text);
  console.log(`Wrote ${Object.keys(files).length} files to ${SPACE}`);
 }
}
