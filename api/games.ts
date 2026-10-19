// The games the website lets visitors play (api/README.md). Bundled for the browser, so it names the files that define
// these, not the Applets index, which also carries the Applet pages and the World.
export {GAME_BOARDS} from '../ui/applets/game-boards.ts';
export {bestScore,gameLoop} from '../ui/applets/core.ts';
export type {Game,GameHost} from '../ui/applets/core.ts';
