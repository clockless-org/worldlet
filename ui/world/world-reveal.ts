/** Low-resolution procedural painted mist; no network asset. */
/** The world's zoom-in (`.world-arriving`); the loader stays until it ends. */
export const WORLD_REVEAL_MS=3200;
/** The painted mist clears sooner, so most of the zoom is seen. */
export const WORLD_MIST_MS=2000;
/** How far the fog has already thinned when the World opens behind it after setup (veilWorld). */
const VEIL_REVEAL=.24;
/** The veil lets the World's painting show faintly through it, as through mist. */
const VEIL_DENSITY=.86;
const smooth=(t:number)=>t*t*(3-2*t);
type Mist={canvas:HTMLCanvasElement,paint:(reveal:number)=>void,reveal:number,run:number,density:number};
// Setup (worldlet.js) veils and the boot loader (world-startup.js) clears: two bundles, so the fog's state rides on its canvas.
const MIST=Symbol.for('worldlet.mist');
const mistOf=(loader:HTMLElement):Mist|undefined=>(loader.querySelector(':scope>.startup-mist') as any)?.[MIST];
function paintMist(loader:HTMLElement,colors?:{paper:string,surface:string}):Mist|null{
 const canvas=document.createElement('canvas');canvas.className='startup-mist';canvas.setAttribute('aria-hidden','true');
 // A hidden or zero-width window still gets a finite, modest mist.
 const width=320,height=Math.min(1280,Math.max(100,Math.round(width*innerHeight/Math.max(1,innerWidth))));canvas.width=width;canvas.height=height;
 const ctx=canvas.getContext('2d');if(!ctx)return null;
 const style=getComputedStyle(loader),paper=colors?.paper||style.getPropertyValue('--brand-paper').trim()||'#f5f0e4',surface=colors?.surface||style.getPropertyValue('--brand-surface').trim()||'#eee7d6';
 const gradient=ctx.createRadialGradient(width*.5,height*.4,0,width*.5,height*.4,width*.65);gradient.addColorStop(0,paper);gradient.addColorStop(1,surface);ctx.fillStyle=gradient;ctx.fillRect(0,0,width,height);
 const pixels=ctx.getImageData(0,0,width,height),thresholds=new Float32Array(width*height);
 const hash=(x:number,y:number)=>{const v=Math.sin(x*127.1+y*311.7)*43758.5453;return v-Math.floor(v);};
 function noise(x:number,y:number){const ix=Math.floor(x),iy=Math.floor(y),u=smooth(x-ix),v=smooth(y-iy);const a=hash(ix,iy),b=hash(ix+1,iy),c=hash(ix,iy+1),d=hash(ix+1,iy+1);return (a+(b-a)*u)*(1-v)+(c+(d-c)*u)*v;}
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const nx=x/width,ny=y/height;
  const cloud=noise(nx*5,ny*5)*.6+noise(nx*13,ny*13)*.28+noise(nx*31,ny*31)*.12;
  const radius=Math.min(1,Math.hypot((nx-.5)*1.4,(ny-.45)*1.2));
  thresholds[y*width+x]=.12+radius*.37+cloud*.35;
 }
 const mist:Mist={canvas,reveal:0,run:0,density:1,paint(reveal){
  mist.reveal=reveal;const alpha=255*mist.density;
  for(let i=0;i<thresholds.length;i++){
   const remaining=Math.max(0,Math.min(1,(thresholds[i]-reveal)/.22+.5));
   pixels.data[i*4+3]=Math.round(smooth(remaining)*alpha);
  }
  ctx.putImageData(pixels,0,0);
 }};
 mist.paint(0);(canvas as any)[MIST]=mist;loader.append(canvas);
 return mist;
}
// Each call takes over from the one before, from wherever the fog is now.
function thin(mist:Mist,to:number,ms:number,done:()=>void=()=>{},density=mist.density){
 const from=mist.reveal,thick=mist.density,began=performance.now(),run=++mist.run;
 const frame=(now:number)=>{
  if(!mist.canvas.isConnected||run!==mist.run)return;
  const t=Math.min(1,(now-began)/ms),e=smooth(t);mist.density=thick+(density-thick)*e;mist.paint(from+(to-from)*e);
  if(t<1)requestAnimationFrame(frame);else done();
 };
 requestAnimationFrame(frame);
}
/** Enter your world (owner request 2026-10-12): the page turns into fog over the World as setup gathers, and the fog
 * starts to thin; dissolveWorldSurface clears the rest once the World is ready behind it. */
export function veilWorld(loader:HTMLElement,{night=false,ms=900}={}){
 if(matchMedia('(prefers-reduced-motion: reduce)').matches||mistOf(loader))return;
 const mist=paintMist(loader,night?{paper:'#66708a',surface:'#454d63'}:undefined);if(!mist)return;
 // It comes in as the page fades, so the page turns into fog rather than being covered by it.
 mist.canvas.animate([{opacity:0},{opacity:1}],{duration:400,easing:'ease-out'});
 thin(mist,VEIL_REVEAL,ms,undefined,VEIL_DENSITY);
}
export function dissolveWorldSurface(loader:HTMLElement){
 if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;
 // Paint fully opaque before the loader's original background is removed; a veil from setup goes on thinning.
 const mist=mistOf(loader)||paintMist(loader);if(!mist)return;
 thin(mist,1,WORLD_MIST_MS*(1-mist.reveal*.5),()=>mist.canvas.remove());
}
