// HUD and games fixes, without a browser: the world log's stop() leaves nothing running, a Minesweeper long press
// never swallows a later click, a Snake that fills its bed ends the game with no apple drawn on it, and the
// practice walkthrough survives blocked storage and a missing stage.
import assert from 'node:assert/strict';

// A tiny DOM: listeners run capture-first at the target, as a browser does, and honor stopImmediatePropagation.
class FakeEl{
 listeners:{type:string;fn:(e:any)=>void;capture:boolean}[]=[];children:any[]=[];dataset:any={};style:any={setProperty(){},cssText:''};
 className='';textContent='';hidden=false;tabIndex=0;type='';isConnected=true;attrs:Record<string,string>={};
 tag:string;constructor(tag:string){this.tag=tag;}
 setAttribute(k:string,v:string){this.attrs[k]=v;}
 getAttribute(k:string){return this.attrs[k]??null;}
 append(...c:any[]){this.children.push(...c);}
 prepend(...c:any[]){this.children.unshift(...c);}
 remove(){}
 focus(){}
 animate(){return {cancel(){}};}
 getClientRects(){return [{}];}
 getBoundingClientRect(){return {x:0,y:0,left:0,top:0,width:100,height:100};}
 classList={toggle(){},add(){},contains:()=>false};
 closest(sel:string){return sel==='.mines-cell'&&this.className==='mines-cell'?this:null;}
 querySelector(_sel:string):any{return null;}
 addEventListener(type:string,fn:(e:any)=>void,opt?:any){this.listeners.push({type,fn,capture:opt===true||!!opt?.capture});}
 removeEventListener(type:string,fn:(e:any)=>void){this.listeners=this.listeners.filter(l=>l.type!==type||l.fn!==fn);}
 count(type:string){return this.listeners.filter(l=>l.type===type).length;}
 fire(type:string,props:any={}){
  let stopped=false;const e={type,preventDefault(){},stopImmediatePropagation(){stopped=true;},...props};
  for(const l of [...this.listeners.filter(l=>l.type===type&&l.capture),...this.listeners.filter(l=>l.type===type&&!l.capture)]){if(stopped)break;l.fn(e);}
 }
}
const rects:{r:number;x:number;y:number;fill:string}[]=[],fills:string[]=[];
const ctx={fillStyle:'',fillRect(){fills.push(this.fillStyle);},beginPath(){},fill(){},roundRect(x:number,y:number,_w:number,_h:number,r:number){rects.push({r,x,y,fill:ctx.fillStyle});fills.push(ctx.fillStyle);}};
let timers=new Map<number,()=>void>(),nextTimer=1;
const g=globalThis as any;
g.setTimeout=(fn:()=>void)=>{const id=nextTimer++;timers.set(id,fn);return id;};
g.clearTimeout=(id:number)=>{timers.delete(id);};
g.setInterval=(fn:()=>void)=>{const id=nextTimer++;timers.set(id,fn);return id;};
g.clearInterval=(id:number)=>{timers.delete(id);};
const runTimers=()=>{const due=[...timers.values()];timers.clear();for(const fn of due)fn();};
let frames:((now:number)=>void)[]=[];
g.requestAnimationFrame=(fn:(now:number)=>void)=>{frames.push(fn);return frames.length;};
g.cancelAnimationFrame=()=>{frames=[];};
const doc=new FakeEl('document') as any;doc.hidden=false;doc.documentElement=new FakeEl('html');doc.documentElement.style.removeProperty=()=>{};
doc.createTextNode=(text:string)=>({textContent:text});
doc.createElement=(tag:string)=>{const e=new FakeEl(tag) as any;if(tag==='canvas')e.getContext=()=>ctx;return e;};
g.document=doc;
const win=new FakeEl('window');g.window=Object.assign(win,{setTimeout:g.setTimeout,clearTimeout:g.clearTimeout,dispatchEvent(){}});

// 1. World log: stop() removes the visibility listener and cancels a pending short wait.
{
 const {mountWorldLog}=await import('../ui/hud/world-log.ts');
 let calls=0;
 const log=mountWorldLog({call:async()=>{calls++;return {entries:[]};}});
 await Promise.resolve();await Promise.resolve();
 const before=calls;
 assert.equal(doc.count('visibilitychange'),1,'the world log watches visibility while mounted');
 win.fire('worldlet:job');
 log.stop();
 assert.equal(doc.count('visibilitychange'),0,'stop() removes the visibility listener');
 assert.equal(timers.size,0,'stop() cancels the poll and the pending refresh after a job event');
 doc.fire('visibilitychange');runTimers();await Promise.resolve();
 assert.equal(calls,before,'a stopped world log reads nothing more');
}

