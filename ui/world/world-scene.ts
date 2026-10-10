import {activeBuildTheme} from '../themes/index.ts';
import {createModuleScene as createVillageScene} from './pixi-world.ts';
import {createModuleScene as createThemeScene} from './build-theme-world.ts';
import {shellInteraction,worldPaused} from './shell-interaction.ts';
/** The built-in Village is the animated Pixi World; every other theme is a package drawn through the Theme contract. */
export function createModuleScene(host,rooms,onPick,onProject,pages,options):any {
 if(activeBuildTheme().package)return createThemeScene(host,rooms,onPick,onProject,pages,options);
 return createVillageScene(host,rooms,onPick,onProject,pages,{...options,interaction:()=>({...shellInteraction(host),paused:worldPaused()})});
}
