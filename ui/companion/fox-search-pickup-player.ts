import {searchPickupStudy} from './fox-search-pickup-study.ts';
import {searchingStudy} from './fox-searching-study.ts';
import {createAnatomyTransition,type AnatomyFrame} from './fox-anatomy-transition.ts';
import type {GraspControls} from './fox-grasp-study.ts';
type Stage='rest'|'entry'|'resume'|'hold'|'return'|'abort';
export type SearchPickupIntent=boolean|'hold';
type Instance={stage:Stage;origin:number;exit?:number;cancelCurl?:{at:number;value:GraspControls;rate:GraspControls}};
const closedGrip:GraspControls={thumb:1,index:1,middle:1,outer:1};
const digits=['thumb','index','middle','outer'] as const;
function cancelledGrip(cancel:NonNullable<Instance['cancelCurl']>,t:number):GraspControls{
 return Object.fromEntries(digits.map(id=>{
  const value=cancel.value[id],rate=cancel.rate[id];
  if(rate<=0)return [id,value];
  // Preserve instantaneous velocity, then coast to rest without reaching a
  // new full grip. The surrounding pose blend subsequently opens the hand.
  const duration=Math.min(120,2*(1-value)/rate),x=duration>0?Math.min(1,Math.max(0,(t-cancel.at)/duration)):0;
  return [id,value+rate*duration*(x-x*x+x*x*x/3)];
 })) as GraspControls;
}
const dock=()=>searchPickupStudy(0).magnifierPose;
// Integrate a quintic speed ramp: pickup ends at rest, so held secondary
// motion must start with zero speed rather than jumping to its full clock rate.
const heldTime=(t:number)=>{const x=Math.min(1,t/600);return t<600?600*(2.5*x**4-3*x**5+x**6):t-300;};
const presentation=(stage:Stage,t:number):ReturnType<typeof searchingStudy>&{graspR?:GraspControls}=>{
 if(stage==='entry')return t<2300?searchPickupStudy(t):searchingStudy(1100+heldTime(t-2300),false,true);
 if(stage==='resume')return searchingStudy(1100+t,false,true);
 if(stage==='hold')return searchingStudy(2300+t,false,true,true);
 if(stage==='return')return searchPickupStudy(t<1000?10300:Math.min(12000,10300+t-1000));
 return searchPickupStudy(0);
};
const owns=(stage:Stage,t:number)=>stage==='hold'||stage==='resume'||stage==='entry'&&t>=1300||stage==='return'&&t<1000;
const restDelay=(stage:Stage)=>stage==='rest'?0:stage==='abort'?1000:stage==='return'?2700:undefined;

/** One persistent prop, independently owned by the dock or the actual hand.
 * Cancellation blends continuing poses, then releases only at the dock.
 * Reversing a return before release keeps the same held prop. `hold` cancels
 * an unacquired reach or retains an acquired tool with its scan paused.
 * Preview only:
 * the caller still has to integrate other semantic states. */
export function createSearchPickupPlayer(){
 const duration=1000,instances=new Map<string,Instance>();let serial=0,key:string|undefined,requested:SearchPickupIntent=false,last=-Infinity,wasReduced=false;
 const mixer=createAnatomyTransition((id,t)=>{
  const instance=instances.get(id);if(!instance)throw Error('Missing pickup instance');
  const f=presentation(instance.stage,t);
  return {pose:f.pose,front:{L:1,R:1},gazeDown:f.gazeDown,graspR:instance.cancelCurl?cancelledGrip(instance.cancelCurl,t):f.graspR??closedGrip};
 },duration);
 function instanceFrame(now:number){const i=instances.get(key!)!;return {i,t:now-i.origin};}
 return {
  sample(active:SearchPickupIntent,now:number,reduced=false){
   if(!Number.isFinite(now)||now<0||now<last)throw Error('Pickup requires a finite monotonic clock');
   if(reduced){
    const attached=active===true||active==='hold'&&key!==undefined&&owns(instances.get(key)!.stage,now-instances.get(key)!.origin);
    this.reset();last=now;requested=active;wasReduced=true;
    if(attached){key=String(++serial);instances.set(key,{stage:'hold',origin:now});}
    return {...(attached?searchPickupStudy(5000,true):searchPickupStudy(0)),restTime:attached?undefined:0,restAt:attached?undefined:now};
   }
   if(wasReduced){if(active===true)requested='hold';wasReduced=false;}
   if(!key||active!==requested){
    let stage:Stage=active===true?'entry':'rest',origin=now;
    if(key){const {i,t}=instanceFrame(now),attached=owns(i.stage,t);stage=active==='hold'?(attached?'hold':'abort'):active?(attached?'resume':'entry'):(attached?'return':'abort');
     const delay=restDelay(i.stage);
     if(active!==true&&delay!==undefined&&t>=delay){stage='rest';origin=i.origin+delay;}
     // Stop future finger closure on an abandoned, still-docked reach. The
     // existing blend opens from the current curl without acquiring the tool.
     if(i.stage==='entry'&&!attached){const value=searchPickupStudy(t).graspR,next=searchPickupStudy(t+.001).graspR;i.cancelCurl={at:t,value,rate:Object.fromEntries(digits.map(id=>[id,(next[id]-value[id])/.001])) as GraspControls};}
     i.exit=now;}
    key=String(++serial);instances.set(key,{stage,origin});requested=active;
   }
   const {i,t}=instanceFrame(now),frame:AnatomyFrame=mixer.sample(key,t,now),attached=owns(i.stage,t);
   last=now;
   for(const [id,instance] of instances)if(id!==key&&instance.exit!==undefined&&now>=instance.exit+duration)instances.delete(id);
   const delay=restDelay(i.stage),restTime=delay!==undefined&&t>=delay?t-delay:undefined;
   return {pose:frame.pose,frontPaws:['L','R'] as const,gazeDown:frame.gazeDown??0,magnifier:1,magnifierPose:attached?frame.pose:dock(),attached,graspR:frame.graspR!,restTime,restAt:delay===undefined?undefined:i.origin+delay};
  },
  reset(){instances.clear();serial=0;key=undefined;requested=false;last=-Infinity;wasReduced=false;mixer.reset();}
 };
}

export const SEARCH_PICKUP_REVIEW_EVENTS=[[0,false],[400,true],[950,false],[2400,true],[6800,false],[7150,true],[10300,false]] as const;
export function searchPickupReview(now:number,reduced=false){
 if(!Number.isFinite(now)||now<0)throw Error('Invalid pickup review time');
 const player=createSearchPickupPlayer();let active=false;
 for(const [at,next] of SEARCH_PICKUP_REVIEW_EVENTS){if(at>now)break;active=next;player.sample(active,at,reduced);}
 return player.sample(active,now,reduced);
}
