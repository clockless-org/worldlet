import definition from '../../resources/styles/builtin/drafts/fox-states-v1/drafting-rig.json' with {type:'json'};
import type {RigPoint} from './fox-anatomy.ts';

/** Pixel-space similarity, not independent normalized x/y scaling: the source
 * atlas is rectangular and stretching it would distort the paw and pencil. */
export function draftingPaperPoint(p:RigPoint):RigPoint{
 return [definition.paper.offset[0]+p[0]*definition.paper.scale,definition.paper.offset[1]+p[1]*definition.paper.scale];
}
export function draftingArmPoint(side:'writing'|'support',point:RigPoint):RigPoint{
 const part=definition[side],a=part.shoulder;
 const b=side==='writing'?definition.writing.tip:definition.support.grip;
 const p=part.targetShoulder,contact=side==='writing'?definition.paper.contact:definition.support.paperGrip,q=draftingPaperPoint([contact[0],contact[1]]);
 const sx=b[0]-a[0],sy=b[1]-a[1],tx=q[0]-p[0],ty=q[1]-p[1],den=sx*sx+sy*sy;
 const c=(tx*sx+ty*sy)/den,s=(ty*sx-tx*sy)/den;
 return [p[0]+c*(point[0]-a[0])-s*(point[1]-a[1]),p[1]+s*(point[0]-a[0])+c*(point[1]-a[1])];
}
