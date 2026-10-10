import {anatomyMatrices,anatomyArmVertex,type AnatomyPose,type JointControl,type RigPoint} from './fox-anatomy.ts';
import {placeWorkingPoint,type WorkingPlacement} from './fox-working-device.ts';
import {seatedSupportPose} from './fox-seated-support.ts';
import {smootherUnit as ease} from './fox-skeleton.ts';

export const WORKING_STOW_DURATION=5400;
export const WORKING_STOW_CONTACTS={
 L:{paw:[.54,.958] as RigPoint,device:[.53,.918] as RigPoint},
 R:{paw:[.67,.958] as RigPoint,device:[.79,.914] as RigPoint}
};
/** Solve the actual length-preserving painted skin, not a wrist pivot.
 * Rotation only: no shoulder translation to disguise unreachable contacts.
 * Deterministic damped least squares; this isolated study is not a RAF path. */
function grip(side:'L'|'R',body:AnatomyPose,target:RigPoint){
 const ids=['upperArm'+side,'forearm'+side,'paw'+side],limits=[79.9,94.9,29.9];
 const angles=side==='L'?[-30,40,0]:[30,-40,0];
 const pose=():Record<string,JointControl>=>({...body,...Object.fromEntries(ids.map((id,i)=>[id,{angle:angles[i]}]))});
 const point=()=>anatomyArmVertex(side,WORKING_STOW_CONTACTS[side].paw,anatomyMatrices(pose()));
 for(let i=0;i<60;i++){
  const p=point(),error=[target[0]-p[0],target[1]-p[1]];
  if(Math.hypot(...error)<1e-8)break;
  const columns=angles.map((a,j)=>{angles[j]=a+.01;const q=point();angles[j]=a;return [(q[0]-p[0])/.01,(q[1]-p[1])/.01];});
  const a=columns.reduce((s,c)=>s+c[0]*c[0],1e-9),b=columns.reduce((s,c)=>s+c[0]*c[1],0),d=columns.reduce((s,c)=>s+c[1]*c[1],1e-9),det=a*d-b*b;
  const x=(d*error[0]-b*error[1])/det,y=(a*error[1]-b*error[0])/det;
  const step=columns.map(c=>c[0]*x+c[1]*y),before=[...angles],size=Math.min(1,8/Math.max(...step.map(Math.abs)));
  let improved=false;
  for(let k=0;k<12;k++){
   const weight=size/2**k;
   step.forEach((v,j)=>angles[j]=Math.max(-limits[j],Math.min(limits[j],before[j]+v*weight)));
   const candidate=point();
   if(Math.hypot(target[0]-candidate[0],target[1]-candidate[1])<Math.hypot(...error)){improved=true;break;}
  }
  if(!improved){before.forEach((v,j)=>angles[j]=v);break;}
 }
 return Object.fromEntries(ids.map((id,i)=>[id,{angle:angles[i]}]));
}
/** Closed device -> grasp -> lift -> carry -> lower -> release.
 * Full opacity throughout. Parked endpoint remains visible and retrievable.
 * Opt-in choreography only until contacts/depth and reversal are accepted. */
export function workingStowLayout(milliseconds:number,reduced=false){
 if(!Number.isFinite(milliseconds)||milliseconds<0)throw Error('Invalid working stow time');
 const t=reduced?WORKING_STOW_DURATION:Math.min(milliseconds,WORKING_STOW_DURATION);
 const reach=ease(t/1000),lift=ease((t-1250)/850),carry=ease((t-2100)/1400),lower=ease((t-3500)/750),release=ease((t-4500)/900);
 const workingPlacement:WorkingPlacement={x:-.16*carry,y:-.035*lift*(1-lower),angle:-5*carry};
 const lean=reach*(1-release),body:AnatomyPose={...seatedSupportPose(.15*lean),chest:{angle:3*carry*lean,x:-.012*carry*lean,y:-.035*lift*(1-lower)},head:{angle:-3*carry*lean,y:.004*lean},earL:{angle:2*lean},earR:{angle:-2*lean},scarfTail:{angle:3*carry*lean}};
 return {pose:body,frontPaws:['L','R'] as const,gazeDown:.8*lean,workstation:1,workingLidClosure:1,workingPlacement,
  contact:t>=1000&&t<=4500,phase:t<1000?'reaching-device':t<1250?'gripping-device':t<2100?'lifting-device':t<3500?'carrying-device':t<4250?'lowering-device':t<4500?'supported-device':t<5400?'releasing-device':'parked-device',armWeight:reach*(1-release)};
}
export function workingStowStudy(milliseconds:number,reduced=false){
 const {armWeight,...frame}=workingStowLayout(milliseconds,reduced),pose:Record<string,JointControl>={...frame.pose};
 for(const side of ['L','R'] as const){
  const target=placeWorkingPoint(WORKING_STOW_CONTACTS[side].device,frame.workingPlacement),arm=grip(side,frame.pose,target);
  for(const [id,control] of Object.entries(arm))pose[id]={angle:control.angle!*armWeight};
 }
 return {...frame,pose};
}
