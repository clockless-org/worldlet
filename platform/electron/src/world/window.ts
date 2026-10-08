import path from 'node:path';
import {BaseWindow,WebContentsView,screen,session,shell,type Rectangle} from 'electron';
import {WORLD_URL,serveWorld,trustedWorldURL} from './protocol.ts';
import type {Profile} from '../profile.ts';
import {backgroundLaunch} from '../background-launch.ts';

export interface WorldWindowHooks {
 openURL(url:string):void;
 loaded():void;
 navigating():void;
 /** Return true to keep the window from closing (e.g. Fox stays as the desktop Companion). */
 closing():boolean;
 activated(active:boolean):void;
 resized(bounds:Rectangle):void;
}
/** Every World window opens at the shared 1920×1080 logical design size (content area), scaled down
 * with the same aspect to fit the display's usable area. The size is not remembered between launches. */
export const WORLD_SIZE={width:1920,height:1080};
export function defaultWorldSize(area:{width:number,height:number}){
 const scale=Math.min(1,area.width/WORLD_SIZE.width,area.height/WORLD_SIZE.height);
 return {width:Math.round(WORLD_SIZE.width*scale),height:Math.round(WORLD_SIZE.height*scale)};
}
// On Mac the World fills the hidden title bar, so its top strip moves the window as the native title
// bar did. Controls inside the strip (the top bar's Back and Applet buttons) stay clickable.
const TITLE_BAR_DRAG=`html::before{content:'';position:fixed;top:0;left:0;right:0;height:32px;-webkit-app-region:drag;pointer-events:none;z-index:2147483647}
button,a,input,select,textarea,label,[role=button],[contenteditable],[tabindex]{-webkit-app-region:no-drag}`;
/** The trusted World page in its own Chromium view. Website views are siblings, never iframes. */
export class WorldWindow {
 readonly window:BaseWindow;
 readonly view:WebContentsView;
 readonly profile:Profile;
 /** `quiet`: launched by the login item (#1229), so the World opens minimized without taking focus. */
 constructor(profile:Profile,preload:string,hooks:WorldWindowHooks,{quiet=false}:{quiet?:boolean}={}){
  this.profile=profile;
  const mac=process.platform==='darwin';
  this.window=new BaseWindow({
   ...defaultWorldSize(screen.getPrimaryDisplay().workAreaSize),useContentSize:true,center:true,minWidth:960,minHeight:600,title:profile.title,show:false,backgroundColor:'#20251d',
   // Windows takes the icon embedded in Worldlet.exe by the packager.
   ...(mac?{titleBarStyle:'hiddenInset' as const,trafficLightPosition:{x:18,y:18}}:{})
  });
  const worldSession=session.fromPartition('persist:world');
  serveWorld(worldSession,()=>profile.webRoot);
  // The World needs no device or notification permissions; speech capture is host-owned.
  worldSession.setPermissionRequestHandler((_contents,_permission,answer)=>answer(false));
  worldSession.setPermissionCheckHandler(()=>false);
  this.view=new WebContentsView({webPreferences:{preload,session:worldSession,contextIsolation:true,sandbox:true,nodeIntegration:false,webSecurity:true,spellcheck:false,backgroundThrottling:false}});
  this.view.setBackgroundColor('#20251d');
  this.window.contentView.addChildView(this.view);
  const layout=()=>{const [width,height]=this.window.getContentSize();this.view.setBounds({x:0,y:0,width,height});hooks.resized(this.view.getBounds());};
  this.window.on('resize',layout);layout();
  const contents=this.view.webContents;
  // Main-document navigation can never replace the World with a website.
  contents.on('will-navigate',(event,url)=>{if(!trustedWorldURL(url)){event.preventDefault();if(/^https?:/i.test(url))hooks.openURL(url);}});
  contents.on('will-redirect',(event,url)=>{if(!trustedWorldURL(url))event.preventDefault();});
  contents.on('did-start-navigation',details=>{if(details.isMainFrame&&!details.isSameDocument)hooks.navigating();});
  contents.setWindowOpenHandler(({url})=>{if(/^https:/i.test(url))hooks.openURL(url);else if(/^mailto:/i.test(url))void shell.openExternal(url);return {action:'deny'};});
  contents.on('dom-ready',()=>{if(mac&&trustedWorldURL(contents.getURL()))void contents.insertCSS(TITLE_BAR_DRAG,{cssOrigin:'user'});});
  contents.on('did-finish-load',()=>{if(trustedWorldURL(contents.getURL()))hooks.loaded();});
  const show=()=>{if(this.window.isDestroyed())return;if(backgroundLaunch()){this.window.showInactive();return;}if(!quiet){this.window.show();return;}if(!this.window.isVisible()&&!this.window.isMinimized()){this.window.showInactive();this.window.minimize();}};
  contents.once('did-finish-load',show);
  // A page that never paints must still show its window and loader.
  setTimeout(()=>{if(!this.window.isDestroyed()&&!this.window.isVisible())show();},4000);
  contents.on('render-process-gone',(_event,details)=>{if(details.reason!=='clean-exit')setTimeout(()=>{if(!contents.isDestroyed())void contents.loadURL(WORLD_URL);},500);});
  this.window.on('close',event=>{if(hooks.closing())event.preventDefault();});
  this.window.on('focus',()=>hooks.activated(true));
  this.window.on('blur',()=>hooks.activated(false));
 }
 load(){return this.view.webContents.loadURL(WORLD_URL);}
 reload(){return this.view.webContents.loadURL(WORLD_URL);}
}
