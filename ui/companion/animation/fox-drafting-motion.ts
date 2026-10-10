import {rotatePoint as rotate,type RigPoint} from './fox-anatomy.ts';
import definition from '../../../resources/styles/builtin/drafts/fox-states-v1/drafting-rig.json' with {type:'json'};
import {draftingArmPoint,draftingPaperPoint} from './fox-drafting-registration.ts';
import {solveReadingArm} from './fox-reading-page.ts';
import {idleSupport} from './fox-idle-support.ts';
import {smoother as ease} from './fox-skeleton.ts';
const point=(p:number[]):RigPoint=>[p[0],p[1]];
export const DRAFTING_CYCLE_MS=7200;

/** Presentation only: the blank paper never gains fabricated task output.
 * Lift is screen-space depth shorthand until the full prop rig is accepted. */
export function draftingPhase(time:number,reduced=false,pauseWeight=0){
 if(!Number.isFinite(time)||time<0)throw Error('Invalid drafting clock');
 if(!Number.isFinite(pauseWeight)||pauseWeight<0||pauseWeight>1)throw Error('Invalid drafting pause weight');
 const t=reduced?5200:time%DRAFTING_CYCLE_MS;
 const keys=[
  [0,750,300,32],[400,750,300,32],[850,750,300,0],
  [2100,805,285,0],[2400,805,285,32],[2700,750,325,0],
  [3900,790,314,0],[4700,810,290,45],[6000,810,290,45],
  [7200,750,300,32],
 ];
 let i=0;while(i<keys.length-2&&t>keys[i+1][0])i++;
 const a=keys[i],b=keys[i+1],u=(t-a[0])/(b[0]-a[0]),q=ease(u);
 const contact=(t>=850&&t<=2100)||(t>=2700&&t<=3900);
 // Small stroke texture, with zero position/velocity/acceleration at joins.
 const ink=contact?64*u*u*u*(1-u)**3*Math.sin(u*Math.PI*6)*5:0;
 const paper:RigPoint=[a[1]+(b[1]-a[1])*q,a[2]+(b[2]-a[2])*q+ink];
 const baseLift=a[3]+(b[3]-a[3])*q,lift=baseLift+(45-baseLift)*pauseWeight,target=draftingPaperPoint(paper);
 const check=ease((t-4300)/400)*(1-ease((t-6000)/400)),checkWeight=check+(1-check)*pauseWeight;
 return {paper,lift,contact:contact&&pauseWeight===0,target:[target[0],target[1]-lift*definition.paper.scale] as RigPoint,checking:t>=4700&&t<=6000,checkWeight};
}

export function draftingBodyFrame(time:number,reduced=false,pauseWeight=0,bodyTime=time){
 const {checkWeight}=draftingPhase(time,reduced,pauseWeight);
 // Body/props share the chest parent in the inspector. Looking up is an
 // uninterrupted rigid head turn, not a regenerated face or an abrupt swap.
 // Change gaze underneath a blink. Crossfading displaced painted pupils
 // produces two irises mid-transition even though the coordinates are smooth.
 const closure=Math.sin(Math.PI*checkWeight)**2;
 return {pose:idleSupport({head:{angle:3*(1-checkWeight)},lidL:{closure},lidR:{closure}},bodyTime,reduced),gazeDown:checkWeight<.5?1:0};
}

/** Both segments are rigid rotations. The forearm includes the paw and pencil,
 * so the tip reaches the target without stretching fur or slipping the grip. */
export function draftingWritingArm(time:number,reduced=false,pauseWeight=0,tipTarget?:RigPoint){
 const a=draftingArmPoint('writing',point(definition.writing.shoulder));
 const e=draftingArmPoint('writing',point(definition.writing.elbow));
 const tip=draftingArmPoint('writing',point(definition.writing.tip));
 const phase=draftingPhase(time,reduced,pauseWeight);if(tipTarget){if(tipTarget.some(v=>!Number.isFinite(v)))throw Error('Invalid pencil target');phase.target=tipTarget;}
 const r=solveReadingArm(a,e,tip,phase.target);
 const elbow=rotate(e,a,r.upper);
 const vertex=(source:RigPoint,segment:'upper'|'forearm'):RigPoint=>{
  const p=draftingArmPoint('writing',source);
  if(segment==='upper')return rotate(p,a,r.upper);
  const v=rotate(p,e,r.lower);return [v[0]+elbow[0]-e[0],v[1]+elbow[1]-e[1]];
 };
 return {...phase,reachable:r.reachable,vertex,shoulder:a,elbow};
}
