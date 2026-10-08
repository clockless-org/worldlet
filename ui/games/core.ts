// The part of a game that needs no panel: what it sees of its host, best scores and the
// frame loop. The app's game panel and the served games at worldlet.ai/games share it.
/** What a game sees of its panel: a status line, a remembered best and a way to start over. */
export type GameHost={status:(text:string)=>void;best:{get:()=>number;set:(value:number)=>void}};
export type Game={element:HTMLElement;restart:()=>void;hint:string;resetLabel?:string;focusTarget?:HTMLElement};

/** Best scores are a per-viewer convenience; storage can be missing or blocked. */
export function bestScore(key:string){
 const name='worldlet-game-best:'+key;
 return {get(){try{return Number(localStorage.getItem(name))||0;}catch{return 0;}},set(value:number){try{localStorage.setItem(name,String(value));}catch{}}};
}

/**
 * A frame loop that exists only while its game is on screen. It never schedules itself
 * once the board leaves the document, the window is hidden or the game says stop, so a
 * closed game costs nothing; the next key or tap on the board starts it again.
 */
export function gameLoop(board:HTMLElement,step:(dt:number)=>boolean){
 let frame=0,last=0;
 const live=()=>board.isConnected&&!document.hidden&&board.getClientRects().length>0;
 function tick(now:number){
  frame=0;if(!live())return;
  const dt=last?Math.min(50,now-last):16;last=now;
  if(step(dt))frame=requestAnimationFrame(tick);
 }
 return {
  start(){if(!frame&&live()){last=0;frame=requestAnimationFrame(tick);}},
  stop(){if(frame)cancelAnimationFrame(frame);frame=0;},
  get running(){return !!frame;}
 };
}
