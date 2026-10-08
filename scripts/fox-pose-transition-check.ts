import assert from 'node:assert/strict';
import {createPoseTransition} from '../ui/companion/fox-pose-transition.ts';
import {paintedAction} from '../ui/companion/fox-painted-actions.ts';
import {FOX_ACTIONS} from '../ui/companion/fox-actions.ts';
import {paintedVertex} from '../ui/companion/fox-painted-idle.ts';
const controls=['lean','shoulders','nod','pawL','pawR','look','tail'] as const;
for(const a of FOX_ACTIONS)for(const b of FOX_ACTIONS){
 const blend=createPoseTransition(paintedAction);blend.sample(a,0,0);
 const before=blend.sample(a,1100,1100),entry=blend.sample(b,0,1100);
 for(const key of controls)assert(Math.abs((before[key]||0)-(entry[key]||0))<1e-9,'pose discontinuity '+a+' → '+b+' '+key);
 const p0=blend.sample(b,80-.01,1180-.01),p1=blend.sample(b,80,1180),interrupted=blend.sample('listening',0,1180),p2=blend.sample('listening',.01,1180.01);
 for(const key of controls){assert(Math.abs((p1[key]||0)-(interrupted[key]||0))<1e-9);assert(Math.abs(((p1[key]||0)-(p0[key]||0))/.01-((p2[key]||0)-(interrupted[key]||0))/.01)<.0001,'velocity discontinuity '+key);}
 const reduced=blend.sample(b,800,1900,true);assert.deepEqual(reduced,paintedAction(b,800,1900,true));
}
const cadence=(fps:number)=>{const blend=createPoseTransition(paintedAction);blend.sample('idle',0,0);blend.sample('working',0,1000);for(let i=1;i<fps/2;i++)blend.sample('working',i*1000/fps,1000+i*1000/fps);return blend.sample('working',500,1500);};
assert.deepEqual(cadence(30),cadence(60));assert.deepEqual(cadence(60),cadence(120));
const blend=createPoseTransition(paintedAction);blend.sample('idle',0,0);
for(let ms=0;ms<6000;ms+=20){
 const state=FOX_ACTIONS[Math.floor(ms/180)%FOX_ACTIONS.length],pose=blend.sample(state,ms%180,ms);
 assert(Object.values(pose).every(Number.isFinite));assert(pose.blink>=0&&pose.blink<=1);
 for(let y=0;y<32;y++)for(let x=0;x<32;x++){
  const a=paintedVertex(x/32,y/32,pose),b=paintedVertex((x+1)/32,y/32,pose),c=paintedVertex(x/32,(y+1)/32,pose);
  assert((b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])>0,'fold during rapid interruption');
 }
}
console.log('PASS 169 transition pairs: pose/velocity continuity, mid-blend interruption, reduced motion, 30/60/120Hz consistency, rapid-switch mesh safety.');
