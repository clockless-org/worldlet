import {anatomyMatrices,transform,tailVertex,FOX_ANATOMY,mixPoint as mix} from './fox-anatomy.ts';
import type {AnatomyPose,JointControl,RigMatrix,RigPoint} from './fox-anatomy.ts';
import {smoother as smooth} from './fox-skeleton.ts';

const chestBlendFields=new WeakMap<ReadonlyMap<string,RigMatrix>,{width:number;start:number}>();
function chestBlendField(matrices:ReadonlyMap<string,RigMatrix>){
 const cached=chestBlendFields.get(matrices);if(cached!==undefined)return cached;
 let separationSquared=0;
 for(const p of [[.32,.72],[.80,.72]] as const){
  const a=transform(matrices.get('chest')!,p),b=transform(matrices.get('pelvis')!,p);
  separationSquared+=(a[0]-b[0])**2+(a[1]-b[1])**2;
 }
 // Quiet breathing keeps its existing bind weights. Larger supported leans
 // recruit the lower ribcage smoothly instead of stretching a narrow stripe.
 const separation=Math.sqrt(separationSquared/2);
 const upperRibs=.04*smooth((separation-.030)/.010);
 const field={width:.10+.04*smooth((separation-.025)/.010)+upperRibs,start:.68-upperRibs};
 chestBlendFields.set(matrices,field);return field;
}

/** Keep selected resting forelimbs in the root frame while the torso moves
 * slightly. Only for straight planted limbs, not reaching or bent-arm IK.
 * The shoulder skin blends the small torso displacement above the fixed paw. */
export function plantForepaws(pose:AnatomyPose,sides:readonly ('L'|'R')[]):AnatomyPose{
 const result:Record<string,JointControl>={...pose},matrices=anatomyMatrices(pose),parent=matrices.get('chest')!,root=matrices.get('root')!;
 for(const side of sides){
  const id='upperArm'+side,pivot=FOX_ANATOMY.joints.find(j=>j.id===id)!.pivot as [number,number];
  const actual=transform(parent,pivot),target=transform(root,pivot),dx=target[0]-actual[0],dy=target[1]-actual[1];
  result[id]={angle:(Math.atan2(root[1],root[0])-Math.atan2(parent[1],parent[0]))*180/Math.PI,x:parent[0]*dx+parent[1]*dy,y:parent[2]*dx+parent[3]*dy};
  result['forearm'+side]={};result['paw'+side]={};
 }
 return result;
}

/** Small seated weight transfer, not a walking rig. The foot counter-transform
 * is solved in its parent's coordinates so its whole painted sole stays rigid
 * and planted while pelvis/haunches move. Root travel still carries everything. */
export function seatedSupportPose(amount:number):AnatomyPose{
 if(!Number.isFinite(amount)||amount<0||amount>1)throw Error('Invalid seated support amount');
 const pose:Record<string,JointControl>={pelvis:{y:.012*amount},thighL:{angle:-3*amount},thighR:{angle:2.5*amount},footL:{angle:3*amount},footR:{angle:-2.5*amount}};
 const matrices=anatomyMatrices(pose);
 for(const [side,point] of [['L',[.45,.92]],['R',[.747,.92]]] as const){
  const parent=matrices.get('thigh'+side)!,actual=transform(matrices.get('foot'+side)!,point),dx=point[0]-actual[0],dy=point[1]-actual[1];
  pose['foot'+side]={...pose['foot'+side],x:parent[0]*dx+parent[1]*dy,y:parent[2]*dx+parent[3]*dy};
 }
 return pose;
}

/** One shared field across torso/haunch/ankle ownership cuts. Upper fur follows
 * chest, pelvis transitions to the haunch, and the distal sole is exactly the
 * foot transform. No head/face pixels enter this field. */
export function seatedBodyVertex(point:RigPoint,matrices:ReadonlyMap<string,RigMatrix>):RigPoint{
 const [x,y]=point,side=smooth((x-.54)/.12);
 // Spread the chest-to-pelvis stretch across the full lower ribcage. The old
 // narrow band amplified the greeting's shoulder follow-through into a local
 // 1.76× area expansion. Keep the acting/contacts, distribute the skin strain.
 // Deep stretches additionally recruit upper ribs, keeping the lower end of
 // the blend fixed rather than pushing it into the haunch ownership blend.
 const {width,start}=chestBlendField(matrices);
 const upper=mix(transform(matrices.get('chest')!,point),transform(matrices.get('pelvis')!,point),smooth((y-start)/width));
 const thigh=mix(transform(matrices.get('thighL')!,point),transform(matrices.get('thighR')!,point),side);
 const feet=mix(transform(matrices.get('footL')!,point),transform(matrices.get('footR')!,point),side);
 const hip=1-smooth((y-.78)/.06),foot=smooth((y-.85)/.065),leg=1-hip-foot;
 return [upper[0]*hip+thigh[0]*leg+feet[0]*foot,upper[1]*hip+thigh[1]*leg+feet[1]*foot];
}

/** The original tail/haunch cut has no hidden pixels. Pin its shared edge to
 * the same support field, while the free tail still follows its own bones. */
export function seatedTailVertex(point:RigPoint,matrices:ReadonlyMap<string,RigMatrix>):RigPoint{
 // The shared contour reaches up behind the shoulder, not only the haunch.
 // Finish the pin above that contour so a torso lean cannot pull the upper
 // tail/chest cut apart; the outer/upper tail remains freely articulated.
 const attachment=smooth((point[0]-.24)/.07)*smooth((point[1]-.55)/.08);
 return mix(tailVertex(point,matrices),seatedBodyVertex(point,matrices),attachment);
}
