// A transparent overlay above a page shown smaller takes the person's input: Fox's copy of a page in the
// panel's corner (device.ts, agent/applets/picture-in-picture.ts FOX_COPY) reports a press and, once Fox's
// turn has ended, its close control.
import crypto from 'node:crypto';
import {WebContentsView,session} from 'electron';

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

/** A transparent view to lay over a page shown smaller: a press on it and its close control (shown
 * with `closable`) are reported, and the page beneath takes no input. */
export class PressOverlay {
 readonly view:WebContentsView;
 /** Settles once the overlay's page has loaded. */
 readonly ready:Promise<unknown>;
 constructor({onPress,onClose}:{onPress:()=>void;onClose:()=>void}){
  const nonce=crypto.randomBytes(16).toString('hex');
  this.view=new WebContentsView({webPreferences:{session:session.fromPartition('worldlet-overlay'),contextIsolation:true,sandbox:true,nodeIntegration:false,spellcheck:false}});
  this.view.setBackgroundColor('#00000000');
  const contents=this.view.webContents;
  contents.setWindowOpenHandler(()=>({action:'deny'}));
  contents.on('will-navigate',event=>event.preventDefault());
  contents.on('console-message',details=>{
   if(details.frame!==contents.mainFrame)return;
   if(details.message===nonce+':press')onPress();else if(details.message===nonce+':close')onClose();
  });
  this.ready=contents.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent(overlayPage(nonce))).catch(()=>{});
 }
 /** The close control shows only once Fox's turn has ended. */
 closable(on:boolean){void this.ready.then(()=>this.view.webContents.isDestroyed()?undefined:this.view.webContents.executeJavaScript(`setClosable(${on})`)).catch(()=>{});}
 destroy(){if(!this.view.webContents.isDestroyed())this.view.webContents.close();}
}
