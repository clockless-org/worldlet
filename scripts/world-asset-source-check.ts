import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import vm from 'node:vm';
import {buildWorldAssets} from './build-world-assets.ts';
import {BUILTIN_STYLE} from '../ui/components/style.ts';

const output=await mkdtemp(path.join(tmpdir(),'worldlet-assets-'));
try {
 await buildWorldAssets(process.cwd(),output);
 const payload=await readFile(path.join(output,'environment-assets.js'),'utf8');
 // The page's first script also marks the theme and sets the loading page's Fox still.
 const context:any={document:{documentElement:{dataset:{}},querySelector:()=>null}};vm.runInNewContext(payload,context);
 assert.equal(context.document.documentElement.dataset.worldTheme,'village');
 // The Village package ships its plates (ui/theme-packages/village/assets); the payload's loading-page plate names its copy.
 assert.equal(context.__WORLDLET_25D_ASSETS__.surroundings,'theme-assets/village/world/day.webp');
 for(const [file,plate] of [[BUILTIN_STYLE.world.day,'world/day.webp'],[BUILTIN_STYLE.world.night,'world/night.webp']]){
  const source=await readFile(path.join(process.cwd(),file)),actual=await readFile(path.join(process.cwd(),'ui/theme-packages/village/assets',plate));
  const decode=async b=>sharp(b).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const expected=await decode(source),rendered=await decode(actual);
  assert.deepEqual(rendered.info,expected.info,file+' retains dimensions');
  assert.deepEqual(rendered.data,expected.data,file+' retains every decoded pixel');
 }
 assert.ok(!payload.includes('data:image/'),'the payload script carries no inline images');
 console.log('PASS world assets: the Village package\'s lossless day/night plates preserve every authored pixel at native resolution, and the payload names files, not inline images.');
} finally {
 await rm(output,{recursive:true,force:true});
}
