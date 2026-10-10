import assert from 'node:assert/strict';
import {moonPixels,skyBodyPlacement} from '../ui/world/village/celestial-art.ts';
import {villageCamera} from '../ui/world/village/village-camera.ts';
import {celestialAt,lunarLightAngle,lunarPhaseAt} from '../ui/world/environment/celestial.ts';
import {environmentAt} from '../ui/world/environment/world-environment.ts';
import {environmentPresentation} from '../ui/world/village/environment-presentation.ts';
for(const [w,h]of [[2560,1440],[1440,900],[800,900],[375,812]]){
 const view=villageCamera(w,h,1,[.5,.5]);
 for(const altitude of [1,38,80]){
  const p=skyBodyPlacement({altitude,azimuth:125},w,h,view);
  assert(p.visible);assert(p.y-p.diameter/2>=0);assert(p.y+p.diameter/2<p.horizon);assert(p.x>0&&p.x<w);
  assert(p.diameter>=28&&p.diameter<=48,'larger, bounded disc independent of world zoom');
 }
 assert(!skyBodyPlacement({altitude:-1},w,h,view).visible);
 assert(!skyBodyPlacement({altitude:38},w,h,{y:-1000,scale:1}).visible,'No moon painted over a close-up terrain view');
}
const view={y:0,scale:1},cardinals=[0,45,90,180,270,315].map(azimuth=>skyBodyPlacement({altitude:20,azimuth},1440,900,view).x);
assert(cardinals.every((x,i)=>i===0||x>cardinals[i-1]),'northeast/northwest positions must not clamp to east/west');
assert.equal(skyBodyPlacement({altitude:20,azimuth:-45},1440,900,view).x,cardinals.at(-1));
const above=lunarLightAngle({altitude:60,azimuth:180},{altitude:30,azimuth:180});
assert(Math.abs(above+Math.PI/2)<1e-9,'light from higher sun points up');
assert(Math.abs(lunarLightAngle({altitude:0,azimuth:200},{altitude:0,azimuth:180}))<1e-9,'light from increasing azimuth points right');
const now=Date.parse('2026-09-25T04:00:00Z'),sf={name:'SF',latitude:37.77,longitude:-122.42},sydney={name:'Sydney',latitude:-33.87,longitude:151.21};
const north=celestialAt(now,sf),south=celestialAt(now,sydney);
assert.equal(north.lunar.fraction,south.lunar.fraction,'phase is shared across hemispheres');
assert.notEqual(north.lunar.lightAngle,south.lunar.lightAngle,'local orientation is not fixed to the northern hemisphere');
assert.notEqual(north.solar.azimuth,south.solar.azimuth);
assert.notDeepEqual(celestialAt(now+3600000,sf).lunar,north.lunar,'time updates position and phase');
assert.notEqual(lunarPhaseAt(now+7*86400000).fraction,lunarPhaseAt(now).fraction);
const unknown=environmentAt(now),known=environmentAt(now,null,sf);
assert.equal(unknown.positionMode,'location-needed');assert.equal(unknown.lunar.fraction,north.lunar.fraction);
assert.equal(environmentPresentation(unknown).lunar.fraction,north.lunar.fraction,'no-location fallback must not invent a half moon');
assert.deepEqual(environmentPresentation(known).lunar,north.lunar,'actual coordinates and tilt survive presentation');
const full=moonPixels(128,1,.5),quarter=moonPixels(128,.5,.25),waning=moonPixels(128,.5,.75),dark=moonPixels(128,0,0);
const energy=d=>d.reduce((sum,v,i)=>sum+(i%4===0?v:0),0);
assert(energy(full)>energy(quarter)*1.5);assert(energy(quarter)>energy(dark)*3);
assert.notDeepEqual(quarter,waning);assert.equal(full[3],0,'Transparent texture corners');
const upper=moonPixels(128,.5,.25,-Math.PI/2);
const halfEnergy=(data,upper)=>data.reduce((sum,v,i)=>sum+(i%4===0&&(Math.floor(i/4/128)<64)===upper?v:0),0);
assert(halfEnergy(upper,true)>halfEnergy(upper,false)*3,'local light angle rotates the terminator');
assert(new Set(full.filter((_,i)=>i%4===0)).size>30,'Material has surface and lighting variation');
assert.equal(dark.filter((_,i)=>i%4===3).some(v=>v>0),false,'New moon must not stamp a dark disc onto the sky');
const red=(x,y)=>full[(y*128+x)*4];
assert(red(115,64)>red(64,64)*.85,'Full moon limb stays luminous instead of looking like a shaded ball');
console.log('PASS visible inner-frame sky, below-horizon/close-up hiding, textured full/waxing/waning moon.');
