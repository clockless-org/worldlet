import {createAnatomyPerformancePlayer,type AnatomyPerformanceState} from './fox-anatomy-performance.ts';
import {createAnatomyTransition,type AnatomyFrame} from './fox-anatomy-transition.ts';
import {anatomyMatrices,anatomyArmVertex,type AnatomyPose,type JointControl} from './fox-anatomy.ts';
import {FOX_WORKING_RIG,workingDevicePoint} from './fox-working-device.ts';
import {smootherUnit as ease,pulse as phrase} from './fox-skeleton.ts';

export const TASK_PERFORMANCES=['comparing','planning','drafting','calculating','organizing','creating','checking'] as const;
export type TaskPerformance=typeof TASK_PERFORMANCES[number];
export type CompanionPerformanceState=AnatomyPerformanceState|TaskPerformance;
export const isTaskPerformance=(state:string):state is TaskPerformance=>(TASK_PERFORMANCES as readonly string[]).includes(state);

const TASK_GAZE:Record<TaskPerformance,readonly (readonly [number,number,number,number])[]>={
 comparing:[[540,-.7,2450,3150],[3740,.65,5850,6650],[7740,-.35,8750,9800]],
 planning:[[290,-.55,2900,3800],[7240,.35,8850,10100]],
 drafting:[[390,.4,2250,2900],[3340,-.25,4800,5450]],
 calculating:[[3740,-.4,5600,6500]],
 organizing:[[540,-.5,1480,2100],[2490,.6,4450,5300]],
 creating:[[490,.65,2900,4200],[4740,-.5,7000,8000],[8940,.3,9690,10300]],
 checking:[[540,-.6,1600,2300],[2840,.2,3990,4700],[5440,.5,7750,8600]],
};

/** Work at one real supported desk. These are seven separate performances,
 * not invented task results or seven names for the typing clip. Each has two
 * asymmetric phrases, a review pause and independently delayed follow-through.
 * The unused pencil/notebook studies remain in the authoring inspector. */
