import {STYLE_TOKENS} from './style.ts';
// Public UI API retained; appearance data belongs to the built-in style.
export const WORLD_UI=STYLE_TOKENS.worldUI;
export const UI_TOKENS=STYLE_TOKENS.ui;
export const UI_NIGHT_TOKENS=STYLE_TOKENS.night;
export const UI_FONT=STYLE_TOKENS.font;
export async function prepareUIFonts(){try{await document.fonts.load('500 16px '+UI_FONT);await document.fonts.ready;}catch{ /* Keep the app usable if font loading is unavailable. */ }}
export function uiTokenCSS(){
 const declarations=tokens=>Object.entries(tokens).map(([k,v])=>'--ui-'+k+':'+v).join(';');
 const aliases=Object.fromEntries(Object.entries(UI_TOKENS).filter(([,value])=>value.includes('var(')));
 return ':root{'+declarations(UI_TOKENS)+'}\n.native-console,.ui-gallery{'+declarations(aliases)+'}\n.native-console[data-time-of-day=night],.ui-gallery[data-theme=night]{'+declarations(UI_NIGHT_TOKENS)+'}';
}
