import type {RigPoint} from './fox-anatomy.ts';
import {smooth} from './fox-skeleton.ts';
type Map=(p:RigPoint,segment:'upper'|'forearm'|'paw')=>RigPoint;
function turn(a:RigPoint,b:RigPoint,c:RigPoint,w:number):RigPoint{
 if(w===0)return a;if(w===1)return b;
 const x=a[0]-c[0],y=a[1]-c[1],u=b[0]-c[0],v=b[1]-c[1],r=Math.atan2(x*v-y*u,x*u+y*v)*w;
 return [c[0]+Math.cos(r)*x-Math.sin(r)*y,c[1]+Math.sin(r)*x+Math.cos(r)*y];
}
/** Continuous painted sleeve and wrist, with rigid shoulder and distal paw. */
export function draftingWritingSkin(p:RigPoint,map:Map):RigPoint{
 const elbow=smooth((p[1]-795+p[0]-200+180)/360);
 const sleeve=turn(map(p,'upper'),map(p,'forearm'),map([200,795],'upper'),elbow);
 return turn(sleeve,map(p,'paw'),map([430,807],'forearm'),smooth((p[0]-280)/300));
}
