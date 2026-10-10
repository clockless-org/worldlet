import {activeBuildTheme} from '../themes/index.ts';
import {createModuleScene as createVillageScene} from './pixi-world.ts';
import {createModuleScene as createThemeScene} from './build-theme-world.ts';
/** The built-in Village is the animated Pixi World; every other theme is a package drawn through the Theme contract. */
export function createModuleScene(host,rooms,onPick,onProject,pages,options):any {
 return (activeBuildTheme().package?createThemeScene:createVillageScene)(host,rooms,onPick,onProject,pages,options);
}
