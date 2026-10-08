import {smooth} from './fox-skeleton.ts';
export const FOX_ACTIONS=['idle','listening','thinking','reading','drafting','searching','working','talking','happy','waving','yawning','sleeping','stretching'] as const;
export function foxAction(state:string,elapsed:number,reduced=false){
 const t=reduced?0:Math.max(0,elapsed)/1000,breath=reduced?0:Math.sin(t*1.8);
 const p={head:0,headY:breath*.65,gaze:0,eyes:1,mouth:0,ears:0,tail:reduced?0:Math.sin(t*1.35-.6)*.035,
  body:breath*.7,leftX:137,leftY:296,rightX:185,rightY:296,book:0,laptop:0,lens:0,pen:0,page:0,lift:0};
 const blink=t%5.3;if(!reduced&&blink>4.9)p.eyes=1-Math.sin((blink-4.9)/.4*Math.PI);
 if(state==='blink')p.eyes=reduced?1:1-Math.sin(Math.min(t/.3,1)*Math.PI);
 if(['listening','writing','preparing'].includes(state)){p.head=.045;p.ears=-.06;}
 if(['thinking','transcribing','confused','concerned'].includes(state)){p.head=-.065;p.gaze=-3;p.rightX=209;p.rightY=198;p.ears=.04;}
 if(state==='reading'){
  p.book=1;p.head=.025;p.headY+=5;p.gaze=reduced?0:Math.sin(t*1.6)*4;
  p.leftX=112;p.leftY=266;p.rightX=204;p.rightY=265;
  const phase=t%5.6,flip=!reduced&&phase>4?Math.sin((phase-4)/1.6*Math.PI):0;
  p.rightX-=flip*29;p.rightY-=flip*12;p.page=flip;
 }
 if(state==='drafting'){
  p.book=1;p.pen=1;p.head=.07;p.headY+=6;p.gaze=2;
  p.leftX=113;p.leftY=268;p.rightX=183+(reduced?0:Math.sin(t*5)*6);p.rightY=247+(reduced?0:Math.sin(t*10)*2);
 }
 if(state==='searching'){
  const scan=reduced?0:Math.sin(t*1.6);p.lens=1;p.head=scan*.04;p.gaze=scan*4;
  p.rightX=242+scan*4;p.rightY=253+Math.cos(t*1.6)*3;p.leftX=132;p.leftY=287;
 }
 if(state==='working'){
  p.laptop=1;p.headY+=4;p.gaze=-2;
  p.leftX=132;p.rightX=186;p.leftY=260+(reduced?0:Math.sin(t*9)*3);p.rightY=260+(reduced?0:Math.sin(t*9+Math.PI)*3);
 }
 if(state==='talking'){p.mouth=reduced?0:.18+(.5+.5*Math.sin(t*10))*.2;p.head=reduced?0:Math.sin(t*2)*.02;}
 if(state==='looking'){p.head=reduced?0:Math.sin(t*1.5)*.06;p.gaze=reduced?0:Math.sin(t*1.5)*4;}
 if(state==='waving'){p.rightX=250+(reduced?0:Math.sin(t*6)*4);p.rightY=204;p.head=-.045;}
 if(state==='happy'||state==='satisfied'){
  const nod=reduced?0:Math.sin(Math.min(t/1.2,1)*Math.PI);p.headY-=nod*3;p.eyes=1-nod*.25;p.tail+=nod*.08;
 }
 if(state==='surprised'){p.eyes=1.1;p.mouth=.25;p.ears=-.1;}
 if(state==='drowsy'){p.eyes=.4;p.headY+=5;p.head=.04;}
 if(state==='yawning'){const y=reduced?.6:Math.sin(Math.min(t/3.4,1)*Math.PI);p.eyes=1-y*.95;p.mouth=y*.8;p.headY-=y*4;}
 if(state==='sleeping'||state==='sleepingBreath'){p.eyes=0;p.head=.08;p.headY+=15;p.body-=3;p.tail*=.2;}
 if(state==='stretching'){const a=reduced?.4:Math.sin(Math.min(t/2.6,1)*Math.PI);p.leftX-=a*35;p.rightX+=a*35;p.leftY-=a*58;p.rightY-=a*58;p.headY-=a*7;}
 return p;
}
export type FoxPose=ReturnType<typeof foxAction>;
export function mixFoxPose(from:FoxPose,to:FoxPose,progress:number):FoxPose{
 const k=smooth(progress),p={...to};for(const key of Object.keys(p))p[key]=from[key]+(to[key]-from[key])*k;return p;
}
/** Hold a continuous current pose across interruptions. Props share the same blend. */
export function foxAnimator(){
 let name='',from=foxAction('idle',0),pose={...from},changed=0;
 return {sample(state:string,elapsed:number,now:number,reduced=false){
  if(state!==name){name=state;from={...pose};changed=now;}
  pose=mixFoxPose(from,foxAction(state,elapsed,reduced),reduced?1:(now-changed)/480);return pose;
 }};
}
