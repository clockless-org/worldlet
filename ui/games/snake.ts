import {gameLoop,type GameHost} from './core.ts';

const COLS=18,ROWS=18,CELL=22,STEP=120;
const DIRS={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1],a:[-1,0],d:[1,0],w:[0,-1],s:[0,1]};

/** Snake on a garden bed. The loop runs only while the snake is moving and the board is on screen. */
export function createSnake(host:GameHost){
 const board=document.createElement('div');board.className='game-board snake-board';board.tabIndex=0;
 board.setAttribute('aria-label','Snake. Use the arrow keys or swipe to steer.');
 const canvas=document.createElement('canvas');canvas.width=COLS*CELL;canvas.height=ROWS*CELL;board.append(canvas);
 const overlay=document.createElement('p');overlay.className='game-overlay';board.append(overlay);
 const ctx=canvas.getContext('2d');
 let snake:number[][]=[],dir=[1,0],queued:number[][]=[],food=[0,0],score=0,acc=0,state:'ready'|'playing'|'paused'|'over'='ready';
 const loop=gameLoop(board,dt=>{
  if(state!=='playing'){draw();return false;}
  acc+=dt;while(acc>=STEP&&state==='playing'){acc-=STEP;advance();}
  draw();return state==='playing';
 });
 function placeFood(){
  const free:number[][]=[];for(let x=0;x<COLS;x++)for(let y=0;y<ROWS;y++)if(!snake.some(p=>p[0]===x&&p[1]===y))free.push([x,y]);
  food=free[Math.floor(Math.random()*free.length)]||[0,0];
 }
 function advance(){
  const next=queued.shift();if(next)dir=next;
  const head=[snake[0][0]+dir[0],snake[0][1]+dir[1]];
  const eats=head[0]===food[0]&&head[1]===food[1];
  const body=eats?snake:snake.slice(0,-1);
  if(head[0]<0||head[1]<0||head[0]>=COLS||head[1]>=ROWS||body.some(p=>p[0]===head[0]&&p[1]===head[1])){state='over';status();return;}
  snake=[head,...body];
  if(eats){score++;placeFood();status();}
 }
 function status(){
  if(score>host.best.get())host.best.set(score);
  const best=host.best.get();
  host.status(state==='over'?`Game over · Apples ${score} · Best ${best}`:`Apples ${score} · Best ${best}`);
  overlay.textContent=state==='ready'?'Press an arrow key or swipe to start':state==='paused'?'Paused. Press an arrow key to go on':state==='over'?'Game over. Press New game':'';
  overlay.hidden=state==='playing';board.dataset.state=state;
 }
 function roundRect(x:number,y:number,w:number,h:number,r:number){ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fill();}
 function draw(){
  for(let x=0;x<COLS;x++)for(let y=0;y<ROWS;y++){ctx.fillStyle=(x+y)%2?'#b9cf9a':'#c3d7a4';ctx.fillRect(x*CELL,y*CELL,CELL,CELL);}
  ctx.fillStyle='#c8553d';roundRect(food[0]*CELL+4,food[1]*CELL+4,CELL-8,CELL-8,7);
  ctx.fillStyle='#5f8a3a';ctx.fillRect(food[0]*CELL+CELL/2-1,food[1]*CELL+1,3,5);
  snake.forEach((p,i)=>{ctx.fillStyle=i?(i%2?'#3f6f4f':'#477a57'):'#2f5a40';roundRect(p[0]*CELL+2,p[1]*CELL+2,CELL-4,CELL-4,i?6:8);});
  const h=snake[0];if(h){
   // Two eyes looking where the snake is going.
   const cx=h[0]*CELL+CELL/2,cy=h[1]*CELL+CELL/2,px=-dir[1],py=dir[0];ctx.fillStyle='#f4f0e5';
   for(const side of [-1,1])ctx.fillRect(cx+dir[0]*4+px*side*4-1.5,cy+dir[1]*4+py*side*4-1.5,3,3);
  }
 }
 function steer(d:number[]){
  if(state==='over')return;
  const last=queued[queued.length-1]||dir;
  if(d[0]===-last[0]&&d[1]===-last[1])return;
  if(queued.length<2&&!(d[0]===last[0]&&d[1]===last[1]))queued.push(d);
  if(state!=='playing'){state='playing';acc=0;status();}
  loop.start();
 }
 function restart(){loop.stop();snake=[[6,9],[5,9],[4,9]];dir=[1,0];queued=[];score=0;acc=0;state='ready';placeFood();status();draw();}
 board.addEventListener('keydown',e=>{
  const d=DIRS[e.key];
  if(d){e.preventDefault();steer(d);return;}
  if(e.key===' '&&state==='playing'){e.preventDefault();state='paused';status();}
 });
 // Leaving the board (another window, closing the game) pauses rather than racing on unseen.
 board.addEventListener('blur',()=>{if(state==='playing'){state='paused';status();}});
 let touch:{x:number;y:number}|null=null;
 board.addEventListener('pointerdown',e=>{touch={x:e.clientX,y:e.clientY};board.focus({preventScroll:true});});
 board.addEventListener('pointerup',e=>{
  if(!touch)return;const dx=e.clientX-touch.x,dy=e.clientY-touch.y;touch=null;
  if(Math.max(Math.abs(dx),Math.abs(dy))<20)return;
  steer(Math.abs(dx)>Math.abs(dy)?[dx>0?1:-1,0]:[0,dy>0?1:-1]);
 });
 restart();
 return {element:board,restart,hint:'Arrow keys or swipe. Space pauses.'};
}
