import {ACTIVE_THEME,themeAppletArt,themeData,type ThemeDeviceFeature} from '../themes/index.ts';
/** Where each device's lamp sits in the Village art (the theme package's lamps.json). */
const registry=themeData<{applets:Record<string,ThemeDeviceFeature>}>('lamps.json');
export {lampColors,lampOpacity,type LampState} from './applet-lamp.ts';
export function lampAnchor(key:string):ThemeDeviceFeature|undefined{
 return ACTIVE_THEME.pack.id==='village'?registry.applets[key] as ThemeDeviceFeature|undefined:ACTIVE_THEME.pack.applets.deviceEffects?.[themeAppletArt(ACTIVE_THEME,key).peek]?.lamp;
}
