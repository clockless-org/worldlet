/** Shared Minesweeper decisions. Time and randomness are supplied by the caller; no DOM or timers. */
export const MINE_FIELDS={compact:{columns:6,rows:5,mines:10,label:'Custom · 6 × 5'},classic:{columns:10,rows:10,mines:14,label:'Classic · 10 × 10'}} as const;
export type MineFieldKey=keyof typeof MINE_FIELDS;
export type MineField={columns:number;rows:number;mines:number};
export interface MineState {field:MineField;mines:ReadonlySet<number>;opened:ReadonlySet<number>;flags:ReadonlySet<number>;status:'ready'|'playing'|'won'|'lost';startedAt:number|null;endedAt:number|null;boom:number|null}
export function newMineState(field:MineField):MineState{
 const {columns:w,rows:h,mines}=field;
 if(![w,h,mines].every(Number.isInteger)||w<2||h<2||w>30||h>30||mines<1||mines>w*h-Math.min(3,w)*Math.min(3,h))throw Error('Invalid mine field');
 return {field:{columns:w,rows:h,mines},mines:new Set(),opened:new Set(),flags:new Set(),status:'ready',startedAt:null,endedAt:null,boom:null};
}
export function mineNeighbours(state:MineState,index:number){
 const {columns:w,rows:h}=state.field,x=index%w,y=Math.floor(index/w),out:number[]=[];
 for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const nx=x+dx,ny=y+dy;if((dx||dy)&&nx>=0&&ny>=0&&nx<w&&ny<h)out.push(ny*w+nx);}
 return out;
}
export const nearbyMines=(state:MineState,index:number)=>mineNeighbours(state,index).filter(i=>state.mines.has(i)).length;
export const elapsedMineSeconds=(state:MineState,now:number)=>state.startedAt===null?0:Math.max(0,Math.floor(((state.endedAt??now)-state.startedAt)/1000));
export function actOnMine(state:MineState,index:number,action:'dig'|'flag',now:number,random:()=>number=Math.random):MineState{
 const total=state.field.columns*state.field.rows;
 if(!Number.isInteger(index)||index<0||index>=total||!Number.isFinite(now)||state.status==='lost'||state.status==='won')return state;
 if(action==='flag'){
  if(state.opened.has(index))return state;const flags=new Set(state.flags);if(flags.has(index))flags.delete(index);else flags.add(index);return {...state,flags};
 }
 if(state.flags.has(index))return state;
 const next={...state,opened:new Set(state.opened)};
 if(state.status==='ready'){
  const keep=new Set([index,...mineNeighbours(state,index)]),available=Array.from({length:total},(_,i)=>i).filter(i=>!keep.has(i));
  // A bounded shuffle also terminates for a constant random source.
  for(let n=available.length-1;n>0;n--){const value=random(),j=Math.floor(Math.max(0,Math.min(.999999999999,Number.isFinite(value)?value:0))*(n+1));[available[n],available[j]]=[available[j],available[n]];}
  next.mines=new Set(available.slice(0,state.field.mines));next.status='playing';next.startedAt=now;
 }
 function reveal(i:number){
  if(next.status==='lost'||next.opened.has(i)||next.flags.has(i))return;
  if(next.mines.has(i)){next.status='lost';next.endedAt=now;next.boom=i;return;}
  const stack=[i];while(stack.length){const j=stack.pop()!;if(next.opened.has(j)||next.flags.has(j))continue;next.opened.add(j);if(!nearbyMines(next,j))for(const n of mineNeighbours(next,j))if(!next.opened.has(n))stack.push(n);}
 }
 if(next.opened.has(index)){const neighbours=mineNeighbours(next,index);if(neighbours.filter(i=>next.flags.has(i)).length!==nearbyMines(next,index))return state;for(const i of neighbours)reveal(i);}else reveal(index);
 if(next.status==='playing'&&next.opened.size===total-state.field.mines){next.status='won';next.endedAt=now;}
 return next;
}
