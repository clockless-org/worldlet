import type {AnatomyPose} from './fox-anatomy.ts';
import {seatedSupportPose,plantForepaws} from './fox-seated-support.ts';
import {smootherUnit as ease,pulse as phrase} from './fox-skeleton.ts';


/** Quiet seated life, not a fabricated task or a repeating full-body bounce.
 * Chest inhalation is quicker than exhalation; occasional haunch adjustment
 * has its own slower phrase. Rigid head follows the chest, all paws stay down. */
export function idleSupport(pose:AnatomyPose,elapsed:number,reduced=false):AnatomyPose{
 if(!Number.isFinite(elapsed)||elapsed<0)throw Error('Invalid idle support time');
 if(reduced)return pose;
 const entry=ease(elapsed/900);
 const breath=entry*phrase(elapsed%4800,0,1600,1900,4800);
 // Establish body life in the first few seconds, before a brief glance away.
 // Keep the long quiet recovery instead of repeatedly rocking the whole Fox.
 const settle=entry*phrase(elapsed%17800,2400,1800,6100,8500);
 const recover=entry*phrase(elapsed%17800,7000,1000,8700,11000);
 // Author at the actual 144px portrait size: the previous .008 rise was
 // only one screen pixel. Keep the root/soles fixed; move the upper torso
 // through the shared body field rather than scaling the entire character.
 const follow=entry*phrase(elapsed%4800,180,1700,2100,4800);
 return plantForepaws({...pose,...seatedSupportPose(.10*breath+.78*settle+.12*recover),
  chest:{angle:.9*breath+3.8*settle-1.1*recover,x:.002*breath+.026*settle-.008*recover,y:-.024*breath+.014*settle-.003*recover},
  head:{...pose.head,angle:(pose.head?.angle??0)-.45*breath-2.2*settle+.6*recover},
  scarfTail:{angle:-1.3*follow+2.5*settle-1.1*recover},
 },['L','R']);
}
