import definition from '../../../resources/styles/builtin/drafts/fox-states-v1/anatomy.json' with {type:'json'};
import {smooth} from './fox-skeleton.ts';

/** Draft anatomical rig. This is NOT registered as live artwork. No scale/shear
 * control is exposed: rotating a shoulder cannot stretch the face. Pivots use
 * original canvas coordinates, not generated-part bounding boxes. */
export type RigPoint=readonly [number,number];
export type RigMatrix=readonly [number,number,number,number,number,number];
export type JointControl={angle?:number;x?:number;y?:number;closure?:number};
export type AnatomyPose=Readonly<Record<string,JointControl>>;
export const FOX_ANATOMY=definition;
export const IDENTITY:RigMatrix=[1,0,0,1,0,0];
export const addPoint=(a:RigPoint,b:RigPoint):RigPoint=>[a[0]+b[0],a[1]+b[1]];
export const mixPoint=(a:RigPoint,b:RigPoint,t:number):RigPoint=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];
/** Rotate p about origin by angle (radians). */
export const rotatePoint=(p:RigPoint,origin:RigPoint,angle:number):RigPoint=>{const x=p[0]-origin[0],y=p[1]-origin[1];return [origin[0]+Math.cos(angle)*x-Math.sin(angle)*y,origin[1]+Math.sin(angle)*x+Math.cos(angle)*y];};
export function multiply(a:RigMatrix,b:RigMatrix):RigMatrix{
 return [a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]];
}
export function transform(m:RigMatrix,p:RigPoint):[number,number]{return [m[0]*p[0]+m[2]*p[1]+m[4],m[1]*p[0]+m[3]*p[1]+m[5]];}
export function anatomyMatrices(pose:AnatomyPose={}):Map<string,RigMatrix>{
 const matrices=new Map<string,RigMatrix>();
 for(const joint of definition.joints){
  const control=pose[joint.id]||{},values=[control.angle??0,control.x??0,control.y??0,control.closure??0];
  if(!values.every(Number.isFinite))throw Error('Non-finite Fox joint: '+joint.id);
  const angle=Math.max(-joint.limit,Math.min(joint.limit,values[0]))*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle),[x,y]=joint.pivot;
  const local:RigMatrix=[c,s,-s,c,x-c*x+s*y+values[1],y-s*x-c*y+values[2]];
  const parent=joint.parent?matrices.get(joint.parent):IDENTITY;
  if(!parent)throw Error('Unresolved Fox joint parent: '+joint.parent);
  matrices.set(joint.id,multiply(parent,local));
 }
 return matrices;
}
export function inPolygon(x:number,y:number,polygon:readonly (readonly number[])[]){
 let inside=false;
 for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
  const a=polygon[i],b=polygon[j];
  if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])inside=!inside;
 }
 return inside;
}
/** Last matching anatomical polygon owns the pixel. One owner prevents missing
 * pixels / doubled alpha at rest. This is registration, not hidden-surface art. */
export function anatomyOwner(x:number,y:number){
 for(let i=definition.parts.length-1;i>=0;i--){
  const part=definition.parts[i],ellipse=part.ellipse;
  if(ellipse){if(Math.hypot((x-ellipse[0])/ellipse[2],(y-ellipse[1])/ellipse[3])<1)return i;}
  else if(inPolygon(x,y,part.polygon))return i;
 }
 return 0;
}

/** A continuous skin across the entire painted tail. Bones are NOT cut into
 * independent strips. Smooth partition-of-unity weights avoid seams at bends. */
export function tailWeights(x:number,y:number):readonly [number,number,number]{
 const base=smooth((y-.76)/.10)*smooth((x-.18)/.15),tip=1-smooth((y-.60)/.22);
 return [base,(1-base)*(1-tip),(1-base)*tip];
}
export function tailVertex(point:RigPoint,matrices:ReadonlyMap<string,RigMatrix>):[number,number]{
 const weights=tailWeights(...point),ids=['tailBase','tailMid','tailTip'];
 let x=0,y=0;for(let i=0;i<3;i++){const p=transform(matrices.get(ids[i])!,point);x+=p[0]*weights[i];y+=p[1]*weights[i];}
 return [x,y];
}

