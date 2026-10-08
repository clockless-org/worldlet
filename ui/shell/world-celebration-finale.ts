// The text's place and where its sparks start, as fractions of the window: they rise from the mountain foot.
// The text stands high in the sky, just under the bursts (owner request 2026-10-06), well clear of the World below.
export const FINALE={textTop:.22,originTop:.8,originDepth:.1};
// Sample a glyph mask once; only sparks are drawn into the visible world.
// Sparks, their halos and tails are grouped by tone and quantised alpha into a few paths a frame:
// a shadowBlur fill and stroke for each of ~1,200 sparks, and reading back a whole-window mask, made the welcome stutter.
const COLOURS=['#ffd781','#fff5cf'],HALO='#edaa47',STEPS=6;
export function welcomeFinale(layer:HTMLElement){
 const canvas=document.createElement('canvas');canvas.className='welcome-finale';
 Object.assign(canvas.style,{position:'absolute',inset:'0',width:'100%',height:'100%'});layer.append(canvas);
 const ctx=canvas.getContext('2d');if(!ctx){canvas.remove();return ()=>{};}
 let width=0,height=0,frame=0;
 let points:{x:number,y:number,ox:number,oy:number,seed:number}[]=[];
 const resize=()=>{
  // Glowing sparks draw at CSS-pixel resolution: a Retina-sized canvas quadruples the pixels for no visible gain.
  width=layer.clientWidth;height=layer.clientHeight;canvas.width=width;canvas.height=height;
  // The mask covers only the band around the text; at least a pixel, since a hidden or zero-size window reads back nothing.
  const size=Math.min(width*.115,height*.15,128),band=Math.max(1,Math.ceil(size*1.6)),top=Math.round(height*FINALE.textTop-band/2);
  const mask=document.createElement('canvas');mask.width=Math.max(1,width);mask.height=band;const m=mask.getContext('2d',{willReadFrequently:true})!;
  m.font=`600 ${size}px Georgia, serif`;m.textAlign='center';m.textBaseline='middle';m.fillText('Welcome ♥',width*.5,band/2);
  const data=m.getImageData(0,0,mask.width,band).data,step=Math.max(3,Math.round(size/29));points=[];
  // Each spark starts somewhere along the horizon, spread across the window.
  for(let y=0;y<band;y+=step)for(let x=0;x<width;x+=step)if(data[(y*mask.width+x)*4+3]>130)points.push({
   x:x+(Math.random()-.5)*.8,y:top+y+(Math.random()-.5)*.8,seed:Math.random(),
   ox:width*(.06+Math.random()*.88),oy:height*(FINALE.originTop+Math.random()*FINALE.originDepth)});
 };
 resize();window.addEventListener('resize',resize);const start=performance.now();
 // Rising is quick at first and converges late, so sparks climb through the sky before they gather.
 const at=(p:typeof points[number],age:number)=>{
  const t=Math.min(Math.max(age/1.5,0),1),rise=1-Math.pow(1-t,3),gather=.5-.5*Math.cos(Math.PI*t);
  return [p.ox+(p.x-p.ox)*gather+Math.sin(Math.PI*t)*Math.sin(p.seed*50)*28,p.oy+(p.y-p.oy)*rise];
 };
 const render=(now:number)=>{
  const elapsed=(now-start)/1000;ctx.clearRect(0,0,width,height);
  const paths=()=>COLOURS.map(()=>Array.from({length:STEPS},()=>new Path2D()));
  const tails=paths(),sparks=paths(),halos=Array.from({length:STEPS},()=>new Path2D());
  for(const p of points){
   const age=elapsed-p.seed*.35;if(age<0)continue;
   const fall=Math.max(0,elapsed-2.4-p.seed*.4),[ax,ay]=at(p,age);
   const x=ax+Math.sin(p.seed*70)*(1-Math.exp(-fall*1.4))*85;
   const y=ay+Math.cos(p.seed*91)*(1-Math.exp(-fall*1.4))*45+fall*fall*(16+p.seed*10);
   const alpha=Math.min(1,age*3)*Math.max(0,1-fall/(1.1+p.seed*.5))*(.75+.25*Math.sin(now*.004+p.seed*30));
   if(alpha<=0)continue;
   const tone=p.seed>.6?1:0,level=Math.min(STEPS,Math.ceil(alpha*STEPS))-1,r=1.2+p.seed*.7;
   // A short tail while the spark is still climbing.
   if(age<1.5){const [tx,ty]=at(p,age-.07);tails[tone][level].moveTo(tx,ty);tails[tone][level].lineTo(x,y);}
   sparks[tone][level].moveTo(x+r,y);sparks[tone][level].arc(x,y,r,0,Math.PI*2);
   halos[level].moveTo(x+r*3,y);halos[level].arc(x,y,r*3,0,Math.PI*2);
  }
  const level=(k:number)=>(k+1)/STEPS;
  ctx.fillStyle=HALO;halos.forEach((path,k)=>{ctx.globalAlpha=level(k)*.22;ctx.fill(path);});
  ctx.lineWidth=1.2;
  for(const [tone,colour] of COLOURS.entries()){
   ctx.strokeStyle=ctx.fillStyle=colour;
   tails[tone].forEach((path,k)=>{ctx.globalAlpha=level(k)*.55;ctx.stroke(path);});
   sparks[tone].forEach((path,k)=>{ctx.globalAlpha=level(k);ctx.fill(path);});
  }
  ctx.globalAlpha=1;frame=requestAnimationFrame(render);
 };
 frame=requestAnimationFrame(render);
 return ()=>{cancelAnimationFrame(frame);window.removeEventListener('resize',resize);canvas.remove();};
}