function taskPhrase(state:TaskPerformance,elapsed:number,reduced=false,cancelAfter=Infinity):AnatomyFrame{
 if(!Number.isFinite(elapsed)||elapsed<0)throw Error('Invalid task performance clock');
 const periods={comparing:11200,planning:13600,drafting:9400,calculating:10800,organizing:12400,creating:14400,checking:12800};
 const time=reduced?3200:Math.max(0,elapsed-1200),phase=time%periods[state],origin=time-phase,entry=reduced?1:ease(time/950);
 const beat=(at:number,rise:number,fall:number,end:number)=>origin+at+1200<cancelAfter?phrase(phase,at,rise,fall,end)*entry:0;
 let look=0,lean=0,nod=0,left=0,right=0,ear=0,inspect=0;
 switch(state){
  case 'comparing':{
   const a=beat(700,650,2450,3150),b=beat(3900,850,5850,6650),revisit=beat(7900,500,8750,9800);
   look=-4*a+3.4*b-1.8*revisit;lean=-a+.7*b;left=.65*a;right=.55*b;inspect=beat(6500,700,7400,8200);ear=.8*a-.6*b;break;
  }
  case 'planning':{
   const consider=beat(450,1100,2900,3800),place=beat(4300,550,4950,5600),revise=beat(7400,1000,8850,10100);
   look=-2.6*consider+1.4*revise;lean=-.6*consider+.5*place;nod=.7*place-.4*revise;
   right=.9*place+.65*revise;left=.3*beat(10600,400,11200,11900);inspect=consider;ear=beat(3150,250,3490,4030);break;
  }
  case 'drafting':{
   const line=beat(550,450,2250,2900),next=beat(3500,350,4800,5450);
   look=1.6*line-.8*next;lean=.65*line+.4*next;nod=.55*next;
   right=.85*line+.65*next;left=.35*beat(1200,180,1450,1820)+.5*beat(4050,220,4380,4800);
   inspect=beat(6200,650,7600,8750);ear=-.6*line;break;
  }
  case 'calculating':{
   const count=beat(800,180,1010,1390)+.8*beat(1650,180,1850,2230)+.65*beat(2500,220,2770,3160);
   const check=beat(3900,900,5600,6500),confirm=beat(7300,220,7550,8100);
   right=.95*count+.8*confirm;left=.4*beat(8450,210,8740,9200);look=-1.5*check;lean=.3*count;nod=.6*confirm;
   inspect=check;ear=.8*beat(4200,400,5300,6200);break;
  }
  case 'organizing':{
   const select=beat(700,450,1480,2100),move=beat(2650,1000,4450,5300),square=beat(6300,550,7500,8400);
   left=.8*select+.5*square;right=.9*move+.5*square;look=-2*select+2.7*move;lean=-.45*select+.75*move;nod=.6*square;
   inspect=beat(9000,650,10100,11400);ear=-.6*move;break;
  }
  case 'creating':{
   const sweep=beat(650,1300,2900,4200),assess=beat(4900,1100,7000,8000),detail=beat(9100,350,9690,10300);
   right=sweep+.55*detail;left=.35*beat(10750,230,11100,11600);look=3*sweep-2.2*assess+1.2*detail;
   lean=.85*sweep-.9*assess;nod=-.6*assess;inspect=assess;ear=.8*beat(7800,300,8200,8750);break;
  }
  case 'checking':{
   const first=beat(700,700,1600,2300),second=beat(3000,650,3990,4700),verify=beat(5600,1000,7750,8600);
   look=-2.4*first+.6*second+2*verify;nod=.35*first+.65*second;lean=.45*first+.65*second;
   left=.4*first;right=.6*second+.35*beat(9250,250,9600,10100);inspect=verify;ear=-.6*verify;break;
  }
 }
 // A short eye movement finds the target before the slower head turn. The
 // hold/release follows the same authored attention beat, not a sine wave.
 const gazeX=TASK_GAZE[state].reduce((sum,[at,direction,fall,end])=>sum+direction*beat(at,140,fall,end),0);
 return {pose:{
  chest:{angle:1.6*lean,x:.005*lean,y:.004*lean-.004*inspect},head:{angle:look,y:.004*nod-.006*inspect},
  earL:{angle:1.8*ear+inspect},earR:{angle:-1.2*ear-1.5*inspect},
  upperArmL:{angle:2*left},forearmL:{angle:-3*left},pawL:{angle:5*left},
  upperArmR:{angle:-2.5*right},forearmR:{angle:3.5*right},pawR:{angle:-6*right},
 },gazeX,front:{L:0,R:0},workDetail:{weight:entry,left:.011*left,right:.011*right}};
}

/** Secondary parts respond to the authored gesture with distinct delays.
 * Sampling analytic clocks preserves the same result after skipped frames. */
export function taskPerformance(state:TaskPerformance,elapsed:number,reduced=false,cancelAfter=Infinity):AnatomyFrame{
 const frame=taskPhrase(state,elapsed,reduced,cancelAfter);
 const lag=(ms:number)=>taskPhrase(state,Math.max(0,elapsed-ms),reduced,cancelAfter-ms).pose;
 const chest=lag(100),ears=lag(75),scarf=lag(190),tail=lag(310);
 return {...frame,pose:{...frame.pose,chest:chest.chest,earL:ears.earL,earR:ears.earR,
  scarfTail:{angle:reduced?0:-.55*(scarf.chest?.angle??0)-.12*(scarf.head?.angle??0)},
  tailTip:{angle:reduced?0:.4*(tail.chest?.angle??0)+.16*(tail.head?.angle??0)},
 }};
}