/** Continuous upper-arm / forearm / paw influence. Parts remain independently
 * addressable, but the skin crosses the elbow and wrist without cut edges. */
export function armWeights(y:number):readonly [number,number,number]{
 const elbow=smooth((y-.71)/.18),wrist=smooth((y-.865)/.105);
 return [1-elbow,elbow*(1-wrist),elbow*wrist];
}
type ArmSkin=(point:RigPoint)=>[number,number];
const armSkins=new WeakMap<ReadonlyMap<string,RigMatrix>,Partial<Record<'L'|'R',ArmSkin>>>();
/** Integrate a length-preserving centerline, then rotate cross sections. Linear
 * matrix blending would shorten the limb and invert its inside elbow at 90°.
 * The connected skin consumes joint ROTATIONS; child translation is reserved
 * for a future IK target solver, not a way to detach the forearm from the elbow. */
function createArmSkin(side:'L'|'R',matrices:ReadonlyMap<string,RigMatrix>):ArmSkin{
 const ids=['upperArm'+side,'forearm'+side,'paw'+side],joints=ids.map(id=>definition.joints.find(j=>j.id===id)!.pivot);
 const first=matrices.get(ids[0])!,reference=Math.atan2(first[1],first[0]);
 const deltas=ids.map(id=>{const m=matrices.get(id)!,a=Math.atan2(m[1],m[0])-reference;return Math.atan2(Math.sin(a),Math.cos(a));});
 if(deltas.every(a=>Math.abs(a)<1e-12))return p=>transform(first,p);
 const angle=(y:number)=>{const weights=armWeights(y);return reference+weights.reduce((a,w,i)=>a+w*deltas[i],0);};
 const segment=(y:number)=>y<joints[1][1]?[joints[0],joints[1]]:[joints[1],joints[2]];
 const centerX=(y:number)=>{const [a,b]=segment(y);return a[0]+(b[0]-a[0])*(y-a[1])/(b[1]-a[1]);};
 const ys=[...new Set([...Array.from({length:257},(_,i)=>i/256),...joints.map(j=>j[1])])].sort((a,b)=>a-b);
 const centers:RigPoint[]=[[0,0]];
 for(let i=1;i<ys.length;i++){
  const y0=ys[i-1],y1=ys[i],mid=(y0+y1)/2,[a,b]=segment(mid),slope=(b[0]-a[0])/(b[1]-a[1]);
  const tangent=(y:number)=>{const r=angle(y),c=Math.cos(r),s=Math.sin(r);return [c*slope-s,s*slope+c];};
  const v0=tangent(y0),vm=tangent(mid),v1=tangent(y1),last=centers[i-1],step=(y1-y0)/6;
  centers.push([last[0]+step*(v0[0]+4*vm[0]+v1[0]),last[1]+step*(v0[1]+4*vm[1]+v1[1])]);
 }
 const anchor=transform(first,joints[0] as [number,number]),sample=centers[ys.indexOf(joints[0][1])],offset=[anchor[0]-sample[0],anchor[1]-sample[1]];
 return ([x,y])=>{
  let low=0,high=ys.length-1;while(high-low>1){const mid=(low+high)>>1;if(ys[mid]>y)high=mid;else low=mid;}
  const t=(y-ys[low])/(ys[high]-ys[low]),a=centers[low],b=centers[high],r=angle(y),cross=x-centerX(y);
  return [a[0]+(b[0]-a[0])*t+offset[0]+Math.cos(r)*cross,a[1]+(b[1]-a[1])*t+offset[1]+Math.sin(r)*cross];
 };
}
export function anatomyArmVertex(side:'L'|'R',point:RigPoint,matrices:ReadonlyMap<string,RigMatrix>):[number,number]{
 let skins=armSkins.get(matrices);if(!skins){skins={};armSkins.set(matrices,skins);}
 return (skins[side]??=createArmSkin(side,matrices))(point);
}
