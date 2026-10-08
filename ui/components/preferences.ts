import {UI_TOKENS} from './tokens.ts';
const key='worldlet-ui-text-scale';
export function applyTextScale(root: HTMLElement,scale: number|string=1){scale=[1,1.25,1.5,2].includes(Number(scale))?Number(scale):1;root.dataset.textScale=String(scale);for(const [name,value]of Object.entries(UI_TOKENS))if(name.startsWith('text-'))root.style.setProperty('--ui-'+name,parseFloat(value)*scale+'px');}
export function restoreTextScale(root){try{applyTextScale(root,localStorage.getItem(key));}catch{applyTextScale(root);}}
