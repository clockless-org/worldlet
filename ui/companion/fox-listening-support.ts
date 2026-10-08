import type {AnatomyPose} from './fox-anatomy.ts';
import {seatedSupportPose,plantForepaws} from './fox-seated-support.ts';
import {smoother as ease} from './fox-skeleton.ts';

/** Ears lead, then a quiet attentive chest lift. All four paws retain their
 * support; breathing is continuous elapsed time, not a repeating entry nod. */
export function listeningSupport(pose:AnatomyPose,t:number,reduced=false,sustained=false):AnatomyPose{
 if(!Number.isFinite(t)||t<0)throw Error('Invalid listening support time');
 const time=reduced?2600:t,active=ease((time-180)/1100)*(sustained?1:1-ease((time-6600)/1400));
 const breath=reduced?0:active*ease((time-1700)/700)*Math.sin((time-1700)/1900);
 return plantForepaws({...pose,...seatedSupportPose(.18*active+.045*breath),
  chest:{angle:1.1*active+.3*breath,x:.004*active,y:-.009*active+.0065*breath},
  scarfTail:{angle:-.7*active-.65*breath}
 },['L','R']);
}
