import {Container,Graphics} from 'pixi.js';
// While an Applet works, the World shows the work moving (owner request 2026-10-03, after a
// warehouse map where forklifts and trucks visibly carry goods between buildings): the busier the
// World, the livelier it gets as a whole: more glints run down the river (and the Home chimney
// smokes faster, pixi-world.ts), easing back when the work ends. The working device itself stays
// still; only its lamp breathes (owner decision 2026-10-05: no Applet may jump). No motes travel
// between a device and Fox (owner decision 2026-10-04: "不要光点了").
// Nothing is drawn under a device, over its head (where the task screen and the check or
// exclamation live) or at idle: the glint layer is hidden when nothing works, so a settled World
// keeps its draw-call budget. Reduced motion and motion turned off show none of it; the breathing
// lamp and the world log still say it is working.
export const WORK_MOTION=Object.freeze({
 /** Working Applets at which the whole World is at its liveliest. */
 busiest:3,
 /** Seconds the World's liveliness takes to follow the work. */
 liven:1.5
});

/** How lively the whole World is with `working` Applets, 0 at rest to 1 at `busiest`. */
export function liveliness(working:number):number {return Math.min(1,Math.max(0,working/WORK_MOTION.busiest));}

/** `path` is the theme's line the glints run along (Village: its river, theme-scene.ts). */
export function createWorkMotion(world:Container,path:readonly number[][]){
 // The river glints lie under the devices.
 const glints=new Graphics();glints.eventMode='none';glints.zIndex=60;glints.visible=false;world.addChild(glints);
 let lively=0,last=0;
 return {
  /** `working` is how many Applets are working now. Returns whether anything is still drawn. */
  update(time:number,working:number,shown:boolean):boolean {
   const step=Math.max(0,Math.min(.25,time-last));last=time;
   const target=shown?liveliness(working):0;
   lively=shown?lively+(target-lively)*Math.min(1,step/WORK_MOTION.liven*3):0;
   if(lively<.005&&target===0)lively=0;
   glints.clear();
   if(lively>0){
    // Extra glints run down the river, more and brighter the busier the World.
    const count=Math.round(26*lively);
    for(let i=0;i<count;i++){
     const t=(time*.11+i/count*(path.length-1))%(path.length-1),n=Math.floor(t),f=t-n,[ax,ay]=path[n],[bx,by]=path[n+1];
     const x=ax+(bx-ax)*f+Math.sin(i*5.3)*22,y=ay+(by-ay)*f+Math.cos(i*3.7)*4,twinkle=.5+.5*Math.sin(time*3+i*2.1);
     glints.moveTo(x-6,y).lineTo(x+6,y).stroke({width:1.6,color:0xfffbe6,alpha:.42*lively*twinkle*Math.sin(f*Math.PI)});
    }
   }
   glints.visible=lively>0;
   return glints.visible;
  },
  /** 0 at rest to 1 at the busiest; the chimney smoke follows it too. */
  get liveliness(){return lively;},
  get metrics(){return {liveliness:lively,drawn:glints.visible};},
  destroy(){glints.destroy();}
 };
}
