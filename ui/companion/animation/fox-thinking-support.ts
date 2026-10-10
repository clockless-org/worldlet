import type {AnatomyPose} from './fox-anatomy.ts';
import {seatedSupportPose,plantForepaws} from './fox-seated-support.ts';
import {smootherUnit as ease} from './fox-skeleton.ts';

/** A supported chin-rest: torso and contacting arm share one parent, so the
 * breathing phrase cannot slide the hand relative to the face. The free right
 * forepaw and hind soles carry the seated weight rather than drifting with it. */
export function thinkingSupport(pose:AnatomyPose,t:number,reduced=false,sustained=false):AnatomyPose{
 if(!Number.isFinite(t)||t<0)throw Error('Invalid thinking support time');
 const time=reduced?2600:t,active=ease(time/900)*(sustained?1:1-ease((time-7300)/1700));
 const breath=reduced?0:active*ease((time-1700)/700)*Math.sin((time-1700)/1800);
 return plantForepaws({...pose,...seatedSupportPose(.35*active+.07*breath),
  chest:{angle:2.8*active+.45*breath,x:.008*active+.002*breath,y:.008*active+.007*breath},
  scarfTail:{angle:-1.5*active-.7*breath}
 },['R']);
}
