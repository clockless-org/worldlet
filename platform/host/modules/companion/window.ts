import {app,Menu,type BaseWindow} from 'electron';
import {WorldletError} from '../../files.ts';
import type {Host} from '../../types.ts';
import {RUN_IN_BACKGROUND,type DesktopCompanionService} from '../../services.ts';
import {companionEntry,companionMenu,type CompanionTray} from './tray.ts';
import {onboardingUnfinished} from '../../../../agent/companion/index.ts';
import {backgroundLaunch,showInBackground} from '../../background-launch.ts';

/** Fox lives only in the World (owner request 2026-10-29: Fox no longer stays on the desktop). Closing the World window hides
 * it while the app keeps running; the Dock (Mac) or the notification-area icon (Windows) brings it back, and
 * minimizing or switching to another app leaves Fox where it is. Nothing floats on the desktop.
 * Until onboarding is over (setup, then the first-run tour) closing the window quits (owner request 2026-10-04);
 * the next launch resumes where the person left. */
export class DesktopCompanion implements DesktopCompanionService {
 private host:Host;
 private listeners:(()=>void)[]=[];
 /** Windows only: the notification-area way back while the World is hidden. */
 private entry:CompanionTray|null;
 private quit:()=>void;
 private unfinished:()=>boolean;
 /** Mac: give the foreground back to the app the person was using. */
 private hideApp:()=>void;
 constructor(host:Host,entry?:CompanionTray|null,{quit=()=>app.quit(),unfinished=()=>onboardingUnfinished(host.store.state.onboarding),
  hideApp=()=>{if(process.platform==='darwin')app.hide();}}:{quit?:()=>void,unfinished?:()=>boolean,hideApp?:()=>void}={}){
  this.host=host;this.quit=quit;this.unfinished=unfinished;this.hideApp=hideApp;
  this.entry=entry===undefined?companionEntry(host,{back:()=>{this.reattach();},quit:()=>app.quit()}):entry;
 }
 beforeDetach(listener:()=>void){this.listeners.push(listener);}
 /** Native dialogs attached to the World run as they are: nothing moves the World while they are open. */
 whileSheet<T>(work:()=>Promise<T>):Promise<T> {return work();}
 shouldKeepOpen(){
  const world=this.host.window();
  if(!world||!this.host.worldView()||!this.host.page.ready())return false;
  // Quit, not close: other windows (the glow, a task page) would keep the app alive.
  if(this.unfinished()){this.quit();return true;}
  if(this.host.preferences.bool(RUN_IN_BACKGROUND)&&this.background())return true;
  this.stepAside(world);
  this.entry?.show();
  return true;
 }
 /** Websites and the inline player stop when the World hides; Fox's own task page keeps working. */
 private stepAside(world:BaseWindow){
  for(const listener of this.listeners)try{listener();}catch(error){this.host.diagnostics.record(error,'desktopCompanion');}
  if(!world.isDestroyed()&&world.isVisible())world.hide();
 }
 /** Synchronous half of Back to World. */
 private reattach(){
  const world=this.host.window(),view=this.host.worldView();
  if(!world||!view)return false;
  this.entry?.hide();
  if(process.platform==='darwin'&&!backgroundLaunch())app.focus({steal:true});
  if(world.isMinimized())world.restore();
  if(backgroundLaunch())showInBackground(world);else{world.show();world.focus();}
  view.webContents.focus();
  return true;
 }
 async restoreWorld(){this.reattach();}
 /** `openWorld`: content actions navigate once the World window is in front. */
 async restoreWorldForAction(){
  if(!this.host.window()||!this.host.worldView())throw new WorldletError('World is not ready.');
  await this.restoreWorld();
 }
 /** Window-system reopen (Dock click, second launch) brings the World back. */
 reopen(){const world=this.host.window();if(world&&!world.isDestroyed()&&(!world.isVisible()||world.isMinimized()))this.reattach();}
 showMenu(){
  const menu=Menu.buildFromTemplate(companionMenu({back:()=>{this.reattach();},quit:()=>app.quit()}));
  const window=this.host.window();
  menu.popup(window?{window:window as any}:{});
 }
 /** Every Worldlet window steps aside while the app keeps running, so a browser link (platform/web/page) keeps working. The Dock
  * (Mac) or the tray (Windows) brings the World back; until onboarding is over there is nothing to run. */
 background(){
  if(this.unfinished())return false;
  const world=this.host.window();
  if(world&&!world.isDestroyed())this.stepAside(world);
  this.entry?.show();
  this.hideApp();
  return true;
 }
 stop(){this.entry?.hide();}
}
