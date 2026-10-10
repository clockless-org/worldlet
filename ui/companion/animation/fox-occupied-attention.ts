import {attentionStudy} from './fox-attention-study.ts';
import {createAnatomyTransition,type AnatomyFrame} from './fox-anatomy-transition.ts';

/** A caller-requested urgent response may look up before occupied hands are
 * released. This layer owns only rigid head/ears and gaze, never prop clocks,
 * arms, eyelids or dialogue. Keep it latched across the physical handoff so
 * completing the close/release does not restart the head gesture. */
export function createOccupiedAttention(){
 const duration=220;
 let base:AnatomyFrame,active=false,started=0,leaving:number|undefined;
 const mixer=createAnatomyTransition((state,elapsed,reduced)=>{
  const pose=state==='urgent'?attentionStudy('urgent',Math.min(elapsed,650),reduced,true).pose:base.pose;
  return {pose:{head:pose.head,earL:pose.earL,earR:pose.earR},front:{L:0,R:0},gazeDown:state==='urgent'?0:base.gazeDown};
 },duration);
 return {
  sample(frame:AnatomyFrame,urgent:boolean,occupied:boolean,now:number,reduced=false):AnatomyFrame{
   base=frame;
   const next=urgent&&(active||occupied);
   if(next&&!active){
    if(leaving===undefined){mixer.reset();mixer.sample('base',0,now,reduced);}
    started=now;leaving=undefined;
   }else if(!next&&active)leaving=now;
   active=next;
   if(!active&&(leaving===undefined||reduced||now-leaving>=duration)){
    leaving=undefined;mixer.reset();return frame;
   }
   const head=mixer.sample(active?'urgent':'base',active?now-started:0,now,reduced);
   return {...frame,pose:{...frame.pose,...head.pose},gazeDown:head.gazeDown};
  },
  reset(){mixer.reset();active=false;started=0;leaving=undefined;}
 };
}
