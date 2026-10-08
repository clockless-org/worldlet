import type {PaintedPose} from './fox-painted-idle.ts';

type Sampler=(state:string,elapsed:number,now:number,reduced?:boolean)=>PaintedPose;
type Values=Record<string,number>;
/** C1 residual blending: interruptions preserve both pose and velocity. No idle detour. */
export function createPoseTransition(sample:Sampler){
 let current='',origin=0,started=0,duration=420,offset:Values={},tangent:Values={};
 const values=(pose:PaintedPose)=>pose as Values;
 function target(state:string,base:number,now:number){
  const pose=values(sample(state,now-base,now)),before=values(sample(state,now-base-.5,now-.5)),after=values(sample(state,now-base+.5,now+.5));
  const velocity:Values={};for(const key of Object.keys(pose))velocity[key]=(after[key]||0)-(before[key]||0);
  return {pose,velocity};
 }
 function evaluate(now:number){
  const result=target(current,origin,now),s=Math.max(0,Math.min(1,(now-started)/duration));
  const h00=2*s**3-3*s**2+1,h10=s**3-2*s**2+s;
  const d00=(6*s**2-6*s)/duration,d10=3*s**2-4*s+1;
  for(const key of Object.keys(result.pose)){
   result.pose[key]+=h00*(offset[key]||0)+h10*duration*(tangent[key]||0);
   result.velocity[key]+=d00*(offset[key]||0)+d10*(tangent[key]||0);
  }
  // Eyelid weights cannot extrapolate past an authored pose.
  if(result.pose.blink<0||result.pose.blink>1){result.pose.blink=Math.max(0,Math.min(1,result.pose.blink));result.velocity.blink=0;}
  return result;
 }
 return {sample(state:string,elapsed:number,now:number,reduced=false):PaintedPose{
  if(!current||reduced){current=state;origin=now-elapsed;started=now;offset={};tangent={};return sample(state,elapsed,now,reduced);}
  if(state!==current){
   const previous=evaluate(now),next=target(state,now-elapsed,now);
   current=state;origin=now-elapsed;started=now;
   duration=['listening','writing'].includes(state)?180:['sleeping','drowsy'].includes(state)?750:420;
   offset={};tangent={};
   for(const key of Object.keys(next.pose)){offset[key]=(previous.pose[key]||0)-next.pose[key];tangent[key]=(previous.velocity[key]||0)-next.velocity[key];}
  }
  return evaluate(now).pose as PaintedPose;
 }};
}
