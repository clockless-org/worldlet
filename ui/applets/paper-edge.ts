import type {BrowserPaperProfile,SurfaceRect} from '../../contracts/browser-surface.ts';
/** The scene's own pixels over the outermost 0–3 CSS pixels. No page DOM or input is touched. */
type Paint={src:string;image:SurfaceRect;profile:BrowserPaperProfile;frame?:{src:string;source:SurfaceRect;target:SurfaceRect};clear?:SurfaceRect[]};
const canvas=document.querySelector('canvas')!,g=canvas.getContext('2d')!;
let current:Paint|null=null,bitmap:HTMLImageElement|null=null,mask:HTMLImageElement|null=null,generation=0;
function paint(){
 const w=innerWidth,h=innerHeight,dpr=devicePixelRatio||1;
 canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);g.setTransform(dpr,0,0,dpr,0,0);
 if(!current||!bitmap||w<1||h<1)return;
 const {image,profile:p}=current;
 g.drawImage(bitmap,image.x,image.y,image.width,image.height);
 if(current.frame&&mask){
  // Use only the extracted alpha; every visible colour still comes from the original painting.
  const layer=document.createElement('canvas');layer.width=canvas.width;layer.height=canvas.height;
  const m=layer.getContext('2d')!;m.setTransform(dpr,0,0,dpr,0,0);
  const {source:s,target:t}=current.frame;
  m.drawImage(mask,s.x*mask.width,s.y*mask.height,s.width*mask.width,s.height*mask.height,t.x,t.y,t.width,t.height);
  g.globalCompositeOperation='destination-in';g.drawImage(layer,0,0,w,h);g.globalCompositeOperation='source-over';clearControls();return;
 }
 // Punch out the page, keeping the original painted paper as a thin foreground. Each side is sampled clockwise.
 const hole=new Path2D();
 p.top.forEach((n,i)=>{const x=i*w/(p.top.length-1);if(i===0)hole.moveTo(x,n);else hole.lineTo(x,n);});
 p.right.forEach((n,i)=>hole.lineTo(w-n,i*h/(p.right.length-1)));
 p.bottom.forEach((n,i)=>hole.lineTo(w-i*w/(p.bottom.length-1),h-n));
 p.left.forEach((n,i)=>hole.lineTo(n,h-i*h/(p.left.length-1)));
 hole.closePath();g.globalCompositeOperation='destination-out';g.fill(hole);g.globalCompositeOperation='source-over';clearControls();
}
// World controls standing on the frame (the page's toolbar) show through: the World draws the same frame under them.
function clearControls(){for(const r of current?.clear||[])g.clearRect(r.x,r.y,r.width,r.height);}
(window as any).paperEdge={
 async apply(value:Paint|null){
  const token=++generation;current=value;
  if(!value){bitmap=null;mask=null;paint();return false;}
  if(bitmap?.src!==value.src){
   const next=new Image();next.src=value.src;
   try{await next.decode();}catch{if(token===generation){current=null;bitmap=null;paint();}return false;}
   if(token!==generation)return false;bitmap=next;
  }
  if(value.frame&&mask?.src!==value.frame.src){
   const next=new Image();next.src=value.frame.src;
   try{await next.decode();}catch{if(token===generation){current=null;bitmap=null;mask=null;paint();}return false;}
   if(token!==generation)return false;mask=next;
  }
  if(!value.frame)mask=null;
  paint();return true;
 }
};
window.addEventListener('resize',paint);
