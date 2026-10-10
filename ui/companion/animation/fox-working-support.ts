import {anatomyMatrices,anatomyArmVertex,type AnatomyPose,type JointControl} from './fox-anatomy.ts';
import {seatedSupportPose} from './fox-seated-support.ts';

/** Carry the head and shoulders with the working torso, but retain the authored
 * keyboard contact paths. Compensate at the shoulder rather than extending
 * elbow limits or stretching the paw to reach the desk. */
export function workingSupport(pose:AnatomyPose,reach:number,inspect:number,t:number,reduced:boolean):AnatomyPose{
 const breath=reduced?0:Math.sin(t/1700)*reach;
 const lean=reach*(1-.55*inspect);
 const result:Record<string,JointControl>={...pose,...seatedSupportPose(.32*reach+.035*breath),
  chest:{angle:1.7*lean+.18*breath,x:.003*lean,y:.014*lean+.0025*breath},
  scarfTail:{angle:-1.4*lean-.4*breath}
 };
 const before=anatomyMatrices(pose),after=anatomyMatrices(result),parent=after.get('chest')!;
 for(const [side,point] of [['L',[.54,.958]],['R',[.67,.958]]] as const){
  const target=anatomyArmVertex(side,point,before),actual=anatomyArmVertex(side,point,after);
  const dx=target[0]-actual[0],dy=target[1]-actual[1],id='upperArm'+side,control=result[id]??{};
  result[id]={...control,x:(control.x??0)+parent[0]*dx+parent[1]*dy,y:(control.y??0)+parent[2]*dx+parent[3]*dy};
 }
 return result;
}
