import type {AnatomyPose} from './fox-anatomy.ts';
import {seatedSupportPose} from './fox-seated-support.ts';

/** Open the chest with the offering palm, then follow authored phrase accents.
 * No independent rocking loop: shoulders, hands and rigid head share one frame,
 * while the seated hind soles carry the weight. */
export function explainingSupport(pose:AnatomyPose,offer:number,beat:number):AnatomyPose{
 return {...pose,...seatedSupportPose(.26*offer+.08*beat),
  chest:{angle:-1.5*offer-.7*beat,x:-.004*offer-.002*beat,y:-.009*offer+.004*beat},
  scarfTail:{angle:1.1*offer+.6*beat}
 };
}
