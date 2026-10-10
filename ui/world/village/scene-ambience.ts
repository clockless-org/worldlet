import {Container,Graphics,Sprite,Texture} from 'pixi.js';
import type {SceneMotion} from '../../themes/index.ts';
import {WORLD_WIDTH,WORLD_HEIGHT} from '../world-design.ts';

/** Authored atmosphere is clipped to the part of the painting it belongs to.
 * One small texture serves all soft glows; no blur filter or per-frame texture uploads. */
export function createSceneAmbience(parent:Container,specs:SceneMotion[]=[],size={width:WORLD_WIDTH,height:WORLD_HEIGHT}){
 const canvas=document.createElement('canvas');canvas.width=canvas.height=64;
 const context=canvas.getContext('2d')!,gradient=context.createRadialGradient(32,32,0,32,32,32);
 gradient.addColorStop(0,'#ffffff');gradient.addColorStop(.18,'#ffffff99');gradient.addColorStop(1,'#ffffff00');
 context.fillStyle=gradient;context.fillRect(0,0,64,64);const glow=Texture.from(canvas);
 // A soft, irregular wisp, drawn once. Wide overlapping gradients avoid rows of round fog dots.
 let mist:Texture|undefined;
 if(specs.some(s=>s.kind==='mist')){
  const c=document.createElement('canvas');c.width=256;c.height=128;const ctx=c.getContext('2d')!;
  for(let i=0;i<14;i++){const x=30+i*15,y=64+Math.sin(i*2.3)*13,r=25+12*Math.sin(i*1.9)**2,g=ctx.createRadialGradient(x,y,0,x,y,r);
   g.addColorStop(0,'#ffffff32');g.addColorStop(.45,'#ffffff18');g.addColorStop(1,'#ffffff00');ctx.fillStyle=g;ctx.fillRect(x-r,y-r,r*2,r*2);
  }mist=Texture.from(c);
 }
 const layer=new Container();layer.eventMode='none';layer.zIndex=30;parent.addChild(layer);
 const fields=specs.map(spec=>{
  const [nx,ny,nw,nh]=spec.bounds,x=nx*size.width,y=ny*size.height,w=nw*size.width,h=nh*size.height;
  const group=new Container(),mask=new Graphics();
  if(spec.clip)mask.poly(spec.clip.flatMap(([u,v])=>[x+u*w,y+v*h]));else mask.rect(x,y,w,h);
  mask.fill(0xffffff);group.eventMode=mask.eventMode='none';group.mask=mask;layer.addChild(group,mask);
  const seed=[...spec.id].reduce((n,c)=>n*31+c.charCodeAt(0),7)>>>0;
  const random=(i:number)=>{const v=Math.sin(seed+i*127.1)*43758.5453;return v-Math.floor(v);};
  const count=spec.kind==='light'?1:spec.count??12;
  const parts=Array.from({length:count},(_,i)=>{
   const paint=spec.kind==='ripples'?new Graphics().roundRect(-12,-.5,24,1,1).fill(spec.color):new Sprite(spec.kind==='mist'?mist:glow);
   if(paint instanceof Sprite){paint.anchor.set(.5);paint.tint=spec.color;const size=spec.kind==='mist'?w*.85:spec.kind==='light'?w:spec.kind==='dust'?3:spec.kind==='stars'?5:7;paint.width=size;paint.height=spec.kind==='mist'?h*.55:spec.kind==='light'?h:size;}
   paint.eventMode='none';group.addChild(paint);return {paint,u:random(i*4),v:random(i*4+1),phase:random(i*4+2)*Math.PI*2,speed:.025+random(i*4+3)*.025};
  });
  return {spec,x,y,w,h,group,parts};
 });
 let phase=0,lastTime:number|undefined,active=false,night=0;
 return {
  update(time:number,enabled:boolean,nightAmount=0){
   const delta=lastTime===undefined?0:Math.max(0,Math.min(.1,time-lastTime));lastTime=time;
   night=Math.max(0,Math.min(1,nightAmount));
   active=enabled&&fields.length>0;layer.visible=active;if(!active)return;phase+=delta;time=phase;
   for(const f of fields)for(const p of f.parts){
    const t=time*p.speed,beat=.5+.5*Math.sin(time*.75+p.phase);let u=p.u,v=p.v,alpha=.12;
    switch(f.spec.kind){
     case 'light':u=v=.5;alpha=.06+.035*Math.sin(time*1.7+p.phase)+.015*Math.sin(time*3.1+p.phase*1.7);break;
     case 'dust':u=(p.u+t*.12)%1;v=1-(p.v+t*.3)%1;alpha=.08+.15*beat;break;
     case 'motes':u+=Math.sin(t*3+p.phase)*.055;v+=Math.cos(t*2+p.phase)*.07;alpha=.15+.35*Math.pow(beat,3);break;
     case 'stars':alpha=.08+.22*Math.pow(beat,4);break;
     case 'ripples':u+=Math.sin(t*2+p.phase)*.018;p.paint.scale.x=.7+.45*beat;alpha=.08+.16*beat;break;
     case 'mist':u=(p.u+t*.18)%1;v+=Math.sin(t+p.phase)*.045;alpha=.32*Math.sin(u*Math.PI)**2*(.7+.3*beat);break;
    }
    p.paint.position.set(f.x+u*f.w,f.y+v*f.h);p.paint.alpha=alpha*(f.spec.strength??1)*(f.spec.lighting==='night'?night:f.spec.lighting==='day'?1-night:1);
   }
  },
  get metrics(){return {active,phase,fields:specs.map(s=>s.id),particles:fields.reduce((n,f)=>n+f.parts.length,0),layers:fields.map(f=>({id:f.spec.id,kind:f.spec.kind,bounds:f.spec.bounds,clipped:!!f.spec.clip,light:f.spec.lighting==='night'?night:f.spec.lighting==='day'?1-night:1}))};},
  destroy(retireTexture?:(texture:Texture)=>void){layer.destroy({children:true});for(const t of [glow,mist])if(t){if(retireTexture)retireTexture(t);else t.destroy(true);}}
 };
}
