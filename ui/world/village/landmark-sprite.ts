import {Container,Sprite,Texture} from 'pixi.js';
import {createSceneryTone} from './scenery-tone.ts';

const boundsCache=new WeakMap<Texture,number[]>(),alphaCache=new WeakMap<Texture,{width:number;height:number;alpha:Uint8Array}>();
function paintedPixels(texture:Texture){
 const cached=alphaCache.get(texture);if(cached)return cached;
 const canvas=document.createElement('canvas');canvas.width=texture.width;canvas.height=texture.height;
 const ctx=canvas.getContext('2d',{willReadFrequently:true});
 ctx.drawImage(texture.source.resource as HTMLImageElement,0,0);
 const pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data,alpha=new Uint8Array(canvas.width*canvas.height);
 for(let i=0;i<alpha.length;i++)alpha[i]=pixels[i*4+3];
 const result={width:canvas.width,height:canvas.height,alpha};alphaCache.set(texture,result);return result;
}
function paintedBounds(texture:Texture){
 const cached=boundsCache.get(texture);if(cached)return cached;
 const {width,height,alpha:pixels}=paintedPixels(texture),canvas={width,height};
 let left=canvas.width,top=canvas.height,right=-1,bottom=-1;
 for(let y=0;y<canvas.height;y++)for(let x=0;x<canvas.width;x++)if(pixels[y*canvas.width+x]>32){if(x<left)left=x;if(x>right)right=x;if(y<top)top=y;bottom=y;}
 const result=right<0?[0,0,1,1]:[left/canvas.width,top/canvas.height,(right-left+1)/canvas.width,(bottom-top+1)/canvas.height];
 boundsCache.set(texture,result);return result;
}

// Align the painted silhouettes, not the generated files' transparent margins.
// Both passes stay in a container so the world does not grade night art twice.
// `toned` bakes the scenery tone into a texture once; without it each sprite keeps a live tone filter.
export function createLandmarkSprite(dayTexture:Texture,nightTexture:Texture|undefined,width:number,toned?:(texture:Texture)=>Texture){
 const root=new Container(),day=new Sprite(dayTexture),night=new Sprite(nightTexture||dayTexture);
 const shown=(texture:Texture)=>toned?toned(texture):texture;
 if(!toned){const quiet=createSceneryTone();day.filters=[quiet];night.filters=[quiet];}
 root.eventMode='none';root.zIndex=50;root.addChild(day,night);
 let hasNight=!!nightTexture,theme='',amount=0,source=dayTexture;
 // The landmark is part of its area: only its painted pixels take a pointer, so the ground and
 // devices around it keep theirs.
 root.hitArea={contains(x:number,y:number){
  const u=(x+day.width*.5)/day.width,v=(y+day.height)/day.height;if(u<0||v<0||u>=1||v>=1)return false;
  const {width,height,alpha}=paintedPixels(source);return alpha[Math.floor(v*height)*width+Math.floor(u*width)]>32;
 }};
 function setTextures(dayTexture:Texture,nightTexture:Texture|undefined,nextTheme:string){
  theme=nextTheme;hasNight=!!nightTexture;source=dayTexture;day.texture=shown(dayTexture);night.texture=shown(nightTexture||dayTexture);
  day.anchor.set(.5,1);day.width=width;day.height=width*dayTexture.height/dayTexture.width;
  const [dx,dy,dw,dh]=paintedBounds(dayTexture),[nx,ny,nw,nh]=paintedBounds(nightTexture||dayTexture);
  night.anchor.set(0);night.width=day.width*dw/nw;night.height=day.height*dh/nh;
  night.position.set(-day.width*.5+dx*day.width-nx*night.width,-day.height+dy*day.height-ny*night.height);
  update(amount);
 }
 function update(value:number){
  amount=hasNight?Math.max(0,Math.min(1,value)):0;
  day.alpha=1-amount;night.alpha=amount;
  day.visible=day.alpha>0;night.visible=night.alpha>0;
 }
 setTextures(dayTexture,nightTexture,'');
 // A painted point near a height of the silhouette (0 top, 1 bottom) and across it (0 left, 1 right), in the
 // landmark's own coordinates, for checks that tap it.
 function paintedPoint(at=.5,across=.5){
  const {width,height,alpha}=paintedPixels(source),[bx,by,bw,bh]=paintedBounds(source),cx=Math.floor((bx+bw*across)*width),cy=Math.floor((by+bh*at)*height);
  for(let r=0;r<Math.max(width,height);r+=2)for(let a=0;a<16;a++){const x=Math.round(cx+Math.cos(a*Math.PI/8)*r),y=Math.round(cy+Math.sin(a*Math.PI/8)*r);if(x>=0&&y>=0&&x<width&&y<height&&alpha[y*width+x]>200)return [(x+.5)/width*day.width-day.width*.5,(y+.5)/height*day.height-day.height];}
  return [0,-day.height*.5];
 }
 return {root,setTextures,update,paintedPoint,get metrics(){return {theme,hasNight,nightAmount:amount,dayTint:day.tint,nightTint:night.tint,anchor:[root.x,root.y],width:day.width,height:day.height};}};
}
