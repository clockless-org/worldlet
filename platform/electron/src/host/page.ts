import type {WebContents} from 'electron';
import {trustedWorldURL} from '../world/protocol.ts';
import type {PageBridge} from './types.ts';
/** JSON that is also a valid JavaScript expression (U+2028/2029 escaped). */
export const scriptJSON=(value:unknown)=>JSON.stringify(value===undefined?null:value).replace(/[\u2028\u2029]/g,c=>'\\u'+c.charCodeAt(0).toString(16));
/** Calls page globals in the trusted World document only; a navigated-away page receives nothing. */
export function createPageBridge(contents:()=>WebContents|null,log:(line:string)=>void):PageBridge {
 const target=()=>{const web=contents();return web&&!web.isDestroyed()&&trustedWorldURL(web.getURL())?web:null;};
 const run=async(code:string)=>{const web=target();if(!web)return undefined;try{return await web.executeJavaScript(code,true);}catch(error){log('Page update failed: '+error.message);return undefined;}};
 return {
  call:(name,...args)=>run(`(async()=>{const f=window[${scriptJSON(name)}];return typeof f==='function'?await f(...${scriptJSON(args)}):undefined;})()`) as any,
  event:(name,detail)=>{void run(detail===undefined?`window.dispatchEvent(new Event(${scriptJSON(name)}))`:`window.dispatchEvent(new CustomEvent(${scriptJSON(name)},{detail:${scriptJSON(detail)}}))`);},
  documentEvent:(name,detail)=>{void run(detail===undefined?`document.dispatchEvent(new Event(${scriptJSON(name)}))`:`document.dispatchEvent(new CustomEvent(${scriptJSON(name)},{detail:${scriptJSON(detail)}}))`);},
  ready:()=>target()!==null
 };
}
