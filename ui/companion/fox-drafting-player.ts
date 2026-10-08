import {smoother as ease} from './fox-skeleton.ts';
const DURATION=400;
const integral=(t:number)=>t<=0?0:t>=1?t-.5:t**6-3*t**5+2.5*t**4;
/** Filter explicit writing intent, not elapsed frame counts. Analytic integration
 * preserves the stroke clock across pauses and hidden-window gaps. Overlapping
 * reversals retain velocity; old impulses are folded into a bounded baseline. */
export function createDraftingPlayer(){
 let origin:number|undefined,last=0,clock=0,desired=1,baseline=1;
 let steps:{at:number;delta:number}[]=[];
 return {
  sample(writing:boolean,now:number){
   if(!Number.isFinite(now)||now<0||(origin!==undefined&&now<last))throw Error('Drafting requires a monotonic clock');
   if(origin===undefined){origin=now;last=now;baseline=desired=writing?1:0;}
   clock+=baseline*(now-last)+steps.reduce((sum,s)=>sum+s.delta*DURATION*(integral((now-s.at)/DURATION)-integral((last-s.at)/DURATION)),0);
   const next=writing?1:0;if(next!==desired){steps.push({at:now,delta:next-desired});desired=next;}
   for(const s of steps)if(now-s.at>=DURATION)baseline+=s.delta;
   steps=steps.filter(s=>now-s.at<DURATION);
   const speed=baseline+steps.reduce((sum,s)=>sum+s.delta*ease((now-s.at)/DURATION),0);
   last=now;
   return {time:Math.max(0,clock),bodyTime:now-origin,pauseWeight:Math.max(0,Math.min(1,1-speed))};
  },
  reset(){origin=undefined;last=clock=0;baseline=desired=1;steps=[];}
 };
}
