import type {GameHost} from './core.ts';

const peers=(i:number)=>{const r=Math.floor(i/9),c=i%9,br=r-r%3,bc=c-c%3,out=new Set<number>();for(let k=0;k<9;k++){out.add(r*9+k);out.add(k*9+c);out.add((br+Math.floor(k/3))*9+bc+k%3);}out.delete(i);return [...out];};
const PEERS=Array.from({length:81},(_,i)=>peers(i));
const shuffled=()=>{const a=[1,2,3,4,5,6,7,8,9];for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;};

/** Counts solutions up to `limit`; a puzzle is kept only while it has exactly one. */
function solve(grid:number[],limit:number,random=false):number{
 let best=-1,options:number[]=[];
 for(let i=0;i<81;i++){
  if(grid[i])continue;
  const used=new Set(PEERS[i].map(p=>grid[p]));const free=(random?shuffled():[1,2,3,4,5,6,7,8,9]).filter(v=>!used.has(v));
  if(best<0||free.length<options.length){best=i;options=free;if(!free.length)return 0;}
 }
 if(best<0)return 1;
 let found=0;
 for(const v of options){grid[best]=v;found+=solve(grid,limit-found,random);if(found>=limit){if(!random)grid[best]=0;return found;}}
 grid[best]=0;return found;
}
export function makeSudoku(clues=36){
 const solution=Array(81).fill(0);solve(solution,1,true);
 const puzzle=[...solution];
 for(const i of Array.from({length:81},(_,i)=>i).sort(()=>Math.random()-.5)){
  if(puzzle.filter(Boolean).length<=clues)break;
  const v=puzzle[i];puzzle[i]=0;
  if(solve([...puzzle],2)!==1)puzzle[i]=v;
 }
 return {puzzle,solution};
}

/** Sudoku with a fresh puzzle each game. Event driven: nothing runs between entries. */
export function createSudoku(host:GameHost){
 const element=document.createElement('div');element.className='sudoku-game';
 const board=document.createElement('div');board.className='game-board sudoku-board';board.tabIndex=0;
 board.setAttribute('role','grid');board.setAttribute('aria-label','Sudoku. Choose a square, then type or tap a number.');
 const pad=document.createElement('div');pad.className='sudoku-pad';
 element.append(board,pad);
 const cells:HTMLButtonElement[]=[];
 for(let i=0;i<81;i++){const b=document.createElement('button');b.type='button';b.tabIndex=-1;b.className='sudoku-cell';b.dataset.index=String(i);b.dataset.row=String(Math.floor(i/9));b.dataset.col=String(i%9);board.append(b);cells.push(b);}
 for(const v of [1,2,3,4,5,6,7,8,9,0]){const b=document.createElement('button');b.type='button';b.className='sudoku-key';b.textContent=v?String(v):'Erase';b.dataset.value=String(v);pad.append(b);}
 let puzzle:number[]=[],solution:number[]=[],entry:number[]=[],selected=40,done=false,started=0;
 const clock=(s:number)=>Math.floor(s/60)+':'+String(s%60).padStart(2,'0');
 function draw(){
  const value=entry[selected];
  cells.forEach((b,i)=>{
   const v=puzzle[i]||entry[i],wrong=!puzzle[i]&&!!entry[i]&&PEERS[i].some(p=>(puzzle[p]||entry[p])===entry[i]);
   b.textContent=v?String(v):'';b.dataset.given=String(!!puzzle[i]);b.classList.toggle('is-selected',i===selected);
   b.classList.toggle('is-related',i!==selected&&PEERS[selected].includes(i));b.classList.toggle('is-same',!!v&&v===(puzzle[selected]||value)&&i!==selected);
   b.classList.toggle('is-wrong',wrong);b.setAttribute('aria-label',`Row ${Math.floor(i/9)+1}, column ${i%9+1}, ${v||'empty'}`);
  });
  const left=entry.reduce((n,v,i)=>n+(!puzzle[i]&&!v?1:0),0),best=host.best.get();
  host.status(done?`Solved in ${clock(Math.round((Date.now()-started)/1000))} · Best ${clock(host.best.get())}`:`${left} squares to fill`+(best?` · Best ${clock(best)}`:''));
  element.dataset.state=done?'solved':'playing';
 }
 function put(v:number){
  if(done||puzzle[selected])return;entry[selected]=v;
  if(puzzle.every((p,i)=>(p||entry[i])===solution[i])){done=true;const secs=Math.round((Date.now()-started)/1000),best=host.best.get();if(!best||secs<best)host.best.set(secs);}
  draw();
 }
 function restart(){const next=makeSudoku();puzzle=next.puzzle;solution=next.solution;entry=Array(81).fill(0);selected=puzzle.findIndex(v=>!v);done=false;started=Date.now();draw();}
 board.addEventListener('click',e=>{const b=(e.target as Element).closest<HTMLButtonElement>('.sudoku-cell');if(!b)return;selected=Number(b.dataset.index);board.focus({preventScroll:true});draw();});
 pad.addEventListener('click',e=>{const b=(e.target as Element).closest<HTMLButtonElement>('.sudoku-key');if(!b)return;put(Number(b.dataset.value));board.focus({preventScroll:true});});
 board.addEventListener('keydown',e=>{
  const move={ArrowLeft:-1,ArrowRight:1,ArrowUp:-9,ArrowDown:9}[e.key];
  if(move){e.preventDefault();const r=Math.floor(selected/9),c=selected%9;if((move===-1&&c)||(move===1&&c<8)||(move===-9&&r)||(move===9&&r<8))selected+=move;draw();return;}
  if(/^[1-9]$/.test(e.key)){e.preventDefault();put(Number(e.key));return;}
  if(['Backspace','Delete','0'].includes(e.key)){e.preventDefault();put(0);}
 });
 restart();
 return {element,focusTarget:board,restart,hint:'Pick a square, then type or tap a number.'};
}
