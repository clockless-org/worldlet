import {node,actionButton} from '../../components/index.ts';
import {bestScore,type Game,type GameHost} from '../../games/index.ts';

/** Native games float over the Village: a small heading, the board and separate actions. */
export function createGamePanel({key,title,create}:{key:string;title:string;create:(host:GameHost)=>Game}){
 const element=node('section','game-panel'),header=node('header','game-header'),heading=node('h2','game-title',title),meta=node('p','ui-caption'),body=node('div','game-body'),footer=node('footer','game-footer');
 header.append(heading,meta);element.append(header,body,footer);element.dataset.game=key;
 const surface={element,header,meta,body,footer};
 const host:GameHost={status:text=>{surface.meta.textContent=text;},best:bestScore(key)};
 const game=create(host),focus=()=>(game.focusTarget||game.element).focus({preventScroll:true});
 surface.body.append(game.element);
 surface.footer.append(node('span','ui-caption',game.hint),actionButton({label:game.resetLabel||'New game',run:()=>{game.restart();focus();}}));
 // The board takes keys only while it has focus, so a closed game leaves no listener behind.
 queueMicrotask(focus);
 return {element:surface.element};
}
