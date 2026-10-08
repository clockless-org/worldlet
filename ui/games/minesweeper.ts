import type {GameHost} from './core.ts';

const W=10,H=10,MINES=14;

/** Minesweeper on a 10 × 10 field. The first dig is always safe; nothing runs between moves. */
export function createMinesweeper(host:GameHost){
 const board=document.createElement('div');board.className='game-board mines-board';board.tabIndex=-1;
 board.setAttribute('role','grid');board.setAttribute('aria-label','Minesweeper. Click to dig, right-click or long-press to flag.');
 board.style.setProperty('--cols',String(W));
 const cells:HTMLButtonElement[]=[];
 for(let i=0;i<W*H;i++){const b=document.createElement('button');b.type='button';b.className='mines-cell';b.dataset.index=String(i);board.append(b);cells.push(b);}
 let mines=new Set<number>(),open=new Set<number>(),flags=new Set<number>(),state:'ready'|'playing'|'won'|'lost'='ready',started=0,boom=-1;
 const around=(i:number)=>{const x=i%W,y=Math.floor(i/W),out:number[]=[];for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){if(!dx&&!dy)continue;const nx=x+dx,ny=y+dy;if(nx>=0&&ny>=0&&nx<W&&ny<H)out.push(ny*W+nx);}return out;};
 const count=(i:number)=>around(i).filter(n=>mines.has(n)).length;
 function lay(safe:number){
  const keep=new Set([safe,...around(safe)]);mines=new Set();
  while(mines.size<MINES){const i=Math.floor(Math.random()*W*H);if(!keep.has(i))mines.add(i);}
 }
 function dig(i:number){
  if(state==='won'||state==='lost'||flags.has(i))return;
  if(state==='ready'){lay(i);state='playing';started=Date.now();}
  if(open.has(i)){
   // Chord: a number with all its flags placed opens its other neighbours.
   const n=around(i);if(n.filter(j=>flags.has(j)).length!==count(i))return;
   for(const j of n)if(!open.has(j)&&!flags.has(j))reveal(j);
  }else reveal(i);
  if(state==='playing'&&open.size===W*H-MINES){state='won';const secs=Math.round((Date.now()-started)/1000),best=host.best.get();if(!best||secs<best)host.best.set(secs);}
  draw();
 }
 function reveal(i:number){
  if(mines.has(i)){state='lost';boom=i;return;}
  const stack=[i];
  while(stack.length){const j=stack.pop();if(open.has(j)||flags.has(j))continue;open.add(j);if(!count(j))for(const n of around(j))if(!open.has(n))stack.push(n);}
 }
 function flag(i:number){
  if(state==='won'||state==='lost'||open.has(i))return;
  if(flags.has(i))flags.delete(i);else flags.add(i);draw();
 }
 const clock=(s:number)=>Math.floor(s/60)+':'+String(s%60).padStart(2,'0');
 function draw(){
  cells.forEach((b,i)=>{
   const shown=open.has(i)||(state==='lost'&&mines.has(i)),n=shown&&!mines.has(i)?count(i):0;
   b.dataset.state=open.has(i)?'open':flags.has(i)?'flag':state==='lost'&&mines.has(i)?'mine':'closed';
   b.dataset.count=n?String(n):'';b.classList.toggle('is-boom',i===boom);
   b.textContent=b.dataset.state==='flag'?'⚑':b.dataset.state==='mine'?'✸':n?String(n):'';
   b.setAttribute('aria-label',b.dataset.state==='closed'?'hidden':b.dataset.state==='flag'?'flagged':b.dataset.state==='mine'?'mine':n?n+' mines near':'clear');
  });
  const best=host.best.get();
  host.status(state==='won'?`Cleared in ${clock(Math.round((Date.now()-started)/1000))} · Best ${clock(best)}`:state==='lost'?'Boom. Press New game to try again':`Mines ${MINES-flags.size} left`+(best?` · Best ${clock(best)}`:''));
  board.dataset.state=state;
 }
 function restart(){mines=new Set();open=new Set();flags=new Set();state='ready';boom=-1;draw();}
 board.addEventListener('click',e=>{const b=(e.target as Element).closest<HTMLButtonElement>('.mines-cell');if(b)dig(Number(b.dataset.index));});
 board.addEventListener('contextmenu',e=>{const b=(e.target as Element).closest<HTMLButtonElement>('.mines-cell');if(!b)return;e.preventDefault();flag(Number(b.dataset.index));});
 board.addEventListener('keydown',e=>{const b=(e.target as Element).closest<HTMLButtonElement>('.mines-cell');if(b&&e.key.toLowerCase()==='f'){e.preventDefault();flag(Number(b.dataset.index));}});
 // Long-press flags on touch screens; the click that follows is swallowed.
 let press=0,pressed=false;
 board.addEventListener('pointerdown',e=>{if(e.pointerType!=='touch')return;const b=(e.target as Element).closest<HTMLButtonElement>('.mines-cell');if(!b)return;pressed=false;press=window.setTimeout(()=>{pressed=true;flag(Number(b.dataset.index));},420);});
 for(const name of ['pointerup','pointercancel','pointerleave'])board.addEventListener(name,()=>clearTimeout(press));
 board.addEventListener('click',e=>{if(pressed){pressed=false;e.stopImmediatePropagation();}},true);
 restart();
 return {element:board,restart,hint:'Click to dig. Right-click or F to flag.'};
}
