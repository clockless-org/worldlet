// The task picture-in-picture window beside the desktop Companion (#1175, core/browser/picture-in-picture.ts).
// While the World window is closed or minimized, Fox's page shows here smaller, at its own size, and
// keeps working. A transparent overlay above the page takes the person's input: a press brings the
// World back with the page's Applet, and once Fox's turn has ended a close control leaves the page.
import crypto from 'node:crypto';
import {BaseWindow,WebContentsView,session,type Rectangle} from 'electron';

const overlayPage=(nonce:string)=>`<!doctype html><html><head><style>
html,body{margin:0;width:100%;height:100%;background:transparent;cursor:pointer;user-select:none;overflow:hidden}
#close{display:none;position:absolute;top:6px;right:6px;width:24px;height:24px;padding:0;border:0;border-radius:12px;background:rgba(32,37,29,.78);color:#fff;font:600 15px/24px -apple-system,system-ui,sans-serif;cursor:default}
body.closable #close{display:block}
</style></head><body><button id="close" type="button" aria-label="Close" title="Close">×</button><script>
let down=false;
addEventListener('pointerdown',e=>{down=e.target.id!=='close'});
addEventListener('pointercancel',()=>{down=false});
addEventListener('pointerup',e=>{const inside=e.clientX>=0&&e.clientY>=0&&e.clientX<=innerWidth&&e.clientY<=innerHeight;if(down&&inside)console.log(${JSON.stringify(nonce+':press')});down=false});
document.getElementById('close').addEventListener('click',()=>console.log(${JSON.stringify(nonce+':close')}));
function setClosable(on){document.body.classList.toggle('closable',!!on)}
</script></body></html>`;

export class TaskWindow {
 readonly window:BaseWindow;
 private overlay:WebContentsView;
 private ready:Promise<unknown>;
 constructor({onPress,onClose}:{onPress:()=>void;onClose:()=>void}){
  const mac=process.platform==='darwin';
  this.window=new BaseWindow({show:false,title:'Fox',frame:false,resizable:false,minimizable:false,maximizable:false,fullscreenable:false,
   skipTaskbar:true,alwaysOnTop:true,hasShadow:true,backgroundColor:'#ffffff',...(mac?{type:'panel' as const}:{})});
  this.window.setAlwaysOnTop(true,'floating');
  this.window.setVisibleOnAllWorkspaces(true,{visibleOnFullScreen:true});
  // It goes with its page, never on its own.
  this.window.on('close',event=>event.preventDefault());
  const nonce=crypto.randomBytes(16).toString('hex');
  this.overlay=new WebContentsView({webPreferences:{session:session.fromPartition('worldlet-overlay'),contextIsolation:true,sandbox:true,nodeIntegration:false,spellcheck:false}});
  this.overlay.setBackgroundColor('#00000000');
  const contents=this.overlay.webContents;
  contents.setWindowOpenHandler(()=>({action:'deny'}));
  contents.on('will-navigate',event=>event.preventDefault());
  contents.on('console-message',details=>{
   if(details.frame!==contents.mainFrame)return;
   if(details.message===nonce+':press')onPress();else if(details.message===nonce+':close')onClose();
  });
  this.ready=contents.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent(overlayPage(nonce))).catch(()=>{});
 }
 get contentView(){return this.window.contentView;}
 get visible(){return !this.window.isDestroyed()&&this.window.isVisible();}
 /** Places the window on screen; the page's surface and the overlay fill it. */
 place(bounds:Rectangle){this.window.setBounds(bounds);this.overlay.setBounds({x:0,y:0,width:bounds.width,height:bounds.height});}
 /** The overlay goes above the page's surface, which was added after it. */
 raise(){this.window.contentView.addChildView(this.overlay);}
 show(){if(!this.window.isVisible())this.window.showInactive();}
 hide(){if(!this.window.isDestroyed())this.window.hide();}
 /** The close control shows only once Fox's turn has ended. */
 closable(on:boolean){void this.ready.then(()=>this.overlay.webContents.isDestroyed()?undefined:this.overlay.webContents.executeJavaScript(`setClosable(${on})`)).catch(()=>{});}
 destroy(){
  if(!this.overlay.webContents.isDestroyed())this.overlay.webContents.close();
  if(!this.window.isDestroyed())this.window.destroy();
 }
}
