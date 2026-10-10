import {Graphics,type Sprite} from 'pixi.js';
import type {DeviceEffects} from './village-pack.ts';
import {deviceFeature} from './device-feature.ts';

/** Decorative accents follow registered painted features, independently of runtime lamps. */
export function createAppletEnchantments(sprite:Sprite,key:string,spec?:DeviceEffects['idle']){
 if(!spec)return null;
 const ink=new Graphics();ink.eventMode='none';sprite.addChild(ink);
 const {x,y,rx,ry}=deviceFeature(sprite,spec),unit=sprite.texture.source.width*.003;
 const seed=[...key].reduce((n,c)=>n+c.charCodeAt(0),0)%31/5,color=Number.parseInt(spec.color.slice(1),16);
 let phase=0,active=false;
 const star=(sx:number,sy:number,r:number,alpha:number)=>ink.moveTo(sx-r,sy).lineTo(sx+r,sy).moveTo(sx,sy-r).lineTo(sx,sy+r).stroke({width:unit,color,alpha});
 return {update(time:number,enabled:boolean){
  active=enabled;ink.visible=enabled;if(!enabled)return;
  phase=time+seed;ink.clear();
  if(spec.kind==='orbit'){
   // Only a travelling reflection: the photograph already contains the brass rings.
   star(x+Math.cos(phase*.65)*rx,y+Math.sin(phase*.65)*ry,unit*2,.75);
  }else if(spec.kind==='bubbles'){
   for(let i=0;i<3;i++){const age=(phase*.25+i/3)%1;ink.circle(x+Math.sin(i*2+phase*.4)*rx*.65,y+ry*(.6-age*1.2),rx*(.05+age*.07)).stroke({width:unit,color,alpha:(1-age)*.65});}
  }else if(spec.kind==='writing'){
   const at=Math.sin(phase*.8)*rx*.7;
   ink.moveTo(x-rx,y).quadraticCurveTo(x+at,y-ry,x+rx,y+ry*.2).stroke({width:unit,color,alpha:.2+.15*Math.sin(phase)});
   star(x+at,y-ry*.2,unit*1.5,.5);
  }else if(spec.kind==='glow'){
   const pulse=.5+.5*Math.sin(phase*1.1);
   for(let i=8;i>0;i--)ink.ellipse(x,y,rx*i/8,ry*i/8).fill({color,alpha:(.002+.009*pulse)*(1-i/9)});
   star(x+Math.sin(phase*.5)*rx*.6,y+Math.cos(phase*.7)*ry*.6,unit*(1+pulse),.2+.4*pulse);
  }else{
   const pulse=Math.pow(Math.max(0,Math.sin(phase*.65)),6);
   star(x,y,unit*(1+2*pulse),.6*pulse);
  }
 },get metrics(){const p=sprite.toGlobal({x,y});return {family:key,kind:spec.kind,active,phase,center:{x:p.x,y:p.y}};}};
}
