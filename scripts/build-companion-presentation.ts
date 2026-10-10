import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {ACTIVE_THEME,type RegisteredTheme} from '../ui/themes/index.ts';
import type {AnatomyRuntimeSources} from '../ui/companion/animation/fox-anatomy-runtime.ts';
import type {ThemeSpriteRig} from '../ui/companion/animation/theme-sprite-rig.ts';

/** Every channel plays the Rive Fox in the portrait, with the accepted painted
 * renderer as its fallback. Development also carries the draft anatomy rig as
 * the Rive Fox's first fallback. */
export type CompanionPresentation={companionPainted?:{original:string;half:string;closed:string};companionRive?:string;companionAnatomy?:AnatomyRuntimeSources;companionSpriteRig?:ThemeSpriteRig};
export async function buildCompanionPresentation(root:string,channel:string,entry:RegisteredTheme=ACTIVE_THEME):Promise<CompanionPresentation>{
 if(entry.pack.companion.renderer==='sprite-rig'){
  const rig=JSON.parse(await readFile(path.join(root,entry.pack.companion.rig),'utf8'));
  const perches:Record<string,string>={};
  for(const [place,file] of Object.entries(entry.pack.companion.perches))if(file!=='stable'&&/\.(png|webp)$/.test(file))perches[place]='data:image/'+(file.endsWith('.webp')?'webp':'png')+';base64,'+(await readFile(path.join(root,file))).toString('base64');
  return {companionSpriteRig:{...rig,perches,image:'data:image/png;base64,'+(await readFile(path.join(root,rig.image))).toString('base64')}};
 }
 const encode=async<T extends Record<string,string>>(files:T)=>Object.fromEntries(
  await Promise.all(Object.entries(files).map(async([key,file])=>
   [key,'data:image/png;base64,'+(await readFile(path.join(root,file))).toString('base64')]))
 ) as Record<keyof T,string>;
 const companionPainted=await encode(entry.style.manifest.companion.painted);
 // The Rive Fox (scripts/fox-rive/build.py), inline because the page fetches nothing.
 const companionRive='data:application/octet-stream;base64,'+(await readFile(path.join(root,entry.pack.companion.rig))).toString('base64');
 if(channel!=='dev')return {companionPainted,companionRive};
 const companionAnatomy:AnatomyRuntimeSources={...companionPainted,
  ...await encode(entry.style.manifest.companion.anatomyDraft)};
 return {companionPainted,companionAnatomy,companionRive};
}
