// Welcome fireworks: rockets rise from the horizon and burst high in the sky in varied shapes and colours.
export type BurstShape='peony'|'ring'|'willow'|'crackle'|'multi';
export type ColourFamily='gold'|'rose'|'teal'|'violet'|'white';
type Hsl=[number,number,number];
const FAMILIES:Record<ColourFamily,Hsl>={gold:[42,95,66],rose:[345,90,74],teal:[176,75,62],violet:[272,82,76],white:[48,45,95]};
// [delay ms, shape, family, accent, horizontal position]: staggered over ~3.4 s, spread across the sky.
// Later rockets keep to the sides, where the rising "Welcome ♥" does not pass.
const PLAN:[number,BurstShape,ColourFamily,ColourFamily|null,number][]=[
 [0,'peony','gold',null,.3],
 [320,'ring','teal',null,.68],
 [700,'willow','gold',null,.5],
 [1000,'crackle','white',null,.17],
 [1400,'peony','rose','gold',.83],
 [1750,'multi','violet','teal',.38],
 [2150,'ring','rose',null,.12],
 [2550,'peony','teal','white',.88],
 [2950,'willow','violet',null,.22],
 [3350,'multi','gold','rose',.78],
];
/** Rockets start near the ground line and burst level with the distant mountains (about 10–18% from the
 * top of the window): high enough to clear the world's places, against the darker ridges rather than the pale sky. */
export const SKY={ground:.86,burstTop:.1,burstBottom:.18};
const MAX_PARTICLES=900,ALPHA_STEPS=12;
type Particle={x:number,y:number,vx:number,vy:number,age:number,life:number,colour:Hsl,width:number,drag:number,gravity:number,
 trail:number[],trailLength:number,twinkle:number,crackle:boolean};
type Rocket={x0:number,y0:number,x1:number,y1:number,born:number,rise:number,trail:number[],shape:BurstShape,family:ColourFamily,accent:ColourFamily|null,size:number};
export type SkyEvent={kind:'launch'|'burst',x:number,y:number,shape:BurstShape,family:ColourFamily};

