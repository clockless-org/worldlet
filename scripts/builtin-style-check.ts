import assert from 'node:assert/strict';
import {access,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {BUILTIN_STYLE,BUILTIN_STYLE_REF,STYLE_TOKENS,appletStyle,assertBuiltinStyle} from '../ui/components/style.ts';
import {WORLD_LAYOUT} from '../ui/world/world-layout.ts';
import {WORLD_APPS} from '../core/applets/catalog.ts';
import {UI_TOKENS,UI_NIGHT_TOKENS,WORLD_UI} from '../ui/components/tokens.ts';
import {deviceSource} from './build-world-assets.ts';
import {worldPackPath,parseWorldPack} from '../ui/world/world-pack.ts';

assertBuiltinStyle(BUILTIN_STYLE_REF);
for(const ref of [null,{}, {id:'other',version:'1.0.0'},{id:BUILTIN_STYLE.id,version:'99.0.0'}])assert.throws(()=>assertBuiltinStyle(ref));
assert.throws(()=>appletStyle('missing'));
assert.throws(()=>appletStyle('__proto__'));
assert.equal(WORLD_LAYOUT.plates,BUILTIN_STYLE.world);
assert.equal(WORLD_LAYOUT.style,BUILTIN_STYLE_REF);
assert.equal(UI_TOKENS,STYLE_TOKENS.ui);
assert.equal(UI_NIGHT_TOKENS,STYLE_TOKENS.night);
assert.equal(WORLD_UI,STYLE_TOKENS.worldUI);
assert(Object.isFrozen(BUILTIN_STYLE.applets.gmail));
assert(Object.isFrozen(STYLE_TOKENS.ui));
// The art library also retains Mac launcher devices that are not in the active
// service catalog. Every active Applet must have art; dormant art is valid.
for(const app of WORLD_APPS)assert(Object.hasOwn(BUILTIN_STYLE.applets,app.key),'Missing Applet art: '+app.key);
const paths:string[]=[];
function collect(value:unknown){if(typeof value==='string')paths.push(worldPackPath(value));else for(const v of Object.values(value as object))collect(v);}
for(const value of [BUILTIN_STYLE.references,BUILTIN_STYLE.world,BUILTIN_STYLE.landmarks,BUILTIN_STYLE.applets,BUILTIN_STYLE.mailParts,BUILTIN_STYLE.logos,BUILTIN_STYLE.companion,BUILTIN_STYLE.hud])collect(value);
await Promise.all(paths.map(file=>access(file)));
assert.equal(BUILTIN_STYLE.references.contract,'resources/styles/builtin/STYLE.md');
assert.equal(BUILTIN_STYLE.references.day,BUILTIN_STYLE.world.hiresDay);
assert.equal(BUILTIN_STYLE.references.night,BUILTIN_STYLE.world.hiresNight);
assert.equal(BUILTIN_STYLE.references.palette,BUILTIN_STYLE.world.hiresDay);
const providerLogos=new Set<string>(Object.values(BUILTIN_STYLE.logos));
const landmarkPaths=new Set(Object.values(BUILTIN_STYLE.landmarks).flatMap(pair=>Object.values(pair)));
assert(paths.every(file=>file.startsWith('resources/styles/builtin/')||Object.values(BUILTIN_STYLE.world).includes(file)||landmarkPaths.has(file)||providerLogos.has(file)),'Style artwork stays in the pack or the registered World; original provider identities may be referenced');
for(const a of WORLD_APPS){
 const art=appletStyle(a.key);
 assert.equal(deviceSource(process.cwd(),a.key),path.join(process.cwd(),art.peek));
 if((a.fullView?.kind==='web'||a.fullView?.original||a.key==='meetings')&&a.focusPresentation!=='world-device')assert(art.focus,'Missing Focus: '+a.key);
}
// Intentional visual changes must explicitly update this reviewed extraction baseline.
assert.equal(createHash('sha256').update(JSON.stringify(STYLE_TOKENS)).digest('hex'),'f934fb6e28867e4fc8c97b4a21b719a44748a8043386b353c7cdb194896df8b7','Visual tokens changed; review before updating snapshot');
const village=JSON.parse(await readFile('ui/theme-packages/village/world.json','utf8'));
assert.equal(parseWorldPack(village).artStatus,'approved','Live Village is reviewed for integration');
for(const change of [x=>delete x.style,x=>x.style.id='other',x=>x.style.version='99.0.0',x=>delete x.artStatus]){
 const broken=structuredClone(village);change(broken);assert.throws(()=>parseWorldPack(broken));
}
console.log('PASS one built-in style: unchanged tokens, complete assets, shared resolvers, unsupported styles rejected; live Village uses the registered pack');
