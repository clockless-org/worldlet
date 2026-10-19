/** Public games interface: the boards and what a game needs from its host. The app's game
 *  panel (ui/applets/games.ts) and the served games at worldlet.ai/games both mount these. */
import type {Game,GameHost} from './core.ts';
import {create2048} from './game-2048.ts';
import {createSnake} from './snake.ts';
import {createMinesweeper} from './minesweeper.ts';
import {createSudoku} from './sudoku.ts';
import {createGarden} from './garden.ts';
export {bestScore,gameLoop,type Game,type GameHost} from './core.ts';

/** The Games area's boards by Applet key; each runs offline with no account. */
export const GAME_BOARDS:Record<string,(host:GameHost)=>Game>={'game-2048':create2048,snake:createSnake,minesweeper:createMinesweeper,sudoku:createSudoku,garden:host=>createGarden(host)};
