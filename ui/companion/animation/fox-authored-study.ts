import {paintedVertex,paintedPose} from './fox-painted-idle.ts';
import type {PaintedPose} from './fox-painted-idle.ts';
import {greetingBodyVertex} from './fox-greeting-study.ts';
import {smooth} from './fox-skeleton.ts';
export const AUTHORED_STUDY_STATES=['thinking','reading','drafting','greeting','explaining','working'] as const;
export type AuthoredStudyState=typeof AUTHORED_STUDY_STATES[number];
const bell=(v:number,c:number,w:number)=>Math.exp(-(((v-c)/w)**2));
/** Study-only pose-specific control map. Art/entrance/exit acceptance is still pending. */
export function authoredStudyPose(state:AuthoredStudyState,ms:number,reduced=false):PaintedPose{
 const p={...paintedPose(ms,reduced),lean:0,shoulders:0,nod:0,pawL:0,pawR:0};
 if(reduced)return p;
 const t=ms/1000;
 p.lean=.16*Math.sin(t*1.1);p.shoulders=.12*Math.sin(t*1.3-.4);
 if(state==='thinking'){p.look=-.5+.12*Math.sin(t*.7);p.nod=-.1;p.pawL=.1*Math.sin(t*.8);}
 if(state==='reading'){p.look=.35*Math.sin(t*1.2);p.nod=.2;p.pawL=.12*Math.sin(t*.9);}
 if(state==='drafting'){
  // A burst, reread pause and next burst, not mechanical endless typing.
  const phase=t%8,write=smooth(phase/.4)*(1-smooth((phase-3.2)/.4))+smooth((phase-5)/.4)*(1-smooth((phase-7.5)/.5));
  p.look=-.15;p.nod=.22;p.pawL=write*(Math.sin(t*11)*.7+Math.sin(t*19)*.15);
 }
 if(state==='greeting'){
  const wave=smooth(t/.25)*(1-smooth((t-1.7)/.7));
  p.look=.2;p.lean=-.3*wave;p.pawR=wave*Math.sin(t*8);p.tail=.6*wave*Math.sin(t*3-.4);
 }
 if(state==='explaining'){
  const phrase=(t%7),offer=smooth(phrase/.6)*(1-smooth((phrase-2.4)/.9));
  p.look=.2;p.lean=.25*offer;p.nod=.12*Math.sin(t*3)*offer;p.pawR=.65*offer;p.pawL=.15*Math.sin(t*2)*offer;
 }
 if(state==='working'){
  const phase=t%7,burst=smooth(phase/.35)*(1-smooth((phase-4)/.5));
  p.nod=.12*burst;p.look=-.2;p.pawL=burst*Math.sin(t*13)*.55;p.pawR=burst*Math.sin(t*11+1.2)*.55;
 }
 return p;
}
export function authoredStudyVertex(state:AuthoredStudyState,u:number,v:number,p:PaintedPose):[number,number]{
 if(state==='greeting')return greetingBodyVertex(u,v,p);
 // The raised hands are not the original floor paws; do not animate the hind feet.
 const [x,y]=paintedVertex(u,v,{...p,pawL:0,pawR:0});
 if(state==='thinking'){
  const hand=bell(u,.55,.075)*bell(v,.55,.09),headY=(p.nod||0)*.010;
  return [x+(p.pawL||0)*.003*hand,y+headY*hand];
 }
 if(state==='reading'){
  // Move the book and both grasp points together, not independently waving hands.
  const grasp=bell(u,.64,.23)*bell(v,.73,.16);
  return [x+(p.pawL||0)*.008*grasp,y-(p.pawL||0)*.004*grasp];
 }
 if(state==='explaining'){
  const hand=bell(u,.87,.12)*bell(v,.665,.09),chest=bell(u,.58,.09)*bell(v,.68,.1);
  return [x+(p.pawR||0)*.009*hand,y-(p.pawR||0)*.012*hand-(p.pawL||0)*.003*chest];
 }
 if(state==='working'){
  const left=bell(u,.48,.05)*bell(v,.775,.034),right=bell(u,.822,.025)*bell(v,.785,.045);
  // Keyboard contact is a short press; laptop screen remains stationary.
  return [x,y+(p.pawL||0)*.004*left+(p.pawR||0)*.004*right];
 }
 const pencil=bell(u,.53,.08)*bell(v,.695,.105);
 return [x+(p.pawL||0)*.006*pencil,y+(p.pawL||0)*.002*pencil];
}
