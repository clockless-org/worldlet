import type {RigPoint} from './fox-anatomy.ts';
import definition from '../../../resources/styles/builtin/drafts/fox-states-v1/reading-rig.json' with {type:'json'};
/** Orthographic projection of a hinged cover, not a shrinking whole sprite.
 * The book translates toward the supporting paw while its left cover closes.
 * Keep the spine and right cover rigid; cloth has no directional lettering. */
export function readingBookFold([x,y]:RigPoint,closure=0):RigPoint{
 if(!Number.isFinite(closure)||closure<0||closure>1)throw Error('Invalid book closure');
 const {scale,offset}=definition.bookRegistration,fold=definition.closing,hinge=offset[0]+fold.sourceHingeX*scale;
 const dx=x-hinge,left=dx<0,angle=Math.PI*closure;
 return [hinge+dx*(left?Math.cos(angle):1)+fold.translationX*closure,y-(left?fold.coverLift*Math.sin(angle)*(-dx/fold.coverSpan):0)];
}

/** Turn the closed volume, then pitch it onto the lap. Projection changes the
 * visible depth, not the book's model dimensions or the Fox's proportions. */
export function readingBookPlacement([x,y]:RigPoint,placement=0):RigPoint{
 if(!Number.isFinite(placement)||placement<0||placement>1)throw Error('Invalid book placement');
 if(!placement)return [x,y];
 const d=definition.placement,[px,py]=d.pivot,angle=d.angle*Math.PI/180*placement,pitch=d.pitch*Math.PI/180*placement;
 const dx=x-px,dy=y-py;
 return [px+Math.cos(angle)*dx-Math.sin(angle)*dy+d.translation[0]*placement,
  py+(Math.sin(angle)*dx+Math.cos(angle)*dy)*Math.cos(pitch)+d.translation[1]*placement];
}
