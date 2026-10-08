import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseWorldPack,worldPackPath} from '../ui/world/world-pack.ts';
const source=JSON.parse(await readFile('resources/worlds/village/manifest.json','utf8'));
const p=parseWorldPack(source);
assert.deepEqual(p.areas.map(a=>a.title).sort(),['Home','Work','Social','Life','Games','Entertainment'].sort());
assert.equal(p.canvas.width,3840);assert.equal(p.canvas.height,2160);
assert.equal(p.areas.reduce((n,a)=>n+a.slots.length,0),30);
for(const value of ['../key','/etc/passwd','https://x.test/a','images/../../key','images\\secret','a\u0000b'])assert.throws(()=>worldPackPath(value));
for(const change of [x=>x.schemaVersion=99,x=>x.areas[1].id=x.areas[0].id,x=>x.areas[0].slots[0].anchor=[2,2],x=>x.layers[0].src='../key',x=>x.hudSafeAreas=[[0,0,1,1]],x=>x.canvas.width=0]){const broken=structuredClone(source);change(broken);assert.throws(()=>parseWorldPack(broken));}
console.log('PASS Village: 4K, six areas, 30 empty named slots; malformed packages and unsafe paths rejected');
// An authored world package (layered planes, composed Area close views, occlusion and ambience) kept as a fixture.
const authored=JSON.parse(await readFile('scripts/fixtures/authored-world-pack.json','utf8'));
assert.equal(parseWorldPack(authored).areas[0].closeView?.slots.length,4);
for(const change of [v=>v.src='../outside.png',v=>v.slots.pop(),v=>v.slots[0].id=v.slots[1].id,v=>v.slots[0].anchor=[0,.2],v=>v.devices.gmail='https://example.com/mail.png',v=>v.occlusion=[[.8,0,.4,1]],v=>v.ambience={},v=>v.ambience[0].kind='shader',v=>v.ambience[0].color='red',v=>v.ambience[0].count=33,v=>v.ambience[0].bounds=[.9,0,.2,1],v=>v.ambience.push(v.ambience[0])]){
 const broken=structuredClone(authored);change(broken.areas[0].closeView);assert.throws(()=>parseWorldPack(broken));
}
console.log('PASS authored Area: matching slot identity, bounded footprints/occlusion/ambience and safe local art');
for(const change of [a=>a[0].clip=[[0,0],[1,1]],a=>a[0].clip=[[0,0],[.5,.5],[1,1]],a=>a[0].clip=[[0,0],[2,0],[0,1]],a=>a[0].strength=2,a=>a[0].strength=NaN,a=>a[0].lighting='rain',a=>a[0].kind='shader',a=>a.push(a[0])]){
 const broken=structuredClone(authored);change(broken.ambience);assert.throws(()=>parseWorldPack(broken));
}
assert.equal(parseWorldPack(authored).ambience.filter(f=>f.clip).length,3);
console.log('PASS overview: registered mist/water polygons, bounded strength and day/night paint');

for(const change of [o=>o.push(o[0]),o=>o[0].depth=2,o=>o[0].day=[[0,0],[1,1]],o=>o[0].day[0]=[-.1,0],o=>o[0].night.pop(),o=>o[0].day=o[0].day.map(()=>[.2,.2])]){
 const broken=structuredClone(authored);change(broken.occlusion);assert.throws(()=>parseWorldPack(broken));
}
assert.equal(parseWorldPack(authored).occlusion.length,6);
console.log('PASS foreground architecture: bounded registered day/night polygons, depth and stable identifiers');
for(const change of [p=>p.layers.pop(),p=>p.layers[0].parallax=.5,p=>p.layers[0].opacity=-1,p=>p.layers[0].sourceSize=[0,941],p=>p.layers[0].sourceSize=[1672.5,941],p=>p.layers.find(l=>l.kind==='architecture').parallax=.001,p=>p.layers[1].parallax=.002,p=>p.layers[1].bounds=[0,0,.9,1]]){
 const broken=structuredClone(authored);change(broken);assert.throws(()=>parseWorldPack(broken));
}
assert.equal(parseWorldPack(authored).layers.length,8);
console.log('PASS scenery planes: complete day/night pairs, bounded decorative parallax and fixed architecture');
