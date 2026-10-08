import {searchingStudy} from './fox-searching-study.ts';
import type {AnatomyPose,JointControl} from './fox-anatomy.ts';
import type {GraspControls} from './fox-grasp-study.ts';
import {smootherUnit as ease} from './fox-skeleton.ts';

/** Contact/ownership review, not another semantic state. The prop exists at
 * its dock before and after searching; it never uses an opacity arrival.
 * Finger closure occurs only during the stationary contact dwells; semantic
 * handoff remains separate acceptance work. */
export function searchPickupStudy(milliseconds:number,reduced=false){
 if(!Number.isFinite(milliseconds)||milliseconds<0)throw Error('Invalid search pickup time');
 const t=reduced?5000:Math.min(milliseconds,12000),contactTime=650;
 let sourceTime:number;
 if(t<900)sourceTime=contactTime*ease(t/900);
 else if(t<1300)sourceTime=contactTime;
 else if(t<2300)sourceTime=contactTime+(1100-contactTime)*ease((t-1300)/1000);
 else if(t<9300)sourceTime=1100+6500*ease((t-2300)/7000);
 else if(t<10300)sourceTime=7600;
 else if(t<10700)sourceTime=contactTime;
 else sourceTime=contactTime*(1-ease((t-10700)/1300));
 let frame=searchingStudy(sourceTime,reduced);
 if(t>=9300&&t<10300){
  const dock=searchingStudy(contactTime),weight=ease((t-9300)/1000),pose:Record<string,JointControl>={};
  for(const id of new Set([...Object.keys(frame.pose),...Object.keys(dock.pose)])){
   const c:JointControl={};for(const key of ['angle','x','y','closure'] as const){const a=frame.pose[id]?.[key]??0,b=dock.pose[id]?.[key]??0;c[key]=a+(b-a)*weight;}pose[id]=c;
  }
  frame={...frame,pose:pose as AnatomyPose,gazeDown:frame.gazeDown+(dock.gazeDown-frame.gazeDown)*weight};
 }
 const attached=t>=1300&&t<=10300;
 const magnifierPose=attached?frame.pose:searchingStudy(contactTime).pose;
 const curl=ease((t-900)/400)*(1-ease((t-10300)/400));
 // Fingers wrap first, then the thumb opposes them. Reverse that ordering on
 // release, while the hand and handle remain stationary at the cradle.
 const graspR:GraspControls={index:curl,middle:curl,outer:curl,thumb:ease((t-980)/320)*(1-ease((t-10300)/300))};
 return {...frame,magnifier:1,magnifierPose,attached,graspR};
}
