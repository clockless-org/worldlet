import {MINE_FIELDS,newMineState,nearbyMines,elapsedMineSeconds,actOnMine,type MineFieldKey} from '../../context/store/index.ts';
import {clock,gameLoop,type GameHost,type Game} from './core.ts';
import {gameSymbol} from './symbols.ts';

/** Shared offline board. Rules are pure Core decisions; this adapter owns input and repainting. */
export function createMinesweeper(host:GameHost,initial:MineFieldKey='classic'):Game{
 const board=document.createElement('div');board.className='game-board mines-board';board.tabIndex=0;
 board.setAttribute('role','group');board.setAttribute('aria-label','Minesweeper. Enter to reveal, F or right-click to flag. Arrow keys move between tiles.');
 const settings=document.createElement('select');settings.className='game-settings';settings.setAttribute('aria-label','Board size');
 for(const [key,field] of Object.entries(MINE_FIELDS)){const option=document.createElement('option');option.value=key;option.textContent=field.label;settings.append(option);}settings.value=initial;
 const controls=document.createElement('nav');controls.className='game-modes';controls.setAttribute('aria-label','Tile action');
 let fieldKey=initial,state=newMineState(MINE_FIELDS[fieldKey]),mode:'dig'|'flag'='dig',press=0,pressed=false,disposed=false,lastSeconds=-1;
 const cells:HTMLButtonElement[]=[],modeButtons:HTMLButtonElement[]=[];
 // A small field must never replace a classic field's best time, including in hosts without scoped storage.
 const ephemeral={value:0},compactBest=host.best.scope?.('compact')||{get:()=>ephemeral.value,set:(n:number)=>{ephemeral.value=n;}};
 const best=()=>fieldKey==='classic'?host.best:compactBest;
 for(const action of ['dig','flag'] as const){const button=document.createElement('button');button.type='button';button.dataset.action=action;button.append(gameSymbol(action==='dig'?'mine':'flag'),document.createTextNode(action==='dig'?'Reveal':'Flag'));button.addEventListener('click',()=>{mode=action;updateModes();});controls.append(button);modeButtons.push(button);}
 function updateModes(){for(const button of modeButtons)button.setAttribute('aria-pressed',String(button.dataset.action===mode));}
 function publish(){
  const seconds=elapsedMineSeconds(state,Date.now()),record=best().get();lastSeconds=seconds;
  const notice=state.status==='ready'?'Choose a tile to begin.':state.status==='won'?`Cleared in ${clock(seconds)} · Best ${clock(record)}`:state.status==='lost'?'Boom. Press New game to try again.':'Find the mines. Flag before you reveal.';
  host.status(state.status==='playing'?`Mines ${state.field.mines-state.flags.size} left · ${clock(seconds)}`:notice);
  host.metrics?.([{label:'Mines',value:state.field.mines-state.flags.size,icon:'mine'},{label:'Time',value:clock(seconds).padStart(5,'0'),icon:'clock'}],notice);
 }
 const loop=gameLoop(board,()=>{if(disposed||state.status!=='playing')return false;if(elapsedMineSeconds(state,Date.now())!==lastSeconds)publish();return true;});
 const visibility=()=>{if(document.hidden)loop.stop();else if(state.status==='playing')loop.start();};document.addEventListener('visibilitychange',visibility);
 function act(index:number,action:'dig'|'flag'){
  if(disposed)return;const previous=state.status;state=actOnMine(state,index,action,Date.now());
  if(previous!=='won'&&state.status==='won'){const seconds=Math.max(1,elapsedMineSeconds(state,Date.now())),record=best().get();if(!record||seconds<record)best().set(seconds);}
  draw();if(state.status==='playing')loop.start();else loop.stop();
 }
 function draw(){
  cells.forEach((button,index)=>{
   const shown=state.opened.has(index),mine=state.status==='lost'&&state.mines.has(index),count=shown?nearbyMines(state,index):0;
   const kind=shown?'open':mine?'mine':state.flags.has(index)?'flag':'closed';button.dataset.state=kind;button.dataset.count=count?String(count):'';button.classList.toggle('is-boom',index===state.boom);
   button.textContent=count?String(count):'';if(kind==='flag'||kind==='mine')button.append(gameSymbol(kind));
   const description=kind==='closed'?'hidden':kind==='flag'?'flagged':kind==='mine'?'mine':count?count+' mines near':'clear';
   button.setAttribute('aria-label',`Row ${Math.floor(index/state.field.columns)+1}, column ${index%state.field.columns+1}: ${description}`);
  });board.dataset.state=state.status;publish();
 }
 function restart(){
  clearTimeout(press);pressed=false;loop.stop();state=newMineState(MINE_FIELDS[fieldKey]);mode='dig';updateModes();
  board.style.setProperty('--cols',String(state.field.columns));board.style.setProperty('--rows',String(state.field.rows));
  if(cells.length!==state.field.columns*state.field.rows){board.textContent='';cells.length=0;for(let i=0;i<state.field.columns*state.field.rows;i++){const button=document.createElement('button');button.type='button';button.className='mines-cell';button.dataset.index=String(i);board.append(button);cells.push(button);}}
  draw();
 }
 settings.addEventListener('change',()=>{fieldKey=settings.value as MineFieldKey;restart();});
 board.addEventListener('click',event=>{const button=(event.target as Element).closest<HTMLButtonElement>('.mines-cell');if(button)act(Number(button.dataset.index),mode);});
 board.addEventListener('contextmenu',event=>{const button=(event.target as Element).closest<HTMLButtonElement>('.mines-cell');if(!button)return;event.preventDefault();act(Number(button.dataset.index),'flag');});
 board.addEventListener('keydown',event=>{
  const button=(event.target as Element).closest<HTMLButtonElement>('.mines-cell'),index=button?Number(button.dataset.index):0;
  if(event.key.toLowerCase()==='f'&&button){event.preventDefault();act(index,'flag');}
  const w=state.field.columns,row=Math.floor(index/w),col=index%w;
  const next=event.key==='ArrowLeft'?row*w+Math.max(0,col-1):event.key==='ArrowRight'?row*w+Math.min(w-1,col+1):event.key==='ArrowUp'?Math.max(0,index-w):event.key==='ArrowDown'?Math.min(cells.length-1,index+w):null;
  if(next!==null){event.preventDefault();cells[next].focus({preventScroll:true});}
 });
 // Each new press clears the previous timer and any click suppression left by a cancelled long press.
 board.addEventListener('pointerdown',event=>{clearTimeout(press);pressed=false;if(event.pointerType!=='touch')return;const button=(event.target as Element).closest<HTMLButtonElement>('.mines-cell');if(button)press=window.setTimeout(()=>{pressed=true;act(Number(button.dataset.index),'flag');},420);});
 for(const name of ['pointerup','pointercancel','pointerleave'])board.addEventListener(name,()=>clearTimeout(press));
 board.addEventListener('click',event=>{if(pressed){pressed=false;event.stopImmediatePropagation();}},true);
 restart();
 return {element:board,restart,settings,controls,titleIcon:'mine',hint:'Click uses selected mode · Right click or F to flag',dispose(){disposed=true;clearTimeout(press);loop.stop();document.removeEventListener('visibilitychange',visibility);}};
}
