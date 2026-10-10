import registry from '../../resources/styles/builtin/applet-lamps.json' with {type:'json'};
import {ACTIVE_THEME,themeAppletArt,type ThemeDeviceFeature} from '../themes/index.ts';
export {lampColors,lampOpacity,type LampState} from './applet-lamp.ts';
export function lampAnchor(key:string):ThemeDeviceFeature|undefined{
 return ACTIVE_THEME.pack.id==='village'?registry.applets[key] as ThemeDeviceFeature|undefined:ACTIVE_THEME.pack.applets.deviceEffects?.[themeAppletArt(ACTIVE_THEME,key).peek]?.lamp;
}
