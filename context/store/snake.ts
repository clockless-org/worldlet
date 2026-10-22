/** Snake decisions shared by the ordinary board and projected scenes; no DOM, clock or timer. */
export type SnakePoint=readonly [number,number];
export type SnakeField='classic'|'wide';
export const SNAKE_STEP_MS=120;
export interface SnakeState {columns:number;rows:number;body:readonly SnakePoint[];direction:SnakePoint;queued:readonly SnakePoint[];food:SnakePoint|null;score:number;status:'ready'|'playing'|'paused'|'over'|'won'}
const equal=(a:SnakePoint,b:SnakePoint)=>a[0]===b[0]&&a[1]===b[1];
function foodFor(state:SnakeState,random:()=>number){
 const free:SnakePoint[]=[];for(let x=0;x<state.columns;x++)for(let y=0;y<state.rows;y++)if(!state.body.some(p=>equal(p,[x,y])))free.push([x,y]);
 if(!free.length)return null;const n=random();return free[Math.floor(Math.max(0,Math.min(.999999999999,Number.isFinite(n)?n:0))*free.length)];
}
export function newSnakeState(field:SnakeField='classic',random:()=>number=Math.random):SnakeState{
 const wide=field==='wide',body:SnakePoint[]=wide?[[7,7],[6,7],[5,7],[4,7],[4,6],[4,5],[4,4]]:[[6,9],[5,9],[4,9]];
 const state:SnakeState={columns:wide?16:18,rows:wide?12:18,body,direction:[1,0],queued:[],food:null,score:0,status:'ready'};
 state.food=wide?[11,6]:foodFor(state,random);return state;
}
export function steerSnake(state:SnakeState,direction:SnakePoint):SnakeState{
 if(state.status==='won'||state.status==='over'||!direction.every(Number.isInteger)||Math.abs(direction[0])+Math.abs(direction[1])!==1)return state;
 const last=state.queued.at(-1)||state.direction;if(direction[0]===-last[0]&&direction[1]===-last[1])return state;
 const queued=state.queued.length<2&&!equal(last,direction)?[...state.queued,direction]:state.queued;
 return {...state,queued,status:'playing'};
}
export function pauseSnake(state:SnakeState):SnakeState{return state.status==='playing'?{...state,status:'paused'}:state;}
export function stepSnake(state:SnakeState,random:()=>number=Math.random):SnakeState{
 if(state.status!=='playing')return state;
 const direction=state.queued[0]||state.direction,head:SnakePoint=[state.body[0][0]+direction[0],state.body[0][1]+direction[1]],eats=!!state.food&&equal(head,state.food),body=eats?state.body:state.body.slice(0,-1);
 if(head[0]<0||head[1]<0||head[0]>=state.columns||head[1]>=state.rows||body.some(p=>equal(p,head)))return {...state,status:'over',direction,queued:[]};
 const next:SnakeState={...state,body:[head,...body],direction,queued:state.queued.slice(1),score:state.score+(eats?1:0)};
 if(eats){next.food=foodFor(next,random);if(!next.food)next.status='won';}return next;
}
