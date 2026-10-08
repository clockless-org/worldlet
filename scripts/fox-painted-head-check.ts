import assert from 'node:assert/strict';
import {paintedPose,paintedVertex,type PaintedPose} from '../ui/companion/fox-painted-idle.ts';
import {paintedAction} from '../ui/companion/fox-painted-actions.ts';
import {FOX_ACTIONS} from '../ui/companion/fox-actions.ts';

const neutral=paintedPose(0,true);
const landmarks=[[.40,.32],[.78,.32],[.50,.51],[.68,.57],[.62,.59]] as const;
const distance=(a:readonly number[],b:readonly number[])=>Math.hypot(a[0]-b[0],a[1]-b[1]);
let poses=0;
for(const state of FOX_ACTIONS)for(let ms=0;ms<12000;ms+=100){
 const action=paintedAction(state,ms,ms);
 // Check large parent motion separately from deliberately local ear/sniff/eye
 // animation: local expression controls must not disguise a scaled head.
 const p:PaintedPose={...action,look:0,sniff:0,earL:0,earR:0,tail:0};
 const transformed=landmarks.map(([u,v])=>paintedVertex(u,v,p));
 for(let i=0;i<landmarks.length;i++)for(let j=i+1;j<landmarks.length;j++){
  assert(Math.abs(distance(transformed[i],transformed[j])-distance(landmarks[i],landmarks[j]))<1e-12,`${state}: parent motion stretches face/jaw`);
 }
 for(const [u,v] of landmarks){
  assert.deepEqual(paintedVertex(u,v,{...p,pawL:-2,pawR:2}),paintedVertex(u,v,p),'Forepaw field leaks into face');
 }
 poses++;
}
// A look may move the eyes very slightly, but must not stretch the head. With
// eyes' local x offset removed, its parent transform must preserve all lengths.
const bump=(x:number,c:number,w:number)=>Math.exp(-(((x-c)/w)**2));
for(const look of [-1.5,-.8,.8,1.5]){
 const points=landmarks.map(([u,v])=>{
  const [x,y]=paintedVertex(u,v,{...neutral,look});
  const eyes=bump(u,.51,.045)*bump(v,.382,.047)+bump(u,.695,.039)*bump(v,.346,.043);
  return [x-look*.003*eyes,y];
 });
 for(let i=0;i<landmarks.length;i++)for(let j=i+1;j<landmarks.length;j++)assert(Math.abs(distance(points[i],points[j])-distance(landmarks[i],landmarks[j]))<1e-12,'Look shears face');
}
for(const [u,v] of landmarks)assert.deepEqual(paintedVertex(u,v,neutral),[u,v],'Neutral identity');
console.log(`PASS ${poses} live action poses: rigid face/jaw distances, zero paw leakage, rigid look parent and exact neutral landmarks.`);
