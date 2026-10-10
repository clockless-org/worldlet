import {createAnatomyInspector} from './fox-anatomy-inspector.ts';
import {createCompanionPerformancePlayer,TASK_PERFORMANCES,type CompanionPerformanceState as AnatomyPerformanceState} from './fox-task-performance.ts';
import {ANATOMY_STUDY_DURATION} from './fox-anatomy-clips.ts';
import {ANATOMY_HOLD_STATES} from './fox-anatomy-hold.ts';
import {foxPortraitRegistration,drawRegisteredFox} from './fox-portrait-registration.ts';

/** Explicit resource contract, enabled by the built-in development pack.
 * Release promotion still requires complete performance/HUD acceptance. */
export type AnatomyRuntimeSources={
 original:string;half:string;closed:string;down:string;body:string;limbs:string;
 reading:string;turnArm:string;earRoots:string;neck:string;openPalm:string;sidePalm:string;
 readingGripUpper:string;readingGripForearm:string;
 workstation:string;workstationBase:string;magnifier:string;searchDock:string;grasp:string;eyeUnderpaint:string;sclera:string;
};
const authored=new Set<string>([...Object.keys(ANATOMY_STUDY_DURATION),...ANATOMY_HOLD_STATES,...TASK_PERFORMANCES,'reading']);
const aliases:Readonly<Record<string,AnatomyPerformanceState>>={
 waving:'greeting',talking:'explaining',happy:'succeeded',satisfied:'succeeded',
 preparing:'thinking',transcribing:'thinking',writing:'listening',
};
export function anatomyRuntimeState(state:string):AnatomyPerformanceState|undefined{
 return authored.has(state)?state as AnatomyPerformanceState:aliases[state];
}
export function anatomyRuntimeDuration(state:string):number|undefined{
 const key=anatomyRuntimeState(state);
 return key?ANATOMY_STUDY_DURATION[key as keyof typeof ANATOMY_STUDY_DURATION]:undefined;
}

/** Same drawing contract as the existing portrait, with one persistent state
 * player. Resource opt-in lets the real portrait be tested before promotion. */
export async function loadAnatomyFox(sources:AnatomyRuntimeSources,target?:HTMLCanvasElement){
 if(!sources.eyeUnderpaint||!sources.sclera)throw Error('Dev anatomical eyes require registered lid and sclera artwork');
 if(!sources.readingGripUpper||!sources.readingGripForearm)throw Error('Dev reading requires complete upper-arm and forearm artwork');
 if(!sources.workstationBase)throw Error('Dev working requires complete keyboard/base artwork');
 if(!sources.sidePalm)throw Error('Dev wrist turns require painted paw-side artwork');
 const original=new Image();original.src=sources.original;await original.decode();
 const registration=foxPortraitRegistration(original);
 const surface=target??document.createElement('canvas');
 if(!target){surface.width=640;surface.height=640;}
 const rig=await createAnatomyInspector(surface,sources.original,
  {half:sources.half,closed:sources.closed,down:sources.down,underpaint:sources.eyeUnderpaint,sclera:sources.sclera},sources.body,sources.limbs,
  sources.reading,sources.turnArm,sources.earRoots,sources.neck,sources.openPalm,
  {device:sources.workstation,base:sources.workstationBase},sources.magnifier,sources.searchDock,sources.grasp,sources.sidePalm,undefined,
  {upper:sources.readingGripUpper,forearm:sources.readingGripForearm});
 const player=createCompanionPerformancePlayer();let disposed=false;
 return {
  supports:(state:string)=>anatomyRuntimeState(state)!==undefined,
  stats:()=>({...rig.skinStats(),directTarget:Boolean(target),eyes:'independent-v1' as const,readingGrip:'complete-v3' as const,pawSide:'painted-v1' as const,workStow:'precomputed-v1' as const}),
  reset(){player.reset();},
  draw(ctx:CanvasRenderingContext2D,state:string,_elapsed:number,now:number,reduced:boolean){
   if(disposed)throw Error('Anatomical Fox was disposed');
   if(target&&ctx.canvas!==target)throw Error('Anatomical Fox target cannot change');
   const performance=anatomyRuntimeState(state);
   if(!performance)throw Error('Unauthored anatomical runtime state: '+state);
   const frame=player.sample(performance,now,reduced);
   if(target){
    ctx.clearRect(0,0,target.width,target.height);ctx.save();
    ctx.translate(registration.x*target.width/320,registration.y*target.height/320);
    ctx.scale(registration.width/320,registration.height/320);
   }
   try{rig.draw(frame.pose,{authored:true,eyeOcclusion:true,readingGrip:true,sidePalmR:true,gpu:true,gpuFrame:true,frontMix:frame.front,
    gazeDown:frame.gazeDown,gazeX:frame.gazeX,pawTurnR:frame.pawTurnR,workstation:frame.workstation,workingLidClosure:frame.workingLidClosure,
    workingPlacement:frame.workingPlacement,workingCarry:frame.workingCarry,workingParked:frame.workingParked,
    magnifier:frame.magnifier,magnifierPose:frame.magnifierPose,searchDock:frame.searchDock,graspR:frame.graspR,reading:frame.reading});
   }finally{if(target)ctx.restore();}
   if(!target)drawRegisteredFox(ctx,surface,registration);
   return {key:'anatomy-v1:'+performance,sheet:'anatomy',frame:0,timingPhase:frame.timingPhase};
  },
  dispose(){if(disposed)return;disposed=true;player.reset();rig.dispose();if(!target)surface.width=surface.height=1;}
 };
}