// 2. Minesweeper: a long press with no click after it does not swallow the next real click.
{
 const {createMinesweeper}=await import('../ui/games/minesweeper.ts');
 const game=createMinesweeper({status(){},best:{get:()=>0,set(){}}});
 const board=game.element as any as FakeEl,cell=board.children[0] as FakeEl,other=board.children[55] as FakeEl;
 board.fire('pointerdown',{pointerType:'touch',target:cell});runTimers();
 assert.equal(cell.dataset.state,'flag','a long press flags');
 board.fire('pointerleave',{target:cell});// the finger slid off: no click follows the long press
 board.fire('pointerdown',{pointerType:'mouse',target:other});board.fire('click',{target:other});
 assert.equal(other.dataset.state,'open','the next real click digs instead of being swallowed');
 // A second press cancels the first press's timer: only one flag toggles.
 game.restart();
 const a=board.children[90] as FakeEl,b=board.children[99] as FakeEl;
 board.fire('pointerdown',{pointerType:'touch',target:a});board.fire('pointerdown',{pointerType:'touch',target:b});runTimers();
 assert.equal(a.dataset.state,'closed','an earlier press timer is cancelled by a new press');
 assert.equal(b.dataset.state,'flag');
 board.fire('click',{target:b});
 assert.equal(b.dataset.state,'flag','the click that ends a long press is still swallowed');
 game.dispose?.();assert.equal(doc.count('visibilitychange'),0,'leaving Minesweeper removes its clock listener');
}

// 3. Snake: filling the whole bed ends the game with no apple drawn on the snake.
{
 const {createSnake}=await import('../ui/games/snake.ts');
 const random=Math.random;Math.random=()=>0;
 let statusLine='';
 const game=createSnake({status:t=>{statusLine=t;},best:{get:()=>0,set(){}}});
 const board=game.element as any as FakeEl,N=18,CELL=22;
 // A cycle through every cell: up column 0, then a serpentine over columns 1..17; walked in reverse to match the start.
 const cycle:number[][]=[];
 for(let y=0;y<N;y++)if(y%2===0)for(let x=1;x<N;x++)cycle.push([x,y]);else for(let x=N-1;x>=1;x--)cycle.push([x,y]);
 for(let y=N-1;y>=0;y--)cycle.push([0,y]);
 const at=new Map(cycle.map((p,i)=>[p.join(),i]));
 const want=(h:number[])=>{const n=cycle[(at.get(h.join())!-1+cycle.length)%cycle.length];return [n[0]-h[0],n[1]-h[1]];};
 const key=(d:number[])=>d[0]===1?'ArrowRight':d[0]===-1?'ArrowLeft':d[1]===1?'ArrowDown':'ArrowUp';
 const head=()=>{const r=rects.filter(r=>r.r===8).at(-1)!;return [(r.x-2)/CELL,(r.y-2)/CELL];};
 let now=0,dir=[1,0],full=false;
 board.fire('keydown',{key:'ArrowRight'});
 for(let i=0;i<1_000_000&&frames.length;i++){
  rects.length=0;fills.length=0;const f=frames.shift()!;now+=50;f(now);
  if(rects.filter(r=>r.r===6||r.r===8).length===N*N){
   // The frame in which the snake first fills the bed: the game has ended and no apple is drawn on it.
   full=true;
   assert.equal(board.dataset.state,'won','a full bed wins at once');
   assert.equal(rects.filter(r=>r.fill==='#c8553d').length,0,'no apple is drawn on the full snake');
   break;
  }
  if(board.dataset.state!=='playing')break;
  if(!rects.length)continue;
  const d=want(head());if(d[0]!==dir[0]||d[1]!==dir[1]){dir=d;board.fire('keydown',{key:key(d)});}
 }
 Math.random=random;
 assert.ok(full,'the snake fills the whole bed');
 assert.match(statusLine,/^Board complete · Apples 321 /,'every free cell was eaten and the end is told');game.dispose?.();
}

// 4. Practice walkthrough: blocked storage and a missing stage do not throw.
{
 const {createPracticeWalkthrough}=await import('../ui/practice/practice-walkthrough.ts');
 const root=new FakeEl('div');root.querySelector=(sel:string)=>sel==='.companion-avatar'?new FakeEl('img'):null;// no #notionStage
 const storage={getItem:()=>null,setItem(){throw Error('QuotaExceededError');}};
 const shown:any[]=[];
 const practice=createPracticeWalkthrough({root,scene:()=>({devicePoint:()=>({x:1,y:1})}),home(){},storage,show:(v:any)=>shown.push(v)});
 const made=await practice.execute('practice',{action:'create',title:'Groceries',items:['Milk']},{});
 assert.equal(made.ok,true,'a checklist is made even when storage refuses the write');
 const hidden=await practice.execute('practice',{action:'hide'},{});
 assert.equal(hidden.ok,true);
 g.matchMedia=()=>({matches:true});
 const run=practice.execute('run_practice_iteration',{},{});
 for(let i=0;i<5;i++){await Promise.resolve();runTimers();}
 const result=await run;
 assert.equal(result.error,'World is not ready. Return to the world and try again.','a missing stage stops the run with the existing message');
}
console.log('PASS HUD and games fixes: world log stop, Minesweeper long press, full Snake bed, practice storage and stage');
