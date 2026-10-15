import icons from './symbols.json' with {type:'json'};
import type {GameSymbol} from './core.ts';
/** Unmodified Bootstrap Icons geometry (https://icons.getbootstrap.com/); see ICONS-LICENSE.txt. */
export function gameSymbol(name:GameSymbol){const span=document.createElement('span');span.className='game-symbol';span.setAttribute('aria-hidden','true');span.innerHTML=icons[name];return span;}
