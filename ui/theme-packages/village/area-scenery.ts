import {Container,Graphics,Rectangle,Sprite,Texture} from 'pixi.js';
import {WORLD_WIDTH,WORLD_HEIGHT} from './space/world-design.ts';
import {createAppletEnchantments} from './applet-idle-motion.ts';
import {createSceneAmbience} from './scene-ambience.ts';
import {attachAppletLamp} from './village-lamp.ts';

/** Reframe the painted support surface; only its independent instruments tighten horizontally. */
function areaFrame(spec,width:number,height:number){
 const compact=width<=1100||width/height<1.2||height<650;
 let scale=Math.max(width/WORLD_WIDTH,height/WORLD_HEIGHT),x=(width-WORLD_WIDTH*scale)/2,y=(height-WORLD_HEIGHT*scale)/2;
 let slots=spec.slots;
 if(compact&&slots.length){
  const floor=slots.reduce((n,s)=>n+s.anchor[1],0)/slots.length,target=height*.45;
  // Keep the entire window painted while placing the tabletop above the companion lane.
  scale=Math.max(scale,target/(floor*WORLD_HEIGHT),(height-target)/((1-floor)*WORLD_HEIGHT));
  x=(width-WORLD_WIDTH*scale)/2;y=target-floor*WORLD_HEIGHT*scale;
  const left=Math.min(...slots.map(s=>s.anchor[0]-s.maxSize[0]/2)),right=Math.max(...slots.map(s=>s.anchor[0]+s.maxSize[0]/2));
  const compression=Math.min(1,(width-48)/((right-left)*WORLD_WIDTH*scale)),centre=(left+right)/2;
  const middle=(width/2-x)/(WORLD_WIDTH*scale);
  slots=slots.map(s=>({...s,anchor:[middle+(s.anchor[0]-centre)*compression,s.anchor[1]],maxSize:[s.maxSize[0]*compression,Math.min(s.maxSize[1],Math.min(height*.22,Math.max(80,target-156))/(WORLD_HEIGHT*scale))]}));
 }
 const positions=slots.map(s=>s.anchor[0]*WORLD_WIDTH*scale).sort((a,b)=>a-b);
 const labelWidth=Math.min(180,...positions.slice(1).map((p,i)=>p-positions[i]-8));
 return {compact,scale,x,y,slots,labelWidth};
}

/** A separate authored close view; slots still address the World assignments, never new Applet data. */
export async function createAreaScenery(payload,image){
 const layer=new Container(),views=new Map<string,any>(),cropped:Texture[]=[];
 let selected:any=null;
 for(const [id,spec] of Object.entries<any>(payload.areaViews||{})){
  const texture=await image(spec.image);if(!texture)continue;
  const group=new Container();group.sortableChildren=true;group.visible=false;
  const plate=new Sprite(texture);plate.width=WORLD_WIDTH;plate.height=WORLD_HEIGHT;plate.eventMode='static';
  // Bare scenery inside an Area is not Back.
  plate.on('pointertap',event=>event.stopPropagation());group.addChild(plate);
  for(const [x,y,w,h] of spec.occlusion||[]){
   const front=new Sprite(texture),mask=new Graphics().rect(x*WORLD_WIDTH,y*WORLD_HEIGHT,w*WORLD_WIDTH,h*WORLD_HEIGHT).fill(0xffffff);
   front.width=WORLD_WIDTH;front.height=WORLD_HEIGHT;front.eventMode=mask.eventMode='none';front.zIndex=mask.zIndex=5000;front.mask=mask;group.addChild(front,mask);
  }
  const textures:Record<string,Texture>={};
  for(const [key,src] of Object.entries(spec.devices||{})){const t=await image(src);if(t)textures[key]=t;}
  const ambience=createSceneAmbience(group,spec.ambience);layer.addChild(group);views.set(id,{id,spec,group,textures,ambience});
 }
 return {layer,
  update(id:string|null,width:number,height:number,amount:number,time:number,animate:boolean){
   const next=id?views.get(id):null;
   if(next!==selected){selected=next;if(selected)selected.group.alpha=0;}
   layer.visible=!!selected;
   for(const v of views.values()){v.group.visible=v===selected;v.ambience.update(time,animate&&v===selected);}
   if(!selected)return null;
   const size=width+':'+height;
   if(selected.size!==size){selected.size=size;selected.frame=areaFrame(selected.spec,width,height);}
   const {scale,x,y,slots,compact}=selected.frame;selected.slots=slots;selected.compact=compact;
   selected.group.scale.set(scale);selected.group.position.set(x,y);
   selected.group.alpha+=(1-selected.group.alpha)*amount;
   if(selected.group.alpha>.995)selected.group.alpha=1;
   return selected;
  },
  visual(d,view){
   const cache=d.closeVisuals??=new Map();if(cache.has(view.id))return cache.get(view.id);
   const key=d.room.art||d.room.key,texture=view.textures[key]||d.sprite.texture;
   const box=view.spec.deviceBoxes[key]||d.room.device?.box;
   const [l,t,r,b]=box||[0,0,texture.width-1,texture.height-1];
   const cut=new Texture({source:texture.source,frame:new Rectangle(l,t,r-l+1,b-t+1)});cropped.push(cut);
   const body=new Container(),sprite=new Sprite(cut);sprite.anchor.set(.5,1);sprite.width=200;sprite.height=200*cut.height/cut.width;
   const shadow=new Graphics().ellipse(0,-1,sprite.width*.34,4).fill({color:0x24170e,alpha:.27}).ellipse(0,-.5,sprite.width*.21,1.5).fill({color:0x170f09,alpha:.4});
   shadow.eventMode='none';body.addChild(shadow,sprite);d.root.addChild(body);
   const effects=view.textures[key]?view.spec.deviceEffects?.[key]:{lamp:d.room.device?.lamp};
   const enchantment=createAppletEnchantments(sprite,d.room.key,effects?.idle),lamp=attachAppletLamp(sprite,effects?.lamp);
   const hit=new Rectangle(-sprite.width/2,-sprite.height,sprite.width,sprite.height);
   const visual={body,sprite,enchantment,lamp,hit,width:sprite.width,height:sprite.height};cache.set(view.id,visual);return visual;
  },
  get active(){return selected;},
  get metrics(){return selected?{id:selected.id,authored:true,compact:selected.compact,settled:selected.group.alpha===1,slots:selected.spec.slots.length,ambience:selected.ambience.metrics}:null;},
  destroy(){for(const view of views.values())view.ambience.destroy();for(const texture of cropped)texture.destroy(false);}
 };
}
