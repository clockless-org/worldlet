import fs from 'node:fs';
import path from 'node:path';
import {Menu,Tray,nativeImage,type MenuItemConstructorOptions} from 'electron';
import type {Host} from '../../host/types.ts';

export interface CompanionEntryActions {back():void;quit():void}
interface TrayLike {setToolTip(text:string):void;setContextMenu(menu:Menu|null):void;on(event:'click',listener:()=>void):unknown;destroy():void}
export type TrayFactory=(icon:string)=>TrayLike;

/** Fox's menu, the Dock menu and the Windows notification-area menu share these two items. */
export function companionMenu(actions:CompanionEntryActions):MenuItemConstructorOptions[] {
 return [{label:'Back to World',click:()=>actions.back()},{type:'separator'},{label:'Quit Completely',click:()=>actions.quit()}];
}

/** The packaged app keeps Worldlet.ico beside Worldlet.exe; a checkout uses the brand master. */
export function trayIcon(host:Host){
 const candidates=[path.join(path.dirname(process.execPath),'Worldlet.ico'),path.join(host.profile.resources,'resources/styles/builtin/assets/brand/worldlet.ico')];
 return candidates.find(file=>fs.existsSync(file))??'';
}

const realTray:TrayFactory=icon=>new Tray(icon?nativeImage.createFromPath(icon):nativeImage.createEmpty());

/** Windows: the hidden World has no taskbar button while Fox is on the desktop, so a
 * notification-area icon is the way back until the World returns. Mac keeps its Dock. */
export class CompanionTray {
 private tray:TrayLike|null=null;
 private title:string;private icon:string;private actions:CompanionEntryActions;private create:TrayFactory;
 constructor(title:string,icon:string,actions:CompanionEntryActions,create:TrayFactory=realTray){this.title=title;this.icon=icon;this.actions=actions;this.create=create;}
 get shown(){return this.tray!==null;}
 show(){
  if(this.tray)return;
  const tray=this.create(this.icon);
  tray.setToolTip(this.title);
  tray.setContextMenu(Menu.buildFromTemplate(companionMenu(this.actions)));
  tray.on('click',()=>this.actions.back());
  this.tray=tray;
 }
 /** Deferred: Back to World may run inside the icon's own click or menu callback. */
 hide(){
  const tray=this.tray;
  if(!tray)return;
  this.tray=null;
  setImmediate(()=>tray.destroy());
 }
}

export function companionEntry(host:Host,actions:CompanionEntryActions,platform:NodeJS.Platform=process.platform,create?:TrayFactory){
 return platform==='win32'?new CompanionTray(host.profile.title,trayIcon(host),actions,create):null;
}
