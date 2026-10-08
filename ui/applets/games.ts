import {GAME_BOARDS} from '../games/index.ts';
import {createGamePanel} from './_shared/game-panel.ts';

// The Games area's boards (catalog fullView.kind 'game'; the Random game is a website). Each one is our own code,
// runs offline with no account, and is built when opened and dropped when closed.
export function createGameApplet(key:string,title:string){
 const create=GAME_BOARDS[key];if(!create)return null;
 return createGamePanel({key,title,create});
}
