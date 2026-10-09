import {Container,Graphics,Sprite} from 'pixi.js';
import {createSceneAmbience} from './scene-ambience.ts';
import {createRoomMailDelivery} from './room-mail-delivery.ts';

// Authored Applet plates sit behind live Open/Focus content and the Fox layer.
export async function createFocusScenery(payload,image,onBack){
 const layer=new Container(),mask=new Graphics(),plates=new Map();
 const reduced=matchMedia('(prefers-reduced-motion: reduce)');
 let maskWidth=0,maskHeight=0;
 let progress=0,last=performance.now(),current=null,previous=null,closed=false,content:null|{key:string;x:number;y:number;width:number;height:number}=null;
 layer.addChild(mask);layer.mask=mask;layer.visible=false;
 // Generated textures outlive renderer bindings and are released after renderer teardown.
 const pending=new Set<string>(),failed=new Set<string>(),retired:{destroy(destroySource:boolean):void}[]=[];
 async function load(key){
  const source=payload.focus?.[key];if(!source||pending.has(key)||plates.has(key)||failed.has(key)||closed)return;pending.add(key);
  try{

  let src=source.image;
  if(source.script){
   const script=document.createElement('script');script.src=source.script;
   try{await new Promise<void>((resolve,reject)=>{script.onload=()=>resolve();script.onerror=()=>reject(new Error('Focus asset unavailable'));document.head.append(script);});
    src=(globalThis as any).__WORLDLET_FOCUS_IMAGES__?.[key];
   }finally{script.remove();if((globalThis as any).__WORLDLET_FOCUS_IMAGES__)delete (globalThis as any).__WORLDLET_FOCUS_IMAGES__[key];}
  }
  if(!src)throw new Error('Focus image missing');
  const owned=source.framing==='scene-fit';
  const texture=await image(src,!owned);if(!texture||closed){if(owned)texture?.destroy(true);return;}
  const group=new Container(),plate=new Sprite(texture);group.addChild(plate);
  // Shared Applet navigation owns exposed-scenery clicks; the painting has no hit target.
  plate.eventMode='none';
  if(source.logo&&payload.logos?.[key]){
   const texture=await image(payload.logos[key]);if(!texture||closed)return;
   const logo=new Sprite(texture);logo.anchor.set(.5);logo.eventMode='none';
   logo.width=plate.texture.width*.055;logo.height=logo.width*texture.height/texture.width;
   logo.position.set(plate.texture.width*source.logo[0],plate.texture.height*source.logo[1]);group.addChild(logo);
  }
  const ambience=createSceneAmbience(group,source.ambience,{width:texture.width,height:texture.height});
  const delivery=source.delivery?createRoomMailDelivery(group,texture,source.delivery):null;
  group.visible=false;layer.addChild(group);plates.set(key,{group,plate,ambience,delivery,owned,ownedTexture:owned?texture:null});if(current===key)progress=0;
  // Keep at most three independently owned immersive plates decoded after navigation.
  for(const [oldKey,value] of plates){if([...plates.values()].filter(v=>v.owned).length<=3)break;if(oldKey===current||oldKey===previous||oldKey===key||!value.owned)continue;dispose(value);plates.delete(oldKey);}
  }catch(error){failed.add(key);console.warn('Focus scenery unavailable',key);}
  finally{pending.delete(key);}
 }
 function dispose(value){value.ambience.destroy(t=>t.destroy(true));value.delivery?.destroy();const texture=value.plate.texture;value.group.destroy({children:true});texture.destroy(true);}
 return {layer,get content(){return content;},get fading(){return layer.visible&&progress<1;},get metrics(){const value=plates.get(current);return layer.visible&&value?{key:current,content,cached:plates.size,framing:payload.focus?.[current]?.framing||'cover',geometry:value.geometry||null,ambience:value.ambience.metrics,delivery:value.delivery?.metrics||null}:null;},deliverMail(){if(layer.visible&&current==='gmail')plates.get(current)?.delivery?.play();},preload(key){if(key)void load(key);},destroy(){closed=true;for(const value of plates.values()){value.ambience.destroy(t=>retired.push(t));value.delivery?.destroy();}},releaseTextures(){for(const value of plates.values()){value.delivery?.releaseTextures();if(value.owned)value.ownedTexture?.destroy(true);}for(const texture of retired)texture.destroy(true);retired.length=0;},update(key,width,height,amount,time:number,animate:boolean){
  const now=performance.now(),dt=Math.min(now-last,64);last=now;
  // From one Applet to another (the Applet shelf, ui/hud/applet-shelf.ts) the new plate fades in over the one that
  // showed, which stays until it is covered (owner request 2026-10-09: the background switches smoothly too), instead
  // of the World flashing through between them. A plate still loading keeps the old one up meanwhile.
  if(key!==current){previous=layer.visible&&current&&plates.has(current)&&payload.focus?.[key]&&!failed.has(key)?current:null;progress=0;current=key;}
  if(width>800&&amount>.01&&key&&!plates.has(key))void load(key);
  progress=reduced.matches?1:plates.has(key)?Math.min(1,progress+dt/520):0;
  const eased=1-Math.pow(1-progress,3);
  if(previous&&(progress===1||failed.has(key)||!plates.has(previous)))previous=null;
  const selected=width>800?plates.get(key):null,behind=width>800&&previous?plates.get(previous):null;
  layer.visible=!!(selected||behind)&&amount>.01;layer.alpha=behind?amount:amount*eased;
  if(selected){selected.group.alpha=behind?eased:1;if(behind&&layer.children[layer.children.length-1]!==selected.group)layer.addChild(selected.group);}
  if(behind)behind.group.alpha=1;
  const left=0,lane=width;
  if(maskWidth!==lane||maskHeight!==height){maskWidth=lane;maskHeight=height;mask.clear().rect(left,0,lane,height).fill(0xffffff);}
  for(const value of plates.values()){value.group.visible=value===selected||value===behind;const playing=animate&&layer.visible&&value===selected;value.ambience.update(time,playing);value.delivery?.update(playing&&amount>.99&&progress===1);}
  content=null;if(!selected)return !!behind&&amount>.01;
  const {group,plate,owned}=selected;
  if(owned){
   // Fill the whole window with the painting at one uniform scale: no blurred or
   // mirrored margins (Order 2026-10-07). Right-align it; when the recorded subject
   // would sit under the reader seam, use the painting's outer 3% on the right
   // (primary equipment ends at 97%) to move it right, never leaving an edge bare.
   const subjectLeft=payload.focus?.[key]?.subjectLeft??.70,subjectSafeX=width-Math.max(width/3,464)+16;
   const scale=Math.max(lane/plate.texture.width,height/plate.texture.height),pw=plate.texture.width*scale,ph=plate.texture.height*scale;
   const x=Math.min(Math.max(lane-pw,subjectSafeX-subjectLeft*pw),Math.min(0,lane-pw*.97)),y=(height-ph)*.35;
   group.scale.set(1);group.position.set(0,0);plate.position.set(x,y);plate.scale.set(scale);
   selected.geometry={x,y,width:pw,height:ph,scaleX:scale,scaleY:scale,subjectLeft,subjectX:x+subjectLeft*pw,subjectSafeX};
   return amount>.01;
  }
  const scale=Math.max(lane/plate.texture.width,height/plate.texture.height);
  group.scale.set(scale);group.position.set(left+lane-plate.texture.width*scale,(height-plate.texture.height*scale)/2);
  const rect=payload.focus?.[key]?.content;
  if(rect){
   const [x,y,w,h]=rect,pw=plate.texture.width*scale,ph=plate.texture.height*scale;
   group.x=Math.max((width-pw)/2,24-x*pw);
   content={key,x:group.x+x*pw,y:group.y+y*ph,width:w*pw,height:h*ph};
  }
  return amount>.01;
 }};
}
