import type {GameHost} from './core.ts';

const SIZE=4;
const KEYS={ArrowLeft:[0,-1],ArrowRight:[0,1],ArrowUp:[-1,0],ArrowDown:[1,0],a:[0,-1],d:[0,1],w:[-1,0],s:[1,0]};

/** 2048: slide the tiles, equal numbers merge. Purely event driven: nothing runs between moves. */
export function create2048(host:GameHost){
 const board=document.createElement('div');board.className='game-board g2048-board';board.tabIndex=0;
 board.setAttribute('role','grid');board.setAttribute('aria-label','2048 board. Use the arrow keys or swipe.');
 const cells:HTMLElement[]=[];
 for(let i=0;i<SIZE*SIZE;i++){const c=document.createElement('div');c.className='g2048-cell';c.setAttribute('role','gridcell');board.append(c);cells.push(c);}
 let grid:number[]=[],score=0,over=false,won=false,merged=new Set<number>(),fresh=-1;

 function spawn(){
  const empty=grid.map((v,i)=>v?-1:i).filter(i=>i>=0);if(!empty.length)return;
  fresh=empty[Math.floor(Math.random()*empty.length)];grid[fresh]=Math.random()<.9?2:4;
 }
 function canMove(){
  for(let r=0;r<SIZE;r++)for(let c=0;c<SIZE;c++){const v=grid[r*SIZE+c];if(!v)return true;if(c<SIZE-1&&grid[r*SIZE+c+1]===v)return true;if(r<SIZE-1&&grid[(r+1)*SIZE+c]===v)return true;}
  return false;
 }
 function draw(){
  grid.forEach((v,i)=>{const c=cells[i];c.textContent=v?String(v):'';c.dataset.value=v?String(Math.min(v,4096)):'';c.classList.toggle('is-new',i===fresh);c.classList.toggle('is-merged',merged.has(i));c.setAttribute('aria-label',v?String(v):'empty');});
  const best=Math.max(score,host.best.get());if(score>host.best.get())host.best.set(score);
  host.status(over?`No moves left · Score ${score} · Best ${best}`:won?`2048! Keep going · Score ${score}`:`Score ${score} · Best ${best}`);
  board.dataset.state=over?'over':'playing';
 }
 function move(dr:number,dc:number){
  if(over)return;
  const before=grid.join();merged=new Set();fresh=-1;
  const lines:number[][]=[];
  for(let k=0;k<SIZE;k++){
   const line:number[]=[];
   for(let j=0;j<SIZE;j++){
    // Walk each line from the edge the tiles slide toward.
    const t=(dr+dc)>0?SIZE-1-j:j;
    line.push(dr?t*SIZE+k:k*SIZE+t);
   }
   lines.push(line);
  }
  for(const line of lines){
   const values=line.map(i=>grid[i]).filter(Boolean),out:number[]=[];
   for(let i=0;i<values.length;i++){
    if(values[i]===values[i+1]){const v=values[i]*2;out.push(v);score+=v;if(v===2048)won=true;merged.add(line[out.length-1]);i++;}
    else out.push(values[i]);
   }
   line.forEach((cell,i)=>{grid[cell]=out[i]||0;});
  }
  if(grid.join()===before)return;
  spawn();if(!canMove())over=true;draw();
 }
 function restart(){grid=Array(SIZE*SIZE).fill(0);score=0;over=false;won=false;merged=new Set();spawn();spawn();fresh=-1;draw();}
 board.addEventListener('keydown',e=>{const d=KEYS[e.key];if(!d)return;e.preventDefault();move(d[0],d[1]);});
 let touch:{x:number;y:number}|null=null;
 board.addEventListener('pointerdown',e=>{touch={x:e.clientX,y:e.clientY};board.focus({preventScroll:true});});
 board.addEventListener('pointerup',e=>{
  if(!touch)return;const dx=e.clientX-touch.x,dy=e.clientY-touch.y;touch=null;
  if(Math.max(Math.abs(dx),Math.abs(dy))<24)return;
  if(Math.abs(dx)>Math.abs(dy))move(0,dx>0?1:-1);else move(dy>0?1:-1,0);
 });
 restart();
 return {element:board,restart,hint:'Arrow keys or swipe. Equal tiles merge.'};
}
