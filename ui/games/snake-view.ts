import type {SnakeState} from '../../core/games/index.ts';
/** Both appearances consume the same state. Static sprites only change the painted material. */
export function snakeView(board:HTMLElement){
 const canvas=document.createElement('canvas'),pieces=document.createElement('div');pieces.className='snake-pieces';pieces.setAttribute('aria-hidden','true');board.append(canvas,pieces);
 const ctx=canvas.getContext('2d')!,cell=22;let shape='';
 function roundRect(x:number,y:number,w:number,h:number,r:number){ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fill();}
 return (state:SnakeState)=>{
  const next=JSON.stringify([state.body,state.food,state.direction]);if(shape===next)return;shape=next;
  canvas.width=state.columns*cell;canvas.height=state.rows*cell;board.style.setProperty('--snake-cols',String(state.columns));board.style.setProperty('--snake-rows',String(state.rows));
  board.dataset.head=state.body[0].join(',');board.dataset.food=state.food?.join(',')||'';board.dataset.score=String(state.score);
  for(let x=0;x<state.columns;x++)for(let y=0;y<state.rows;y++){ctx.fillStyle=(x+y)%2?'#b9cf9a':'#c3d7a4';ctx.fillRect(x*cell,y*cell,cell,cell);}
  if(state.food){const [x,y]=state.food;ctx.fillStyle='#c8553d';roundRect(x*cell+4,y*cell+4,cell-8,cell-8,7);ctx.fillStyle='#5f8a3a';ctx.fillRect(x*cell+cell/2-1,y*cell+1,3,5);}
  state.body.forEach(([x,y],i)=>{ctx.fillStyle=i?(i%2?'#3f6f4f':'#477a57'):'#2f5a40';roundRect(x*cell+2,y*cell+2,cell-4,cell-4,i?6:8);});
  const [dx,dy]=state.direction,[hx,hy]=state.body[0],cx=hx*cell+cell/2,cy=hy*cell+cell/2;ctx.fillStyle='#f4f0e5';for(const side of [-1,1])ctx.fillRect(cx+dx*4-dy*side*4-1.5,cy+dy*4+dx*side*4-1.5,3,3);
  // Reuse nodes while moving so keyboard focus and the board itself never change.
  const length=state.body.length+(state.food?1:0);while(pieces.children.length>length)pieces.lastElementChild!.remove();while(pieces.children.length<length)pieces.append(document.createElement('span'));
  [...state.body,...(state.food?[state.food]:[])].forEach(([x,y],i)=>{const piece=pieces.children[i] as HTMLElement;piece.className='snake-piece '+(i===0?'snake-head':i===state.body.length?'snake-food':'snake-body');piece.style.left=x*100/state.columns+'%';piece.style.top=y*100/state.rows+'%';piece.style.setProperty('--eye-x',String(50+dx*7)+'%');piece.style.setProperty('--eye-y',String(40+dy*7)+'%');});
 };
}
