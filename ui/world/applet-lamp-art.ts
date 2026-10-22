import {ACTIVE_THEME,themeAppletArt,villageThemeData,activeBuildTheme,type ThemeDeviceFeature} from '../style/index.ts';
/** Where each device's lamp sits in the Village art (the theme package's lamps.json). */
const registry=villageThemeData<{applets:Record<string,ThemeDeviceFeature>}>('lamps.json');
export {lampColors,lampOpacity,type LampState} from './applet-lamp.ts';
export function lampAnchor(key:string):ThemeDeviceFeature|undefined{
 if(activeBuildTheme().id!==ACTIVE_THEME.pack.id)return undefined;
 return ACTIVE_THEME.pack.id==='village'?registry.applets[key] as ThemeDeviceFeature|undefined:ACTIVE_THEME.pack.applets.deviceEffects?.[themeAppletArt(ACTIVE_THEME,key).peek]?.lamp;
}
