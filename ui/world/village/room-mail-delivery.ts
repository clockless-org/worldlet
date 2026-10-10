import {Container,Graphics,Rectangle,Sprite,Texture,VideoSource} from 'pixi.js';
import type {ThemeMailDelivery} from '../../themes/index.ts';

/** Decorative playback only. The caller owns mail evidence and event deduplication. */
export function createRoomMailDelivery(parent:Container,plate:Texture,spec:ThemeMailDelivery){
 const layer=new Container();layer.eventMode='none';layer.visible=false;parent.addChild(layer);
 const width=plate.width,height=plate.height,retired:Texture[]=[];
 const canvas=document.createElement('canvas');canvas.width=canvas.height=256;
 const ctx=canvas.getContext('2d')!,gradient=ctx.createRadialGradient(128,128,0,128,128,128);
 gradient.addColorStop(0,'rgba(25,15,10,.6)');gradient.addColorStop(.45,'rgba(25,15,10,.3)');gradient.addColorStop(1,'rgba(25,15,10,0)');
 ctx.fillStyle=gradient;ctx.fillRect(0,0,256,256);
 const shadowTexture=Texture.from(canvas),shadow=new Sprite(shadowTexture);retired.push(shadowTexture);layer.addChild(shadow);
 const place=(sprite:Sprite,bounds:number[])=>{sprite.position.set(bounds[0]*width,bounds[1]*height);sprite.width=bounds[2]*width;sprite.height=bounds[3]*height;};
 place(shadow,spec.shadow.bounds);
 const actor=new Sprite(Texture.EMPTY);place(actor,spec.bounds);layer.addChild(actor);
 // Copy exact foreground pixels from the same plate: no independently generated desk edge.
 for(const bounds of spec.foreground){
  const [x,y,w,h]=bounds,texture=new Texture({source:plate.source,frame:new Rectangle(x*width,y*height,w*width,h*height)});
  const foreground=new Sprite(texture);place(foreground,bounds);layer.addChild(foreground);retired.push(texture);
 }
 const clipMask=new Graphics().rect(spec.bounds[0]*width,spec.bounds[1]*height,spec.bounds[2]*width,spec.bounds[3]*height).fill(0xffffff);
 layer.addChild(clipMask);actor.mask=clipMask;
 let video:HTMLVideoElement|null=null,source:VideoSource|null=null,texture:Texture|null=null,loading:Promise<void>|null=null;
 let enabled=false,closed=false,ticket=0,plays=0,state:'idle'|'loading'|'playing'|'failed'='idle';
 const stop=()=>{ticket++;video?.pause();layer.visible=false;if(state!=='failed')state='idle';};
 const inactive=()=>{enabled=false;stop();},visibility=()=>{if(document.hidden)inactive();};
 const reduced=matchMedia('(prefers-reduced-motion: reduce)');
 document.addEventListener('visibilitychange',visibility);window.addEventListener('worldlet:app-inactive',inactive);window.addEventListener('blur',inactive);reduced.addEventListener('change',inactive);
 const failed=()=>{stop();if(!closed&&state!=='failed'){state='failed';console.warn('Room mail performance unavailable');}};
 const load=()=>{
  if(loading)return loading;
  video=document.createElement('video');video.muted=true;video.playsInline=true;video.preload='auto';video.src=spec.src;
  video.addEventListener('ended',stop);video.addEventListener('error',failed);
  source=new VideoSource({resource:video,autoLoad:false,autoPlay:false,updateFPS:0,crossorigin:false});
  // VideoSource reports decoder failures through its emitter as well as the media element.
  source.on('error',()=>{});
  loading=source.load().then(()=>{if(closed)return;texture=new Texture({source:source!});actor.texture=texture;place(actor,spec.bounds);}).catch(failed);
  return loading;
 };
 return {
  get metrics(){return {state,time:video?.currentTime||0,plays,visible:layer.visible,bounds:[actor.x/width,actor.y/height,actor.width/width,actor.height/height]};},
  play(){
   if(!enabled||closed||state==='failed'||state==='playing'||state==='loading')return;
   const request=++ticket;state='loading';
   void load().then(async()=>{
    if(closed||request!==ticket||!enabled||state==='failed')return;
    video!.currentTime=0;
    try{await video!.play();if(request!==ticket||closed||!enabled){video!.pause();return;}plays++;state='playing';layer.visible=true;}
    catch{if(request===ticket)failed();}
   });
  },
  update(active:boolean){
   enabled=active;if(!active){if(state==='playing'||state==='loading')stop();return;}
   if(state!=='playing'||!video)return;
   // Metadata can resize VideoSource after load() resolves. Keep the authored dimensions.
   place(actor,spec.bounds);
   const t=video.currentTime,[land,lift]=spec.shadow.contact;
   const smooth=(n:number)=>{n=Math.max(0,Math.min(1,n));return n*n*(3-2*n);};
   shadow.alpha=smooth((t-land+.6)/.6)*(1-smooth((t-lift)/.45));
   // The delivered letter joins the live Mail board; do not leave a false saved-result marker.
   actor.alpha=1-smooth((t-spec.duration+1)/.8);
   if(t>=spec.duration)stop();
  },
  destroy(){closed=true;stop();enabled=false;document.removeEventListener('visibilitychange',visibility);window.removeEventListener('worldlet:app-inactive',inactive);window.removeEventListener('blur',inactive);reduced.removeEventListener('change',inactive);if(video){video.removeEventListener('ended',stop);video.removeEventListener('error',failed);}if(source){source.autoUpdate=false;source.destroy();}},
  releaseTextures(){texture?.destroy();for(const item of retired)item.destroy(item===shadowTexture);retired.length=0;},
 };
}
