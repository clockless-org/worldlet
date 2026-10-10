import definition from '../../../resources/styles/builtin/drafts/fox-states-v1/drafting-release-rig.json' with {type:'json'};
import type {RigPoint} from './fox-anatomy.ts';
/** Restore the independently painted pencil to the held atlas coordinates.
 * Both endpoints constrain one rotation/uniform scale, never a warped shaft. */
export function draftingPencilPoint([x,y]:RigPoint):RigPoint{
 const a=definition.sourceEraser,b=definition.sourceTip,p=definition.bindEraser,q=definition.bindTip;
 const sx=b[0]-a[0],sy=b[1]-a[1],tx=q[0]-p[0],ty=q[1]-p[1],den=sx*sx+sy*sy;
 const c=(tx*sx+ty*sy)/den,s=(ty*sx-tx*sy)/den;
 return [p[0]+c*(x-a[0])-s*(y-a[1]),p[1]+s*(x-a[0])+c*(y-a[1])];
}
