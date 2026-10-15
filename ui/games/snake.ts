import {SNAKE_STEP_MS,newSnakeState,steerSnake,pauseSnake,stepSnake,type SnakeField,type SnakePoint} from '../../core/games/index.ts';
import {gameLoop,onSwipe,type GameHost,type Game} from './core.ts';
import {gameSymbol} from './symbols.ts';
import {snakeView} from './snake-view.ts';
const DIRS:Record<string,SnakePoint>={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1],a:[-1,0],d:[1,0],w:[0,-1],s:[0,1]};
/** Input, focus and painting only. Core owns movement, collision, food and score. */
export function createSnake(host:GameHost,field:SnakeField='classic'):Game{
 const board=document.createElement('div');board.className='game-board snake-board';board.tabIndex=0;board.setAttribute('aria-label','Snake. Use arrow keys or swipe to steer. Space pauses or resumes.');
 const draw=snakeView(board),overlay=document.createElement('p');overlay.className='game-overlay';board.append(overlay);
 const actions=document.createElement('nav');actions.className='game-actions';actions.setAttribute('aria-label','Game actions');const toggle=document.createElement('button');toggle.type='button';actions.append(toggle);
 let state=newSnakeState(field),acc=0,disposed=false;const memory={value:0},best=field==='classic'?host.best:host.best.scope?.('wide')||{get:()=>memory.value,set:(n:number)=>{memory.value=n;}};
 function status(){
  if(state.score>best.get())best.set(state.score);const record=best.get(),notice=state.status==='ready'?'Arrow keys to move · Space to pause':state.status==='paused'?'Paused · Space or an arrow to resume':state.status==='over'?'Game over · Start a new game':state.status==='won'?'Board complete! · Start a new game':'';
  host.status((state.status==='over'?'Game over · ':state.status==='won'?'Board complete · ':'')+`Apples ${state.score} · Best ${record}`);host.metrics?.([{label:'Score',value:state.score},{label:'Best',value:record}],notice);
  overlay.textContent=notice;overlay.hidden=state.status==='playing';board.dataset.state=state.status;
  const label=state.status==='playing'?'Pause':state.status==='ready'?'Start game':'Resume';toggle.setAttribute('aria-label',label);toggle.title=label;toggle.disabled=state.status==='over'||state.status==='won';toggle.textContent='';toggle.append(gameSymbol(state.status==='playing'?'pause':'play'));
 }
 const loop=gameLoop(board,dt=>{if(disposed||state.status!=='playing')return false;acc+=dt;let changed=false;while(acc>=SNAKE_STEP_MS&&state.status==='playing'){acc-=SNAKE_STEP_MS;const previous=state;state=stepSnake(state);changed=true;if(previous.score!==state.score||previous.status!==state.status)status();}if(changed)draw(state);return state.status==='playing';});
 function steer(direction:SnakePoint){if(disposed)return;const previous=state;state=steerSnake(state,direction);if(state===previous)return;if(previous.status!=='playing')acc=0;status();loop.start();}
 function pause(){if(disposed)return;const next=pauseSnake(state);if(next===state)return;state=next;loop.stop();status();}
 function togglePause(){if(state.status==='playing')pause();else steer(state.direction);}
 function restart(){if(disposed)return;loop.stop();acc=0;state=newSnakeState(field);status();draw(state);}
 board.addEventListener('keydown',event=>{const direction=DIRS[event.key];if(direction){event.preventDefault();steer(direction);}else if(event.key===' '){event.preventDefault();togglePause();}});
 board.addEventListener('blur',pause);const hidden=()=>{if(document.hidden)pause();};document.addEventListener('visibilitychange',hidden);
 toggle.addEventListener('pointerdown',event=>event.preventDefault());toggle.addEventListener('click',()=>{board.focus({preventScroll:true});togglePause();});
 onSwipe(board,20,(dx,dy)=>steer([dx,dy]));restart();
 return {element:board,restart,actions,directions:([{direction:'up',icon:'arrow-up',run:()=>steer([0,-1])},{direction:'down',icon:'arrow-down',run:()=>steer([0,1])},{direction:'left',icon:'arrow-left',run:()=>steer([-1,0])},{direction:'right',icon:'arrow-right',run:()=>steer([1,0])}]),hint:'Arrow keys to move · Space to pause',dispose(){disposed=true;loop.stop();document.removeEventListener('visibilitychange',hidden);}};
}
