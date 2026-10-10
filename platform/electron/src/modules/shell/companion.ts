import {app,BaseWindow,ImageView,Menu,screen,type NativeImage,type Rectangle,type WebContentsView} from 'electron';
import {WorldletError} from '../../files.ts';
import type {Host,Row} from '../../host/types.ts';
import type {DesktopCompanionService} from '../../host/services.ts';
import {companionEntry,companionMenu,type CompanionTray} from './companion-tray.ts';
import {onboardingUnfinished} from '../../../../../core/onboarding/index.ts';
import {backgroundLaunch} from '../../background-launch.ts';

const WORLD_BACKGROUND='#20251d';
const CHECK_FLAGS=['--check','--window-capture','--host-contract-check','--smoke-check'];
const personalLaunch=(host:Host)=>!backgroundLaunch()&&!host.profile.smoke&&!host.profile.rcCheck&&!process.argv.some(arg=>CHECK_FLAGS.includes(arg));
interface Crop {x:number;y:number;width:number;height:number}

/** Closing or minimizing the World keeps Fox on the desktop, and so does any other app coming to the
 * foreground (owner Order 2026-10-09): Fox floats on top whenever the World window is not in front. The same live World view moves
 * into a transparent floating window clipped around the measured Companion cluster; the
 * page keeps its viewport size, so nothing moves on screen and no second page exists.
 * Until onboarding is over (setup, then the first-run tour) Fox never stays behind: closing the
 * window quits and minimizing only minimizes (owner request 2026-10-04); the next launch resumes
 * where the person left. When Fox leaves only because the World lost the foreground, the World window
 * stays where it is and shows the last frame of the world without Fox until it is focused again. */
