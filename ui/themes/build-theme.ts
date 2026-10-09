import selected,{manifest,presentation as presentationJSON} from '../selected-theme/index.ts';
import {BUILD_THEME_CONTRACT_VERSION,parseThemePresentation,type BuildTheme,type ThemeAppletContext,type ThemeWorldContext,type ThemeScene} from './build-theme-contract.ts';
const theme:BuildTheme=selected;
if(theme.contractVersion!==BUILD_THEME_CONTRACT_VERSION||theme.id!==manifest.id)throw Error('Unsupported build theme contract');
export const BUILD_THEME_ID=theme.id;
export const BUILD_THEME_PRESENTATION=parseThemePresentation(presentationJSON);
export function applyBuildThemeScene(scene:ThemeScene){
 const root=document.documentElement;root.dataset.buildTheme=theme.id;
 for(const [key,value] of Object.entries(BUILD_THEME_PRESENTATION.tokens))root.style.setProperty('--sim-'+key.replace(/[A-Z]/g,c=>'-'+c.toLowerCase()),typeof value==='number'?value+'px':value);
 for(const [name,rect] of Object.entries(scene.hud)){root.dataset['sim'+name[0].toUpperCase()+name.slice(1)]=rect==='shared'?'shared':'placed';if(rect==='shared')continue;for(const [i,axis] of ['x','y','width','height'].entries())root.style.setProperty(`--sim-${name}-${axis}`,rect[i]*100+'%');}
}
export function renderBuildWorld(context:Omit<ThemeWorldContext,'scene'>){
 applyBuildThemeScene(BUILD_THEME_PRESENTATION.world);
 return theme.renderWorld({...context,scene:BUILD_THEME_PRESENTATION.world});
}
export function renderBuildTheme(context:Omit<ThemeAppletContext,'scene'>){
 const scene=BUILD_THEME_PRESENTATION.applets[context.applet.id]||BUILD_THEME_PRESENTATION.fallback;
 applyBuildThemeScene(scene);
 try{return theme.renderApplet({...context,scene});}
 catch(error){console.error('Sim applet renderer failed',error);context.host.replaceChildren();const message=document.createElement('p');message.setAttribute('role','alert');message.textContent='This scene could not be displayed.';context.host.append(message);return {dispose(){message.remove();}};}
}