export function skyFireworks(layer:HTMLElement,report:(event:SkyEvent)=>void){
 const canvas=document.createElement('canvas');canvas.className='welcome-fireworks';
 Object.assign(canvas.style,{position:'absolute',inset:'0',width:'100%',height:'100%'});layer.append(canvas);
 const ctx=canvas.getContext('2d');if(!ctx){canvas.remove();return ()=>{};}
 let width=0,height=0,frame=0,last=performance.now();
 const resize=()=>{
  // Glowing sparks draw at CSS-pixel resolution: a Retina-sized canvas quadruples the pixels for no visible gain.
  width=layer.clientWidth;height=layer.clientHeight;canvas.width=width;canvas.height=height;
 };
 resize();window.addEventListener('resize',resize);
 const rockets:Rocket[]=[],particles:Particle[]=[],timers:ReturnType<typeof setTimeout>[]=[];
 const random=(min:number,max:number)=>min+Math.random()*(max-min);
 const spark=(x:number,y:number,angle:number,speed:number,colour:Hsl,o:Partial<Particle>={})=>{
  if(particles.length>=MAX_PARTICLES)return;
  particles.push({x,y,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed,age:0,life:random(1.2,1.6),colour,width:2,drag:.955,gravity:70,
   trail:[x,y],trailLength:4,twinkle:0,crackle:false,...o});
 };
 const pick=(r:Rocket)=>r.accent&&Math.random()<.3?FAMILIES[r.accent]:FAMILIES[r.family];
 const burst=(r:Rocket)=>{
  const {x1:x,y1:y}=r,reach=Math.min(width,height)*.16*r.size,speed=reach*2.7;
  report({kind:'burst',x:x/width,y:y/height,shape:r.shape,family:r.family});
  if(r.shape==='peony')for(let i=0;i<64;i++)spark(x,y,random(0,Math.PI*2),speed*(.5+.5*Math.sqrt(Math.random())),pick(r));
  if(r.shape==='ring'){
   const tilt=random(-.6,.6),flat=random(.45,.75);
   for(let i=0;i<44;i++){
    const a=i/44*Math.PI*2,dx=Math.cos(a),dy=Math.sin(a)*flat;
    const rx=dx*Math.cos(tilt)-dy*Math.sin(tilt),ry=dx*Math.sin(tilt)+dy*Math.cos(tilt);
    spark(x,y,Math.atan2(ry,rx),speed*.9*Math.hypot(rx,ry),pick(r),{life:random(1.3,1.5)});
   }
   for(let i=0;i<10;i++)spark(x,y,random(0,Math.PI*2),speed*.18,FAMILIES.white,{life:.8,width:1.5});
  }
  // Long, slowly drooping trails that hang in the sky.
  if(r.shape==='willow')for(let i=0;i<46;i++)spark(x,y,random(0,Math.PI*2),speed*random(.45,.7),pick(r),
   {life:random(2.1,2.6),drag:.968,gravity:80,trailLength:14,width:1.6});
  // Short-lived stars that each split into crackling glitter as they fade.
  if(r.shape==='crackle')for(let i=0;i<36;i++)spark(x,y,random(0,Math.PI*2),speed*random(.6,1),pick(r),{life:random(.65,.85),crackle:true});
  if(r.shape==='multi')for(let b=0;b<4;b++)timers.push(setTimeout(()=>{
   const cx=x+random(-.5,.5)*reach,cy=y+random(-.4,.4)*reach,colour=b%2&&r.accent?FAMILIES[r.accent]:FAMILIES[r.family];
   for(let i=0;i<16;i++)spark(cx,cy,i/16*Math.PI*2+random(0,.3),speed*random(.3,.4),colour,{life:random(.8,1),width:1.6});
  },b*130));
 };
 const launch=([,shape,family,accent,position]:typeof PLAN[number])=>{
  const x0=width*Math.min(.94,Math.max(.06,position+random(-.03,.03))),y0=height*SKY.ground;
  const x1=x0+width*random(-.04,.04),y1=height*random(SKY.burstTop,SKY.burstBottom);
  const size=shape==='multi'?random(.9,1.1):random(.8,1.25);
  rockets.push({x0,y0,x1,y1,born:performance.now(),rise:random(.85,1.05),trail:[x0,y0],shape,family,accent,size});
  report({kind:'launch',x:x0/width,y:y0/height,shape,family});
 };
 for(const entry of PLAN)timers.push(setTimeout(()=>launch(entry),entry[0]+(entry[0]?random(-60,60):0)));
 // Trails are grouped by colour, quantised alpha and width and stroked as one path per group:
 // one stroke per spark (up to 900 a frame, each with a fresh colour string) was what made the welcome stutter.
 const styles=new Map<Hsl,string[]>(),batches=new Map<string,{style:string,width:number,path:Path2D}>();
 const stroke=(trail:number[],colour:Hsl,alpha:number,lineWidth:number)=>{
  if(trail.length<4||alpha<=0)return;
  let tones=styles.get(colour);
  if(!tones)styles.set(colour,tones=Array.from({length:ALPHA_STEPS},(_,k)=>`hsla(${colour[0]},${colour[1]}%,${colour[2]}%,${(k+1)/ALPHA_STEPS})`));
  const style=tones[Math.min(ALPHA_STEPS,Math.ceil(alpha*ALPHA_STEPS))-1],width=Math.round(lineWidth*4)/4,key=style+width;
  let batch=batches.get(key);if(!batch)batches.set(key,batch={style,width,path:new Path2D()});
  batch.path.moveTo(trail[0],trail[1]);for(let i=2;i<trail.length;i+=2)batch.path.lineTo(trail[i],trail[i+1]);
 };
 const push=(trail:number[],x:number,y:number,length:number)=>{trail.push(x,y);if(trail.length>length*2)trail.splice(0,2);};
 const render=(now:number)=>{
  const dt=Math.min(.1,(now-last)/1000);last=now;ctx.clearRect(0,0,width,height);
  ctx.globalCompositeOperation='lighter';ctx.lineCap='round';
  // Rockets follow the clock, so bursts land on time even when frames are slow.
  for(let i=rockets.length-1;i>=0;i--){
   const r=rockets[i],t=Math.min(1,Math.max(0,(now-r.born)/1000/r.rise)),ease=1-(1-t)*(1-t);
   push(r.trail,r.x0+(r.x1-r.x0)*ease,r.y0+(r.y1-r.y0)*ease,8);
   stroke(r.trail,FAMILIES.white,.85,2.2);
   if(t>=1){rockets.splice(i,1);burst(r);}
  }
  for(let i=particles.length-1;i>=0;i--){
   const p=particles[i];p.age+=dt;
   if(p.age>=p.life){
    if(p.crackle)for(let k=0;k<2;k++)spark(p.x,p.y,random(0,Math.PI*2),random(20,60),FAMILIES.white,{life:random(.3,.45),width:1.3,twinkle:1,gravity:40});
    particles.splice(i,1);continue;
   }
   const drag=Math.pow(p.drag,dt*60);p.vx*=drag;p.vy=p.vy*drag+p.gravity*dt;p.x+=p.vx*dt;p.y+=p.vy*dt;
   push(p.trail,p.x,p.y,p.trailLength);
   const fade=1-p.age/p.life,flicker=p.twinkle?.5+.5*Math.sin(now*.05+i):1;
   stroke(p.trail,p.colour,Math.min(1,fade*1.6)*flicker,p.width*(.6+.4*fade));
  }
  for(const {style,width,path} of batches.values()){ctx.strokeStyle=style;ctx.lineWidth=width;ctx.stroke(path);}
  batches.clear();ctx.globalCompositeOperation='source-over';
  frame=requestAnimationFrame(render);
 };
 frame=requestAnimationFrame(render);
 return ()=>{cancelAnimationFrame(frame);timers.forEach(clearTimeout);window.removeEventListener('resize',resize);canvas.remove();};
}
