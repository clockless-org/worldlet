/** Python's `html.unescape` and its HTML5 entity table, shared with the Gmail reader (html-parser.ts, html-entities.ts). */
import {HTML5_ENTITIES} from './html-entities.ts';
export {unescape} from './html-parser.ts';
export const htmlEntities=()=>new Map(Object.entries(HTML5_ENTITIES));