export class DesktopCompanion implements DesktopCompanionService {
 private host:Host;
 private panel:BaseWindow|null=null;
 private attached:BaseWindow|null=null;
 private desktop=false;
 private detaching=false;
 private generation=0;
 private viewport={width:0,height:0};
 private crop:Crop={x:0,y:0,width:0,height:0};
 /** Last on-screen frame of the World view; a minimizing window may already report its Dock geometry. */
 private frame:Rectangle|null=null;
 private drag:ReturnType<typeof setInterval>|null=null;
 private listeners:(()=>void)[]=[];
 private presentation:((desktop:boolean)=>void)[]=[];
 private sheets=0;
 private holds:(()=>boolean)[]=[];
 private inactive:ReturnType<typeof setTimeout>|null=null;
 /** The World's last frame, shown in the World window while Fox is out because another app is in front. */
 private backdrop:ImageView|null=null;
 /** Windows only: the notification-area way back while the World is hidden. */
 private entry:CompanionTray|null;
 private quit:()=>void;
 private unfinished:()=>boolean;
 /** Whether any Worldlet window has the foreground. */
 private inFront:()=>boolean;
 /** Checks and background launches never move Fox on their own: their windows rarely hold the foreground. */
 private follows:boolean;
 constructor(host:Host,entry?:CompanionTray|null,{quit=()=>app.quit(),unfinished=()=>onboardingUnfinished(host.store.state.onboarding),
  inFront=()=>BaseWindow.getFocusedWindow()!==null,follows=personalLaunch(host)}:{quit?:()=>void,unfinished?:()=>boolean,inFront?:()=>boolean,follows?:boolean}={}){
  this.host=host;this.quit=quit;this.unfinished=unfinished;this.inFront=inFront;this.follows=follows;
  this.entry=entry===undefined?companionEntry(host,{back:()=>{this.reattach();},quit:()=>app.quit()}):entry;
 }
 get isDesktop(){return this.desktop;}
 beforeDetach(listener:()=>void){this.listeners.push(listener);}
 onPresentation(listener:(desktop:boolean)=>void){this.presentation.push(listener);}
 keepInWorld(check:()=>boolean){this.holds.push(check);}
 panelBounds(){return this.desktop&&this.panel&&!this.panel.isDestroyed()?this.panel.getBounds():null;}
 private presented(desktop:boolean){for(const listener of this.presentation)try{listener(desktop);}catch(error){this.host.diagnostics.record(error,'desktopCompanion');}}
 /** The World window exists only after modules install; attach once it loaded. */
 attach(){
  const world=this.host.window();
  if(!world||world===this.attached)return;
  this.attached=world;
  const remember=()=>{const view=this.host.worldView();if(view&&!world.isMinimized()&&world.isVisible()&&!this.desktop)this.frame=this.viewFrame(world);};
  world.on('move',remember);world.on('resize',remember);world.on('show',remember);remember();
  world.on('minimize',()=>{if(!this.unfinished())void this.showDesktop(false);});
  world.on('restore',()=>{if(this.desktop||this.detaching)this.reattach();});
  world.on('focus',()=>{this.cancelInactive();if(this.desktop)this.reattach();});
  world.on('resize',()=>{if(this.backdrop){const [width,height]=world.getContentSize();this.backdrop.setBounds({x:0,y:0,width,height});}});
  // Another app in front: Mac reports the whole app resigning; every OS blurs the World window.
  world.on('blur',()=>this.scheduleInactive());
  app.on('browser-window-blur',()=>this.scheduleInactive());
  if(process.platform==='darwin')app.on('did-resign-active',()=>this.scheduleInactive());
 }
 private cancelInactive(){if(this.inactive)clearTimeout(this.inactive);this.inactive=null;}
 /** Focus moving between Worldlet's own windows blurs first; wait until it settles. */
 private scheduleInactive(){
  this.cancelInactive();
  this.inactive=setTimeout(()=>{this.inactive=null;void this.leaveForeground();},150);
 }
 /** Fox goes on top of the other app, unless Worldlet is still in front or moving Fox would close
  * something showing in the World (a website, a video, a call). */
 private async leaveForeground(){
  const world=this.host.window(),view=this.host.worldView();
  if(!this.follows||!world||!view||world.isDestroyed()||this.desktop||this.detaching||this.sheets>0||this.unfinished())return;
  if(!world.isVisible()||world.isMinimized()||world.isFocused()||this.inFront()||view.webContents.isDevToolsFocused())return;
  if(!this.host.page.ready())return;
  for(const hold of this.holds)try{if(hold())return;}catch(error){this.host.diagnostics.record(error,'desktopCompanion');}
  await this.showDesktop(false,true);
 }
 private viewFrame(world:BaseWindow){
  const content=world.getContentBounds(),view=this.host.worldView()!.getBounds();
  return {x:content.x+view.x,y:content.y+view.y,width:view.width,height:view.height};
 }
 /** Native dialogs attached to the World must finish before it can be hidden. */
 async whileSheet<T>(work:()=>Promise<T>):Promise<T> {this.sheets+=1;try{return await work();}finally{this.sheets-=1;}}
 shouldKeepOpen(){
  const world=this.host.window();
  if(!world||!this.host.worldView()||!this.host.page.ready())return false;
  // Quit, not close: other windows (the glow, a task page) would keep the app alive.
  if(!this.desktop&&this.unfinished()){this.quit();return true;}
  if(this.desktop){world.hide();this.entry?.show();}else void this.showDesktop(true);
  return true;
 }
 /** `automatic`: the World only lost the foreground; Fox stays inside while the World is still starting. */
 async showDesktop(hideWorld:boolean,automatic=false){
  const world=this.host.window(),view=this.host.worldView();
  if(this.desktop||this.detaching||!world||!view||this.sheets>0)return;
  this.detaching=true;
  const generation=++this.generation;
  // Capture screen coordinates before the OS starts its minimize animation.
  const frame=world.isMinimized()&&this.frame?this.frame:this.viewFrame(world);
  let value:unknown=null;
  try{value=await this.host.page.call('worldletCompanionGeometry',automatic);}catch{}
  if(!this.detaching||generation!==this.generation)return;
  if(automatic&&!value){this.detaching=false;return;}
  const backdrop=hideWorld?null:await this.capture(view);
  if(!this.detaching||generation!==this.generation)return;
  // Back in front while the frame was taken: Fox stays in the World.
  if(automatic&&(world.isFocused()||this.inFront())){this.detaching=false;return;}
  const bounds=view.getBounds();
  this.viewport={width:bounds.width,height:bounds.height};
  this.crop=this.validCrop(value)??{x:0,y:0,...this.viewport};
  this.detaching=false;
  await this.detach(world,frame,hideWorld,generation,backdrop);
 }
 /** The World as it looks without Fox, for the window Fox leaves behind; empty if it could not be drawn. */
 private async capture(view:WebContentsView){
  const settle=(work:Promise<unknown>)=>Promise.race([work.catch(()=>{}),new Promise(resolve=>setTimeout(resolve,250))]);
  try{
   await settle(this.host.page.call('worldletCompanionBackdrop',true));
   const image=await view.webContents.capturePage();
   return image.isEmpty()?null:image;
  }catch{return null;}
  finally{void this.host.page.call('worldletCompanionBackdrop',false).catch(()=>{});}
 }
 private async detach(world:BaseWindow,frame:Rectangle,hideWorld:boolean,generation:number,image:NativeImage|null=null){
  const view=this.host.worldView();
  if(!view)return;
  for(const listener of this.listeners)try{listener();}catch(error){this.host.diagnostics.record(error,'desktopCompanion');}
  const panel=this.panel??this.makePanel(world);
  this.panel=panel;this.desktop=true;
  const crop=this.crop;
  panel.setBounds({x:Math.round(frame.x+crop.x),y:Math.round(frame.y+crop.y),width:crop.width,height:crop.height});
  world.contentView.removeChildView(view);
  if(image){
   const backdrop=this.backdrop??new ImageView();this.backdrop=backdrop;
   backdrop.setImage(image);
   const [width,height]=world.getContentSize();
   backdrop.setBounds({x:0,y:0,width,height});
   world.contentView.addChildView(backdrop);
  }
  view.setBackgroundColor('#00000000');
  view.setBounds({x:-crop.x,y:-crop.y,width:this.viewport.width,height:this.viewport.height});
  panel.contentView.addChildView(view);
  await this.host.page.call('worldletDesktopCompanion',true);
  if(!this.desktop||this.generation!==generation)return;
  if(hideWorld){world.hide();this.entry?.show();}
  panel.showInactive();
  this.presented(true);
 }
 /** Synchronous half of Back to World: the view returns before the page is told. */
 private reattach(){
  const world=this.host.window(),view=this.host.worldView();
  if(!world||!view)return false;
  this.detaching=false;this.generation+=1;this.endDrag();
  if(this.desktop){
   this.desktop=false;
   this.panel?.contentView.removeChildView(view);
   view.setBackgroundColor(WORLD_BACKGROUND);
   world.contentView.addChildView(view);
   // The last frame stays above the returning view until the page has painted the whole World again
   // (worldletRestoreWorld waits for the World's own frames, up to 1.5 s).
   const backdrop=this.backdrop;this.backdrop=null;
   if(backdrop){
    world.contentView.addChildView(backdrop);
    const remove=()=>{try{world.contentView.removeChildView(backdrop);}catch{}};
    void Promise.race([this.host.page.call('worldletRestoreWorld').catch(()=>{}),new Promise(resolve=>setTimeout(resolve,2000))]).then(remove);
   }
   const [width,height]=world.getContentSize();
   view.setBounds({x:0,y:0,width,height});
   this.panel?.hide();
   this.entry?.hide();
   this.presented(false);
  }
  void this.host.page.call('worldletRestoreWorld');
  if(process.platform==='darwin'&&!backgroundLaunch())app.focus({steal:true});
  if(world.isMinimized())world.restore();
  if(backgroundLaunch())world.showInactive();else{world.show();world.focus();}
  view.webContents.focus();
  return true;
 }
 async restoreWorld(){if(this.reattach())await this.host.page.call('worldletRestoreWorld');}
 /** `openWorld`: content actions navigate only after the World presentation itself has returned. */
 async restoreWorldForAction(){
  if(!this.host.window()||!this.host.worldView())throw new WorldletError('World is not ready.');
  await this.restoreWorld();
  if(this.desktop)throw new WorldletError('The world did not reopen. Please try again.');
 }
 /** Window-system reopen (Dock click, second launch) brings the World back. */
 reopen(){if(this.desktop||this.detaching)this.reattach();}
 syncPresentation(){void this.host.page.call('worldletDesktopCompanion',this.desktop);}
 showMenu(){
  const menu=Menu.buildFromTemplate(companionMenu({back:()=>{this.reattach();},quit:()=>app.quit()}));
  const window=this.desktop&&this.panel?this.panel:this.host.window();
  menu.popup(window?{window:window as any}:{});
 }
 private validCrop(value:unknown):Crop|null {
  if(!value||typeof value!=='object')return null;
  const {x,y,width,height}=value as Row;
  if(![x,y,width,height].every(n=>typeof n==='number'&&Number.isFinite(n)))return null;
  if(x<0||y<0||width<=0||height<=0||x+width>this.viewport.width+1||y+height>this.viewport.height+1)return null;
  return {x:Math.round(x),y:Math.round(y),width:Math.max(1,Math.round(width)),height:Math.max(1,Math.round(height))};
 }
 setBounds(value:unknown){
  const view=this.host.worldView(),panel=this.panel;
  if(!this.desktop||!panel||!view)return;
  const next=this.validCrop(value);
  if(!next||next.x===this.crop.x&&next.y===this.crop.y&&next.width===this.crop.width&&next.height===this.crop.height)return;
  // Only the native crop moves; the page stays fixed in screen coordinates.
  const bounds=panel.getBounds();
  const origin={x:bounds.x+next.x-this.crop.x,y:bounds.y+next.y-this.crop.y};
  this.crop=next;
  panel.setBounds({...origin,width:next.width,height:next.height});
  view.setBounds({x:-next.x,y:-next.y,width:this.viewport.width,height:this.viewport.height});
 }
 /** The page reports press and release; the window follows the screen cursor in between. */
 beginDrag(){
  const panel=this.panel;
  if(!this.desktop||!panel||this.drag)return;
  const start=screen.getCursorScreenPoint(),origin=panel.getBounds(),started=Date.now();
  this.drag=setInterval(()=>{
   if(!this.panel||!this.desktop||Date.now()-started>120_000){this.endDrag();return;}
   const point=screen.getCursorScreenPoint();
   this.panel.setPosition(origin.x+point.x-start.x,origin.y+point.y-start.y);
  },16);
 }
 endDrag(){if(this.drag)clearInterval(this.drag);this.drag=null;}
 stop(){this.cancelInactive();this.detaching=false;this.generation+=1;this.endDrag();this.entry?.hide();}
 private makePanel(world:BaseWindow){
  const area=screen.getDisplayMatching(world.getBounds()).workArea;
  const mac=process.platform==='darwin';
  const panel=new BaseWindow({
   x:area.x+area.width-480,y:area.y+area.height-524,width:456,height:500,show:false,title:'Worldlet Companion',
   frame:false,transparent:true,hasShadow:false,resizable:false,minimizable:false,maximizable:false,fullscreenable:false,
   skipTaskbar:true,alwaysOnTop:true,backgroundColor:'#00000000',...(mac?{type:'panel' as const}:{})
  });
  panel.setAlwaysOnTop(true,'floating');
  panel.setVisibleOnAllWorkspaces(true,{visibleOnFullScreen:true});
  // A continuation of the World surface, never closed on its own.
  panel.on('close',event=>event.preventDefault());
  return panel;
 }
}
