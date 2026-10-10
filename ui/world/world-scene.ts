import {createModuleScene as createThemeScene} from './build-theme-world.ts';
/** Every theme's World, the Village included, is drawn through the Theme contract adapter. */
export function createModuleScene(host,rooms,onPick,onProject,pages,options):any {
 return createThemeScene(host,rooms,onPick,onProject,pages,options);
}
