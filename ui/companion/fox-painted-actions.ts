import {paintedPose,createPaintedIdle} from './fox-painted-idle.ts';
import type {PaintedPose} from './fox-painted-idle.ts';
import {createPoseTransition} from './fox-pose-transition.ts';
import {foxPortraitRegistration,drawRegisteredFox} from './fox-portrait-registration.ts';
import {smooth as ease} from './fox-skeleton.ts';

/** Seated gestures, not invented hidden limbs or a replacement character. */
export function paintedAction(state:string,elapsed:number,now:number,reduced=false):PaintedPose {
 const p={...paintedPose(now,reduced),lean:0,shoulders:0,nod:0,pawL:0,pawR:0};
 const t=reduced?0:elapsed/1000,s=(speed:number,phase=0)=>reduced?0:Math.sin(t*speed+phase);
 if(!reduced){p.lean=.30*Math.sin(now/3100);p.shoulders=.18*Math.sin(now/1700);}
 switch(state){
  case 'looking': case 'searching':p.look=.8+.7*s(1.6);p.lean=.6*s(1.6);p.shoulders=.22;p.earR=.25;break;
  case 'listening':case 'writing':p.look=.8;p.lean=.65;p.shoulders=.28;p.earL=.3;break;
  case 'thinking':case 'preparing':case 'transcribing':p.look=-.7;p.lean=-.5;p.nod=-.35;p.earR=.2+.15*s(2);break;
  case 'reading':p.look=-.25+.25*s(1.2);p.nod=.8;p.lean=-.25;p.shoulders=-.2;p.pawL=.2;break;
  case 'drafting':case 'working':p.nod=.5+.12*s(3);p.lean=.22*s(2);p.shoulders=.3+.15*s(4);p.pawL=.45+.4*s(7);p.pawR=.45+.4*s(7,Math.PI);break;
  case 'talking':p.nod=.35*s(5);p.lean=.4*s(2);p.shoulders=.22*s(4);p.pawR=.3+.25*s(3);break;
  case 'happy':case 'satisfied':p.nod=-.25+.4*s(4);p.shoulders=.6+.4*s(4);p.tail=1.3*s(5);p.lean=.6*s(2);break;
  case 'waving':p.lean=-.6;p.shoulders=.4;p.pawR=.8+.6*s(5);p.earL=.3;p.tail=s(3);break;
  case 'stretching':{const stretch=reduced?1:Math.sin(Math.PI*ease((elapsed%4000)/4000));p.shoulders=1.8*stretch;p.nod=-stretch;p.lean=.4*stretch;p.pawL=p.pawR=.5*stretch;p.blink=.7*stretch;break;}
  case 'yawning':p.shoulders=.8+.6*s(1.7);p.nod=-.5;p.blink=.8;p.lean=-.2;break;
  case 'drowsy':p.nod=.7;p.blink=.65;p.shoulders=-.35;break;
  case 'sleeping':p.nod=1;p.blink=1;p.shoulders=-.6;p.look=0;p.lean=0;p.sniff=p.earL=p.earR=0;p.tail=0;break;
  case 'surprised':p.shoulders=.8;p.nod=-.6;p.earL=p.earR=.6;break;
  case 'confused':case 'concerned':p.lean=-.5;p.look=-.8;p.nod=.25;break;
 }
 return p;
}

export async function loadPaintedFox(sources:{original:string;half:string;closed:string}){
 const surface=document.createElement('canvas');surface.width=640;surface.height=640;
 const rig=await createPaintedIdle(surface,[sources.original,sources.half,sources.closed]);
 const transition=createPoseTransition(paintedAction);
 let lost=false;const onLost=(event:Event)=>{event.preventDefault();lost=true;};
 surface.addEventListener('webglcontextlost',onLost);
 // Keep a painted fallback, not a blank companion, if the GPU context is lost.
 const original=await new Promise<HTMLImageElement>((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=reject;img.src=sources.original;});
 const registration=foxPortraitRegistration(original);
 return {draw(ctx:CanvasRenderingContext2D,state:string,elapsed:number,now:number,reduced:boolean){
  const pose=transition.sample(state,elapsed,now,reduced);if(!lost)rig.draw(now,reduced,pose);
  drawRegisteredFox(ctx,lost?original:surface,registration);
  return {key:'painted-v1:'+state,sheet:'painted',frame:0};
 },dispose(){surface.removeEventListener('webglcontextlost',onLost);rig.dispose();surface.width=surface.height=1;}};
}
