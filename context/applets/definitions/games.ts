import type {AppletDefinition} from '../../../contracts/world.ts';
// The Games area's own Applets: small games written for Worldlet that need no account and
// read nothing. fullView 'game' mounts the board from ui/applets/games.ts and runs offline.
const game=(key:string,title:string,description:string,color:string):AppletDefinition=>({
 id:'app-'+key,key,title,region:'health',version:1,description,purpose:description,
 fullView:{kind:'game'},
 scene:{template:'game-board',color,renderer:'painted-device',version:1},
 connection:{kind:'none',provider:null,capability:'local'},
 content:{activity:'Playing'},
 game:true
});
// The Random game is the one that needs the network: it opens worldlet.ai/games/random/,
// which lands in a different served game each time (website/games/README.md).
export const RANDOM_GAME_URL='https://worldlet.ai/games/random/';
export const GAME_APPLETS:readonly AppletDefinition[]=[
 game('game-2048','2048','Slide the numbered tiles; equal ones merge. Reach 2048.','#e3b04b'),
 game('snake','Snake','Steer the snake through the garden and eat the apples without biting your tail.','#5c9a7b'),
 game('minesweeper','Minesweeper','Clear the field without digging up a mine. The numbers tell you how many are near.','#8a9a7a'),
 game('sudoku','Sudoku','Fill the grid so every row, column and box holds 1 to 9. A new puzzle every game.','#4f7f9e'),
 {...game('random-game','Random game','A different small game from worldlet.ai/games each time it opens.','#c8553d'),fullView:{kind:'web',url:RANDOM_GAME_URL,platform:'web'},focusPresentation:'world-device',connection:{kind:'embedded-browser',provider:null,capability:'browser'}},
];
