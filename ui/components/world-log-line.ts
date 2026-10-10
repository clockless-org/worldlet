import type {WorldLogLine} from '../../core/activity/index.ts';
import {getApp} from '../../core/applets/index.ts';
import {uiIcon} from './primitives/icons.ts';
import {node} from './primitives/components.ts';
import {companionStill,themeAppletIcon} from '../themes/index.ts';
/** One world-log line's mark and destination, shared by the World's log and the History page. */
const el:(tag:string,cls?:string)=>any=node;
/** Fox for what Fox did; the Applet's device art when the line belongs to an Applet. */
export function worldLogMark(line:WorldLogLine){
 const icon=el('span','world-log-icon');icon.setAttribute('aria-hidden','true');
 const assets=(globalThis as any).__WORLDLET_25D_ASSETS__,art=line.applet&&(assets?.studies?.find((s:any)=>s.key===line.applet)?.body||themeAppletIcon(line.applet));
 const src=line.who==='fox'?companionStill():art;
 if(src){const img=el('img');img.alt='';img.src=src;img.decoding='async';icon.append(img);}
 else icon.innerHTML=uiIcon(line.site?'compass':line.who==='you'?'people':'spark');
 return icon;
}
/** Where selecting a line goes: its Applet, else the site; nothing for a line with neither. */
export function worldLogGo(line:WorldLogLine,{openApplet,openSite}:{openApplet?:(id:string)=>void;openSite?:(url:string)=>void}){
 const app=line.applet?getApp(line.applet):null;
 if(app&&openApplet)return ()=>openApplet(app.id);
 if(line.site&&openSite)return ()=>openSite('https://'+line.site+'/');
 return null;
}
