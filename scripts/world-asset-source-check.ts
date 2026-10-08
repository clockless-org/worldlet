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
 const context:any={};vm.runInNewContext(payload,context);
 const keys=['surroundings','night','hiresDay','hiresNight'];
 for(const [index,file] of [BUILTIN_STYLE.world.day,BUILTIN_STYLE.world.night,BUILTIN_STYLE.world.hiresDay,BUILTIN_STYLE.world.hiresNight].entries()){
  const source=await readFile(path.join(process.cwd(),file));
  const url=context.__WORLDLET_25D_ASSETS__[keys[index]]||context.__WORLDLET_25D_ASSETS__[index===2?'surroundings':'night'];
  assert.match(url,/^assets\/world\/[0-9a-f]{20}\.webp$/,file+' is a bundled file, not an inline data URI');
  const actual=await readFile(path.join(output,url));
  const decode=async b=>sharp(b).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const expected=await decode(source),rendered=await decode(actual);
  assert.deepEqual(rendered.info,expected.info,file+' retains dimensions');
  assert.deepEqual(rendered.data,expected.data,file+' retains every decoded pixel');
 }
 assert.ok(!payload.includes('data:image/'),'the payload script carries no inline images');
 console.log('PASS world assets: lossless bundled day/night plates preserve every authored pixel at native resolution, as files the payload names.');
} finally {
 await rm(output,{recursive:true,force:true});
}