// Blend from the physical player's contact points into the task's authored
// key contacts. The task weight fades out before lid/carry handling begins;
// review pauses really stop typing, with no sliding keys or detached wrists.
export function applyTaskPerformance(base:AnatomyPose,detail:AnatomyPose,contact?:AnatomyFrame['workDetail']):AnatomyPose{
 if(!Object.keys(detail).length)return base;
 const pose:Record<string,JointControl>={...base};
 for(const [id,control] of Object.entries(detail)){
  pose[id]={...base[id]};for(const key of ['angle','x','y'] as const)if(control[key]!==undefined)pose[id][key]=(pose[id][key]??0)+control[key]!;
 }
 const weight=contact?.weight??0;
 // Replace the generic typing accents while this task owns the desk. Its
 // deliberate review pauses must not keep typing underneath the new acting.
 if(weight)for(const side of ['L','R'] as const)for(const segment of ['upperArm','forearm','paw'] as const){
  const id=segment+side,neutral=segment==='paw'?0:FOX_WORKING_RIG.contactPose[id];
  pose[id]={...pose[id],angle:(base[id]?.angle??0)*(1-weight)+neutral*weight+(detail[id]?.angle??0)};
 }
 const before=anatomyMatrices(base),after=anatomyMatrices(pose),parent=after.get('chest')!;
 for(const side of ['L','R'] as const){
  const [x,y]=FOX_WORKING_RIG.pawContacts[side],target=anatomyArmVertex(side,[x,y],before),actual=anatomyArmVertex(side,[x,y],after);
  const [kx,ky]=FOX_WORKING_RIG.keyContacts[side],key=workingDevicePoint([kx,ky]);
  target[0]+=(key[0]-target[0])*weight;target[1]+=(key[1]-target[1])*weight-(side==='L'?contact?.left??0:contact?.right??0);
  const dx=target[0]-actual[0],dy=target[1]-actual[1],id='upperArm'+side;
  pose[id]={...pose[id],x:(pose[id]?.x??0)+parent[0]*dx+parent[1]*dy,y:(pose[id]?.y??0)+parent[2]*dx+parent[3]*dy};
 }
 return pose;
}

/** Semantic detail is separate from physical prop ownership. Switching between
 * digital tasks keeps the installed desk; speech pauses it, other gestures wait
 * for release. One physical player still owns every object and handoff. */
export function createCompanionPerformancePlayer(){
 const physical=createAnatomyPerformancePlayer({searchPickup:true,workHandling:true,workStow:true,occupiedAttention:true});
 const instances=new Map<string,{state:TaskPerformance|undefined;origin:number;exit?:number}>();
 let current='',serial=0,requested:CompanionPerformanceState|undefined,requestedAt=0;
 const detail=createAnatomyTransition((key,elapsed,reduced)=>{
  const instance=instances.get(key)!;
  return instance.state?taskPerformance(instance.state,elapsed,reduced,instance.exit===undefined?Infinity:instance.exit-instance.origin):{pose:{},front:{L:0,R:0}};
 });
 return {
  sample(state:CompanionPerformanceState,now:number,reduced=false):AnatomyFrame{
   // Observe the old semantic request at this event boundary first. A hidden
   // page may have completed a queued prop handoff without a rendered frame;
   // its old task must enter at the real boundary before the new task blends.
   if(requested!==undefined&&state!==requested)this.sample(requested,now,reduced);
   if(state!==requested){requested=state;requestedAt=now;}
   const task=isTaskPerformance(state)?state:undefined;
   const frame=physical.sample(task?'working':state as AnatomyPerformanceState,now,reduced);
   // Wait for safe equipment ownership before a task's first authored phrase.
   const active=physical.currentPerformance();
   const target=task&&active?.state==='working'?task:undefined;
   const at=target?Math.max(requestedAt,active!.origin):requestedAt;
   if(!current||instances.get(current)!.state!==target){
    if(current)instances.get(current)!.exit=at;
    current=String(++serial);instances.set(current,{state:target,origin:at});
    detail.sample(current,0,at,reduced);
   }
   const modifier=detail.sample(current,now-instances.get(current)!.origin,now,reduced);
   for(const [key,value] of instances)if(key!==current&&value.exit!==undefined&&now>=value.exit+650)instances.delete(key);
   // No book/search pose is modified before work has acquired the hands.
   return {...frame,gazeX:(frame.gazeX??0)+(modifier.gazeX??0),pose:applyTaskPerformance(frame.pose,modifier.pose,modifier.workDetail)};
  },
  reset(){physical.reset();detail.reset();instances.clear();current='';serial=0;requested=undefined;requestedAt=0;}
 };
}
