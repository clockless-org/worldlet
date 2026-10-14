import {BrowserWindow,session} from 'electron';
import {RTC_PAGE} from './rtc-page.ts';
import type {RtcPage} from './rtc-host.ts';

// The hidden window that runs the computer's side of browsers' direct lines (rtc-host.ts): no page of the World, no
// permissions, nothing it may open or navigate to. It exists only while a browser has a line.
export function openRtcWindow():RtcPage{
 const quiet=session.fromPartition('worldlet-rtc');
 quiet.setPermissionRequestHandler((_contents,_permission,answer)=>answer(false));
 const window=new BrowserWindow({show:false,width:1,height:1,frame:false,focusable:false,skipTaskbar:true,
  webPreferences:{session:quiet,contextIsolation:true,sandbox:true,nodeIntegration:false,spellcheck:false,backgroundThrottling:false}});
 window.webContents.setWindowOpenHandler(()=>({action:'deny'}));
 window.webContents.on('will-navigate',event=>event.preventDefault());
 // A page that crashed takes its lines with it (rtc-host.ts closes them when the page stops answering).
 window.webContents.on('render-process-gone',()=>{if(!window.isDestroyed())window.destroy();});
 const ready=window.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent(RTC_PAGE));
 // What was still running when the window went fails, so nothing waits on it.
 const closed=new Promise<never>((_resolve,reject)=>window.once('closed',()=>reject(new Error('closed'))));
 closed.catch(()=>{});
 return {
  run:code=>Promise.race([closed,ready.then(()=>window.isDestroyed()?Promise.reject(new Error('closed')):window.webContents.executeJavaScript(code,false))]),
  close:()=>{if(!window.isDestroyed())window.destroy();},
 };
}
