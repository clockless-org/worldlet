import assert from 'node:assert/strict';
import {paintedPose,paintedVertex} from '../ui/companion/fox-painted-idle.ts';
import {paintedAction} from '../ui/companion/fox-painted-actions.ts';
import {FOX_ACTIONS} from '../ui/companion/fox-actions.ts';
const neutral=paintedPose(0,true);
assert.deepEqual(paintedVertex(.51,.38,neutral),[.51,.38]);
assert.deepEqual(paintedPose(12000),paintedPose(0));
let maximumSniff=0,minimumArea=Infinity;
for(let ms=0;ms<12000;ms+=1000/60){
 const p=paintedPose(ms);assert(Object.values(p).every(Number.isFinite));assert(p.blink>=0&&p.blink<=1);
 const feet=paintedVertex(.60,.96,p);assert(Math.abs(feet[0]-.60)<1e-10&&Math.abs(feet[1]-.96)<1e-10);
 maximumSniff=Math.max(maximumSniff,Math.abs(p.sniff));
 for(let y=0;y<64;y++)for(let x=0;x<64;x++){
  const a=paintedVertex(x/64,y/64,p),b=paintedVertex((x+1)/64,y/64,p),c=paintedVertex(x/64,(y+1)/64,p),d=paintedVertex((x+1)/64,(y+1)/64,p);
  for(const [i,j,k] of [[a,b,c],[b,d,c]])minimumArea=Math.min(minimumArea,(j[0]-i[0])*(k[1]-i[1])-(j[1]-i[1])*(k[0]-i[0]));
 }
}
assert(maximumSniff>.5);assert(minimumArea>0,'Folded mesh');
assert(paintedPose(1720).blink>.99);
console.log('PASS: 720 poses, finite controls, pinned paws, no flipped triangles, blink closure, independent sniff and deterministic 12-second loop.');
for(const state of FOX_ACTIONS){
 assert.deepEqual(paintedAction(state,0,0,true),paintedAction(state,5000,5000,true),'reduced motion is stable: '+state);
 for(let ms=0;ms<12000;ms+=100){
  const p=paintedAction(state,ms,ms);assert(Object.values(p).every(Number.isFinite));
  for(let y=0;y<64;y++)for(let x=0;x<64;x++){
   const a=paintedVertex(x/64,y/64,p),b=paintedVertex((x+1)/64,y/64,p),c=paintedVertex(x/64,(y+1)/64,p),d=paintedVertex((x+1)/64,(y+1)/64,p);
   for(const [i,j,k] of [[a,b,c],[b,d,c]])assert((j[0]-i[0])*(k[1]-i[1])-(j[1]-i[1])*(k[0]-i[0])>0,'folded '+state);
  }
 }
}
console.log('PASS: all 13 action profiles retain an unfolded mesh and stable reduced-motion poses.');
