import type {RigPoint} from './fox-anatomy.ts';
type SegmentMap=(p:RigPoint,segment:'upper'|'forearm')=>RigPoint;
/** Local rotational skin across the elbow, not two overlapping cut edges.
 * Shoulder and distal paw remain rigid. The shared elbow is exactly pinned. */
export function draftingSupportSkin(p:RigPoint,map:SegmentMap):RigPoint{
 const v=(p[1]-800)-(p[0]-1380),t=Math.max(0,Math.min(1,(v+220)/440)),weight=t*t*(3-2*t);
 if(weight===0)return map(p,'upper');if(weight===1)return map(p,'forearm');
 const center=map([1380,800],'upper'),a=map(p,'upper'),b=map(p,'forearm');
 const ax=a[0]-center[0],ay=a[1]-center[1],bx=b[0]-center[0],by=b[1]-center[1];
 const angle=Math.atan2(ax*by-ay*bx,ax*bx+ay*by)*weight,c=Math.cos(angle),s=Math.sin(angle);
 return [center[0]+c*ax-s*ay,center[1]+s*ax+c*ay];
}
