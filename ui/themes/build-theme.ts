import selected,{manifest} from '../selected-theme/index.ts';
import {BUILD_THEME_CONTRACT_VERSION,type BuildTheme,type ThemeAppletContext} from './build-theme-contract.ts';
const theme:BuildTheme=selected;
if(theme.contractVersion!==BUILD_THEME_CONTRACT_VERSION||theme.id!==manifest.id)throw Error('Unsupported build theme contract');
/** Build selection is immutable. No runtime theme downloading or switching. */
export const BUILD_THEME_ID=theme.id;
export function renderBuildTheme(context:ThemeAppletContext){
 document.documentElement.dataset.buildTheme=theme.id;
 if(!manifest.applets.includes(context.applet.id))return false;
 try{
  const mount=theme.renderApplet(context);
  if(!mount)return false;
  return {dispose(){try{mount.dispose();}catch(error){console.warn('Build theme cleanup failed',error);}}};
 }catch(error){console.warn('Build theme renderer failed; using shared content',error);context.host.replaceChildren();return false;}
}
