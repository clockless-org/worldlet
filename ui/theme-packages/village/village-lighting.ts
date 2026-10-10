import {moonPixels,skyBodyPlacement} from './celestial-art.ts';
import {createRegisteredPlate} from './registered-plate.ts';
import {Container,Graphics,Sprite,Texture,ColorMatrixFilter,BlurFilter,Rectangle} from 'pixi.js';
import {villageLightingState} from './village-lighting-state.ts';
import {WORLD_EXTENT} from './village-camera.ts';
import {VILLAGE_WATER_PATH} from './village-ambience.ts';
import {createSceneryTone} from './scenery-tone.ts';
import {viewportFilterArea as updateViewportFilterArea} from './viewport-filter-area.ts';

// Non-interactive village lamps are painted into the registered day/night plates.
const mod=(n:number,m:number)=>((n%m)+m)%m;
const seed=(i:number)=>mod(Math.sin(i*127.1+311.7)*43758.5453,1);
function canvasTexture(w:number,h:number,draw:(c:CanvasRenderingContext2D)=>void){const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;draw(canvas.getContext('2d'));return Texture.from(canvas);}
/** The 4x5 color matrix that applies `first`, then `second`. */
export function colorMatrixProduct(second:ArrayLike<number>,first:ArrayLike<number>):number[] {
 const out:number[]=[];
 for(let r=0;r<4;r++)for(let c=0;c<5;c++){let v=c===4?second[r*5+4]:0;for(let k=0;k<4;k++)v+=second[r*5+k]*first[k*5+c];out.push(v);}
 return out;
}
export async function createVillageLighting({stage,host,payload,image,dayLayers}){
 const nightTexture=await image(payload.night);if(!nightTexture)return null;
 const nightLayer=new Container(),nightSprite=await createRegisteredPlate(nightTexture,payload.hiresNight,image),nightBlur=new BlurFilter({strength:3,quality:3,resolution:.5});
 nightLayer.eventMode='none';nightLayer.addChild(nightSprite);stage.addChildAt(nightLayer,0);
 // Preserve Retina detail: Filter defaults to resolution 1, which downsamples the entire world.
 const grade=new ColorMatrixFilter({resolution:'inherit'}),focusGrade=new ColorMatrixFilter({resolution:'inherit'}),emission=new Container(),atmosphere=new Container();
 const sceneryTone=createSceneryTone(),viewportFilterArea=new Rectangle();let blurredNight:boolean|null=null;
 // The day plate fills the screen: one pass that applies the scenery tone, then the grade, instead of
 // two full-screen filter passes every frame.
 const sceneryGrade=new ColorMatrixFilter({resolution:'inherit'});
 const owned:Texture[]=[];let lastKey='',closed=false,metrics:any={};
 emission.eventMode=atmosphere.eventMode='none';
 stage.addChildAt(emission,2);stage.addChildAt(atmosphere,3);
 const glow=canvasTexture(128,128,c=>{const g=c.createRadialGradient(64,64,0,64,64,64);g.addColorStop(0,'rgba(255,222,154,.9)');g.addColorStop(.2,'rgba(255,197,101,.45)');g.addColorStop(.55,'rgba(255,181,89,.12)');g.addColorStop(1,'rgba(255,181,89,0)');c.fillStyle=g;c.fillRect(0,0,128,128);});owned.push(glow);
 const makeGlow=(x:number,y:number,w:number,h:number,parent=emission)=>{const s=new Sprite(glow);s.anchor.set(.5);s.position.set(x,y);s.width=w;s.height=h;s.blendMode='add';parent.addChild(s);return s;};
 const skyWashTexture=canvasTexture(4,256,c=>{const g=c.createLinearGradient(0,0,0,256);g.addColorStop(0,'rgba(140,154,168,.85)');g.addColorStop(.70,'rgba(169,175,175,.65)');g.addColorStop(1,'rgba(180,185,177,0)');c.fillStyle=g;c.fillRect(0,0,4,256);});owned.push(skyWashTexture);
 const skyWash=new Sprite(skyWashTexture);skyWash.position.set(WORLD_EXTENT.x,WORLD_EXTENT.y);skyWash.width=WORLD_EXTENT.width;skyWash.height=650;emission.addChildAt(skyWash,0);
 // Distant sky is screen-sized, clipped by the projected terrain horizon.
 // Zooming the village must not turn the sun/moon into giant foreground discs.
 const celestial=new Container(),horizon=new Graphics();stage.addChildAt(celestial,3);stage.addChildAt(horizon,4);celestial.eventMode=horizon.eventMode='none';celestial.mask=horizon;
 const sunTexture=canvasTexture(256,256,c=>{
  const g=c.createRadialGradient(128,128,0,128,128,118);
  g.addColorStop(0,'rgba(255,255,249,1)');g.addColorStop(.66,'rgba(255,253,234,1)');g.addColorStop(.82,'rgba(255,246,210,.95)');g.addColorStop(.90,'rgba(255,239,194,.5)');g.addColorStop(1,'rgba(255,231,184,0)');
  c.fillStyle=g;c.fillRect(0,0,256,256);
 });owned.push(sunTexture);
 const sunGlow=makeGlow(0,0,90,90,celestial),sun=new Sprite(sunTexture);sun.anchor.set(.5);sun.blendMode='screen';sunGlow.blendMode='screen';celestial.addChild(sun);
 const lunarCanvas=document.createElement('canvas');lunarCanvas.width=lunarCanvas.height=256;
 const lunarContext=lunarCanvas.getContext('2d'),lunarTexture=Texture.from(lunarCanvas);owned.push(lunarTexture);let lunarKey='';
 const moonHalo=canvasTexture(128,128,c=>{const g=c.createRadialGradient(64,64,0,64,64,64);g.addColorStop(0,'rgba(213,229,247,.3)');g.addColorStop(.3,'rgba(213,229,247,.08)');g.addColorStop(1,'rgba(213,229,247,0)');c.fillStyle=g;c.fillRect(0,0,128,128);});owned.push(moonHalo);
 const moonGlow=new Sprite(moonHalo);moonGlow.anchor.set(.5);celestial.addChild(moonGlow);
 const moon=new Sprite(lunarTexture);moon.anchor.set(.5);moon.blendMode='screen';celestial.addChild(moon);
 const stars=new Graphics();celestial.addChildAt(stars,0);
 const particles=new Graphics(),ripples=new Graphics(),mist=new Graphics();atmosphere.addChild(mist,ripples,particles);
 const fox=host.closest('.notion-world')?.querySelector('canvas.companion-sprite') as HTMLElement;
 function update(environment:any,time:number,view:any,width:number,height:number,detail:number){
  if(closed||!view)return;
  const s=villageLightingState(environment),key=JSON.stringify([s.rgb,s.night,s.cloud,s.lamps]);
  // The opaque daytime plate completely covers the night plate at full day.
  nightLayer.visible=s.lamps>0;
  nightLayer.scale.set(view.scale);nightLayer.position.set(view.x,view.y);
  const blurNight=host.closest('.notion-world')?.dataset.depth==='object';
  nightLayer.filterArea=updateViewportFilterArea(viewportFilterArea,view,width,height);
  if(blurredNight!==blurNight){blurredNight=blurNight;nightLayer.filters=blurNight?[sceneryTone,nightBlur]:[sceneryTone];}
  // Day/night owns the grade. Weather particles do not tint or dim the world.

  dayLayers.forEach(layer=>layer.alpha=1-s.lamps);
  emission.scale.set(view.scale);emission.position.set(view.x,view.y);
  emission.alpha=1-detail*.55;
  if(key!==lastKey){
   lastKey=key;
   // Lift deep baked shadows at night. This is stylized ambient relighting,
   // not a claim that the existing painted cast shadows rotate physically.
   const lift=s.night*.035;
   const saturation=1-s.night*.20,luma=[.213,.715,.072];
   const matrix=[...luma.map((v,i)=>s.rgb[0]*(v*(1-saturation)+(i===0?saturation:0))),0,lift,...luma.map((v,i)=>s.rgb[1]*(v*(1-saturation)+(i===1?saturation:0))),0,lift*1.2,...luma.map((v,i)=>s.rgb[2]*(v*(1-saturation)+(i===2?saturation:0))),0,lift*1.8,0,0,0,1,0];
   matrix.forEach((value,index)=>{grade.matrix[index]=value;});
   colorMatrixProduct(matrix,sceneryTone.matrix).forEach((value,index)=>{sceneryGrade.matrix[index]=value;});
   // Retain 70% of the shared ambient grade, with neutral fill to keep small
   // foreground devices readable. Never switch them back to daylight at night.
   matrix.forEach((value,index)=>{focusGrade.matrix[index]=value*.7+([0,6,12,18].includes(index)?.3:0);});
   if(fox)fox.style.filter=`brightness(${1-s.night*.16}) saturate(${1-s.night*.14})`;
  }
  skyWash.alpha=0;
  const sp=skyBodyPlacement(s.celestial.solar,width,height,view),mp=skyBodyPlacement(s.celestial.lunar,width,height,view);
  celestial.alpha=1-detail*.55;horizon.clear().rect(0,0,width,sp.horizon).fill(0xffffff);
  sun.position.set(sp.x,sp.y);sun.width=sun.height=sp.diameter;
  sunGlow.position.copyFrom(sun.position);sunGlow.width=sunGlow.height=sp.diameter*4.5;
  const sunset=Math.max(0,1-Math.max(0,sp.altitude)/18);
  sun.tint=(255<<16)|(Math.round(255-65*sunset)<<8)|Math.round(255-125*sunset);
  sun.alpha=sp.visible?Math.min(1,.35+Math.max(0,sp.altitude)/8):0;sunGlow.alpha=sun.alpha*.42;
  moon.position.set(mp.x,mp.y);moon.width=moon.height=mp.diameter;
  moonGlow.position.copyFrom(moon.position);moonGlow.width=moonGlow.height=mp.diameter*3;
  // The Moon can be above the horizon during the day. Lower contrast, not a
  // day/night visibility switch; its illuminated fraction owns the silhouette.
  moon.alpha=mp.visible?.9-.65*s.daylight:0;moonGlow.alpha=moon.alpha*(s.celestial.lunar.fraction??0)*.22*s.night;
  const fraction=Math.max(0,Math.min(1,s.celestial.lunar.fraction??1)),phase=s.celestial.lunar.phase??0;
  const lightAngle=s.celestial.lunar.lightAngle??(phase<.5?0:Math.PI);
  const nextLunarKey=fraction.toFixed(4)+':'+lightAngle.toFixed(3);
  if(nextLunarKey!==lunarKey){lunarKey=nextLunarKey;const pixels=lunarContext.createImageData(256,256);pixels.data.set(moonPixels(256,fraction,phase,lightAngle));lunarContext.putImageData(pixels,0,0);lunarTexture.source.update();}
  stars.clear();stars.alpha=s.stars;
  for(let i=0;i<45;i++)stars.circle(seed(i)*width,seed(i+100)*Math.max(0,sp.horizon-6),.4+seed(i+400)*.5).fill({color:0xe7effc,alpha:.15+seed(i+500)*.3});
  particles.clear();ripples.clear();mist.clear();
  const weatherOpacity=1-detail*.85,wind=-Math.sin(s.windFrom*Math.PI/180)*Math.min(32,s.wind)*.65;
  if(s.rain||s.snow){
   const snow=!!s.snow,n=snow?65:110;
   for(let i=0;i<n;i++){
    const depth=.4+seed(i+700)*.6,speed=snow?18+depth*25:260+depth*260;
    const x=mod(seed(i)*width+time*wind*depth+(snow?Math.sin(time*.45+i)*10:0),width);
    const y=mod(seed(i+200)*height+time*speed,height);
    if(snow)particles.circle(x,y,1+depth*1.6).fill({color:0xf5f2e7,alpha:weatherOpacity*(.22+depth*.48)});
    else particles.moveTo(x,y).lineTo(x+wind*.035,y+8+depth*11).stroke({width:.65+depth*.45,color:0xd4e2e9,alpha:weatherOpacity*(.10+depth*.22)});
   }
   if(s.rain)for(let i=0;i<18;i++){
    const progress=mod(time*.9+i*.173,1),segment=i%(VILLAGE_WATER_PATH.length-1),f=seed(i+20),a=VILLAGE_WATER_PATH[segment],b=VILLAGE_WATER_PATH[segment+1];
    const x=view.x+(a[0]+(b[0]-a[0])*f)*view.scale,y=view.y+(a[1]+(b[1]-a[1])*f)*view.scale;
    ripples.ellipse(x,y,(2+progress*5)*view.scale,(1+progress*1.5)*view.scale).stroke({width:.7,color:0xd7dfe1,alpha:.12*(1-progress)*weatherOpacity});
   }
  }
  if(s.fog)mist.rect(0,0,width,height).fill({color:0xc7d0d1,alpha:.14*weatherOpacity});
  metrics={mode:'shared-2.5d-lighting',nightPlate:true,phase:s.phase,daylight:s.daylight,lampMode:'painted',lampIntensity:s.lamps,rain:s.rain,snow:s.snow,cloud:s.cloud,sunVisible:sun.alpha>0,moonVisible:moon.alpha>0,skyBodies:{sun:sp,moon:mp,moonFraction:fraction,moonPhase:phase,moonLightAngle:lightAngle,material:'textured-lunar-disc'},positionMode:s.celestial.mode,dynamicShadows:false,accumulation:false};
 }
 return {sceneryTone,sceneryGrade,grade,focusGrade,update,get metrics(){return {...metrics,focusGrade:[...focusGrade.matrix]};},destroy(){closed=true;if(fox)fox.style.removeProperty('filter');nightLayer.destroy({children:true});nightBlur.destroy();celestial.destroy({children:true});horizon.destroy();emission.destroy({children:true});atmosphere.destroy({children:true});grade.destroy();sceneryGrade.destroy();focusGrade.destroy();sceneryTone.destroy();owned.forEach(t=>t.destroy(true));}};
}
