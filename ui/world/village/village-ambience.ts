import {Container,Graphics} from 'pixi.js';
export const VILLAGE_WATER_PATH=[[971.25,353.75],[878.75,381.25],[773.75,393.75],[662.5,427.5],[560.0,460.0],[532.5,508.75],[580.0,558.75],[516.25,611.25],[520.0,692.5],[666.25,768.75],[822.5,835.0],[981.25,886.25],[1060.0,962.5],[1040.0,1080.0]];

// Highlights travel only through authored water, underneath devices. These
// decorate daytime art; they do not claim live weather or moving cast shadows.
export function createVillageAmbience(world:Container,_payload?:unknown){
 const path=VILLAGE_WATER_PATH;
 const water=new Graphics();water.eventMode='none';water.zIndex=1;world.addChild(water);
 return {metrics:null,destroy(_retireTexture?:unknown){water.destroy();},update(time:number,enabled=true,_nightAmount=0){
  water.visible=enabled;if(!enabled)return;
  water.clear();
  for(let i=0;i<28;i++){
   const t=(time*.045+i/28*(path.length-1))%(path.length-1),n=Math.floor(t),f=t-n;
   const [ax,ay]=path[n],[bx,by]=path[n+1];
   const x=ax+(bx-ax)*f+Math.sin(i*9.1)*16.25,y=ay+(by-ay)*f;
   const alpha=.09*Math.sin(f*Math.PI);
   water.moveTo(x-7.5,y).quadraticCurveTo(x,y+1.5,x+8.75,y-1.25).stroke({width:1.25,color:0xf8f5d6,alpha});
  }
 }};
}
