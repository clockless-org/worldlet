// The website surface (engine/surface.ts): draws a CEF page's frames and turns the person's input
// into engine messages. It runs in the trusted, sandboxed surface view's isolated world; the page
// itself lives in the engine process and never runs here. Coordinates sent to the engine are the
// page's own CSS pixels, whatever size the surface shows it at (a picture-in-picture frame shows
// the same page scaled down).
import {ipcRenderer,sharedTexture} from 'electron';
import {keyCodes,linuxCharacter,macCharacter} from './keys.ts';

type Message=Record<string,any>&{t:string};
const send=(message:Message)=>ipcRenderer.send('web-surface',message);
const mac=navigator.userAgent.includes('Mac OS X'),linux=process.platform==='linux';
const system=mac?'mac':linux?'linux':'windows';
// CEF event flags (cef_event_flags_t).
const SHIFT=1<<1,CONTROL=1<<2,ALT=1<<3,LEFT=1<<4,MIDDLE=1<<5,RIGHT=1<<6,COMMAND=1<<7,CAPS=1<<0,NUM=1<<8,KEYPAD=1<<9,IS_LEFT=1<<10,IS_RIGHT=1<<11,REPEAT=1<<13;
// cef_cursor_type_t, in order.
const CURSORS=['default','crosshair','pointer','text','wait','help','e-resize','n-resize','ne-resize','nw-resize','s-resize','se-resize','sw-resize','w-resize','ns-resize','ew-resize','nesw-resize','nwse-resize','col-resize','row-resize',
 'all-scroll','all-scroll','all-scroll','all-scroll','all-scroll','all-scroll','all-scroll','all-scroll','all-scroll','move','vertical-text','cell','context-menu','alias','progress','no-drop','copy','none','not-allowed','zoom-in','zoom-out','grab','grabbing','all-scroll','all-scroll'];

let page={width:1,height:1};
let widget:{x:number,y:number,width:number,height:number}|null=null;
let view:HTMLCanvasElement,popup:HTMLCanvasElement,input:HTMLTextAreaElement;
let composing=false;
// Task picture in picture (#1175): the page takes no input here and a press is reported.
let pressOnly=false,pressing=false,pageCursor='default';

const scaleX=()=>page.width/Math.max(1,innerWidth),scaleY=()=>page.height/Math.max(1,innerHeight);
function mouseFlags(event:MouseEvent){
 let flags=0;
 if(event.shiftKey)flags|=SHIFT;if(event.ctrlKey)flags|=CONTROL;if(event.altKey)flags|=ALT;if(event.metaKey)flags|=COMMAND;
 if(event.buttons&1)flags|=LEFT;if(event.buttons&4)flags|=MIDDLE;if(event.buttons&2)flags|=RIGHT;
 return flags;
}
function keyFlags(event:KeyboardEvent){
 let flags=0;
 if(event.shiftKey)flags|=SHIFT;if(event.ctrlKey)flags|=CONTROL;if(event.altKey)flags|=ALT;if(event.metaKey)flags|=COMMAND;if(event.repeat)flags|=REPEAT;
 if(event.getModifierState('CapsLock'))flags|=CAPS;if(event.getModifierState('NumLock'))flags|=NUM;
 if(event.location===3)flags|=KEYPAD;else if(event.location===1)flags|=IS_LEFT;else if(event.location===2)flags|=IS_RIGHT;
 return flags;
}
const point=(event:MouseEvent)=>({x:Math.round(event.clientX*scaleX()),y:Math.round(event.clientY*scaleY())});

// Wheel movement not yet sent: the fraction of a pixel each axis owes the page.
const wheelCarry={x:0,y:0};
// Pointer moves are coalesced to one per animation frame.
let pendingMove:Message|null=null;
function move(message:Message){
 if(!pendingMove)requestAnimationFrame(()=>{if(pendingMove)send(pendingMove);pendingMove=null;});
 pendingMove=message;
}
function flushMove(){if(pendingMove){send(pendingMove);pendingMove=null;}}

function key(event:KeyboardEvent,type:'down'|'up'){
 const native=keyCodes(event.code,system);
 const character=event.key.length===1?event.key.charCodeAt(0):event.key==='Enter'?13:mac?macCharacter(event.key):0;
 send({t:'key',e:type,vk:event.keyCode,native,ch:character,uch:character,m:keyFlags(event),sys:!mac&&event.altKey&&!event.ctrlKey});
}
// The app's Back and Forward keys (the shell's File menu: ⌘[ ⌘] on the Mac, Alt+← Alt+→ elsewhere) move the
// page through its history from the menu; the page never sees them, so it cannot hold them back.
const historyKey=(event:KeyboardEvent)=>mac?event.metaKey&&!event.altKey&&!event.ctrlKey&&['BracketLeft','BracketRight'].includes(event.code)
 :event.altKey&&!event.ctrlKey&&!event.metaKey&&['ArrowLeft','ArrowRight'].includes(event.key);
function keydown(event:KeyboardEvent){
 if(historyKey(event))return;
 // An input method owns these keys; its text arrives as a composition.
 if(event.isComposing||event.keyCode===229||composing){send({t:'key',e:'down',vk:229,native:keyCodes(event.code,system),ch:0,uch:0,m:keyFlags(event)});return;}
 event.preventDefault();
 key(event,'down');
 // Text keys also type their character; shortcuts and the Enter key's line break come from the page.
 const text=event.key.length===1&&!event.ctrlKey&&!event.metaKey;
 // Linux: CEF types the character its US layout gives the key code, so other characters (another
 // layout, Caps Lock, AltGr) go in as text.
 if(linux&&text&&linuxCharacter(event.keyCode,event.shiftKey)!==event.key)send({t:'ime',e:'commit',text:event.key});
 else if(text||event.key==='Enter')send({t:'key',e:'char',vk:linux?event.keyCode:event.key==='Enter'?13:event.key.charCodeAt(0),native:keyCodes(event.code,system),ch:event.key==='Enter'?13:event.key.charCodeAt(0),uch:event.key==='Enter'?13:event.key.charCodeAt(0),m:keyFlags(event)});
 else if(event.key.length===2&&!event.ctrlKey&&!event.metaKey)send({t:'ime',e:'commit',text:event.key});
 // Without an Edit menu (or with its shortcut unbound) the shortcut reaches the page as keys only.
 if(mac&&event.metaKey&&!event.altKey&&!event.ctrlKey){
  const command={c:'copy',x:'cut',v:'paste',a:'selectAll',z:event.shiftKey?'redo':'undo'}[event.key.toLowerCase()];
  if(command)send({t:'edit',op:command});
 }
}
function reset(){input.value=' ';input.setSelectionRange(1,1);}

function placeWidget(){
 if(!widget){popup.style.display='none';return;}
 const sx=innerWidth/page.width,sy=innerHeight/page.height;
 Object.assign(popup.style,{display:'block',left:widget.x*sx+'px',top:widget.y*sy+'px',width:widget.width*sx+'px',height:widget.height*sy+'px'});
}

function receive(message:Message){
 switch(message.t){
  case 'page':page={width:Math.max(1,message.w),height:Math.max(1,message.h)};placeWidget();break;
  case 'cursor':pageCursor=CURSORS[message.c]??'default';if(!pressOnly)view.style.cursor=pageCursor;break;
  case 'mode':pressOnly=message.press===true;view.style.cursor=pressOnly?'pointer':pageCursor;if(pressOnly)input.blur();break;
  case 'tooltip':view.title=message.text??'';break;
  case 'widget':
   if(message.show===false){widget=null;popup.getContext('2d')?.clearRect(0,0,popup.width,popup.height);}
   else if(Array.isArray(message.rect))widget={x:message.rect[0],y:message.rect[1],width:message.rect[2],height:message.rect[3]};
   placeWidget();break;
  case 'ime':{
   // Keep the input method's candidates beside the text being composed.
   const last=Array.isArray(message.bounds)?message.bounds[message.bounds.length-1]:null;
   if(Array.isArray(last)){const sx=innerWidth/page.width,sy=innerHeight/page.height;input.style.left=(last[0]+last[2])*sx+'px';input.style.top=last[1]*sy+'px';input.style.height=Math.max(1,last[3]*sy)+'px';}
   break;
  }
  case 'focus':input.focus();break;
  case 'clear':for(const canvas of [view,popup])canvas.getContext('2d')?.clearRect(0,0,canvas.width,canvas.height);break;
  case 'pixels':paint(message);break;
 }
}

// Linux: a frame's BGRA pixels (engine/surface.ts), swizzled to RGBA once into an image per element.
const images=new Map<number,ImageData>();
function paint(message:Message){
 try{
  const k=message.k?1:0,canvas=k?popup:view,width=message.w,height=message.h,bytes=message.data as Uint8Array;
  if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;}
  let image=images.get(k);
  if(!image||image.width!==width||image.height!==height)images.set(k,image=new ImageData(width,height));
  const source=new Uint32Array(bytes.byteOffset%4?bytes.slice().buffer:bytes.buffer,bytes.byteOffset%4?0:bytes.byteOffset,width*height);
  const target=new Uint32Array(image.data.buffer);
  for(let i=0;i<target.length;i++){const pixel=source[i];target[i]=pixel&0xff00ff00|(pixel&0xff)<<16|pixel>>>16&0xff;}
  canvas.getContext('2d',{alpha:!!k})?.putImageData(image,0,0);
 }catch(error){send({t:'error',message:'draw: '+String((error as Error)?.message??error)});}
 finally{send({t:'drawn',k:message.k});}
}

sharedTexture.setSharedTextureReceiver(async ({importedSharedTexture},...args:unknown[])=>{
 const meta=(args[0]??{}) as {k?:number};
 const frame=importedSharedTexture.getVideoFrame();
 try{
  const canvas=meta.k?popup:view;
  if(canvas.width!==frame.codedWidth||canvas.height!==frame.codedHeight){canvas.width=frame.codedWidth;canvas.height=frame.codedHeight;}
  canvas.getContext('2d',{alpha:!!meta.k})?.drawImage(frame,0,0);
 }catch(error){send({t:'error',message:'draw: '+String((error as Error)?.message??error)});}
 finally{frame.close();importedSharedTexture.release();}
});

window.addEventListener('DOMContentLoaded',()=>{
 view=document.getElementById('view') as HTMLCanvasElement;
 popup=document.getElementById('popup') as HTMLCanvasElement;
 input=document.getElementById('input') as HTMLTextAreaElement;
 reset();
 ipcRenderer.on('web-surface',(_event,message:Message)=>receive(message));
 const surface=document.documentElement;
 surface.addEventListener('pointermove',event=>{if(!pressOnly)move({t:'mouse',e:'move',...point(event),m:mouseFlags(event)});});
 surface.addEventListener('pointerdown',event=>{
  if(pressOnly){event.preventDefault();pressing=event.button===0;return;}
  event.preventDefault();input.focus();flushMove();
  surface.setPointerCapture(event.pointerId);
  send({t:'mouse',e:'down',...point(event),b:event.button,n:Math.max(1,event.detail),m:mouseFlags(event)});
 });
 surface.addEventListener('pointerup',event=>{
  if(pressOnly){const inside=event.clientX>=0&&event.clientY>=0&&event.clientX<=innerWidth&&event.clientY<=innerHeight;if(pressing&&inside)send({t:'press'});pressing=false;return;}
  flushMove();send({t:'mouse',e:'up',...point(event),b:event.button,n:Math.max(1,event.detail),m:mouseFlags(event)});
 });
 surface.addEventListener('pointerleave',event=>{if(pressOnly){pressing=false;return;}if(!event.buttons){pendingMove=null;send({t:'mouse',e:'leave',...point(event),m:mouseFlags(event)});}});
 surface.addEventListener('wheel',event=>{
  event.preventDefault();if(pressOnly)return;
  const unit=event.deltaMode===1?40:event.deltaMode===2?innerHeight:1;
  // The engine takes whole pixels. A trackpad sends many fractions of one (its momentum's tail
  // above all); they add up here instead of rounding away, so slow and coasting scrolls stay smooth.
  const x=wheelCarry.x-event.deltaX*unit*scaleX(),y=wheelCarry.y-event.deltaY*unit*scaleY();
  const dx=Math.trunc(x),dy=Math.trunc(y);
  wheelCarry.x=x-dx;wheelCarry.y=y-dy;
  if(dx||dy)send({t:'mouse',e:'wheel',...point(event),dx,dy,m:mouseFlags(event)});
 },{passive:false});
 surface.addEventListener('contextmenu',event=>event.preventDefault());
 input.addEventListener('keydown',keydown);
 input.addEventListener('keyup',event=>{if(historyKey(event))return;if(!event.isComposing&&event.keyCode!==229)event.preventDefault();key(event,'up');});
 input.addEventListener('compositionstart',()=>{composing=true;});
 input.addEventListener('compositionupdate',event=>{const text=event.data??'';send({t:'ime',e:'set',text,s0:text.length,s1:text.length});});
 input.addEventListener('compositionend',event=>{composing=false;send({t:'ime',e:'commit',text:event.data??''});reset();});
 // Text that arrives without a key or composition (emoji picker, dictation).
 input.addEventListener('input',event=>{const data=(event as InputEvent).data;if(!composing&&data)send({t:'ime',e:'commit',text:data});if(!composing)reset();});
 // The app's Edit menu acts on this view: hand its commands to the page.
 for(const name of ['copy','cut','paste'] as const)document.addEventListener(name,event=>{event.preventDefault();send({t:'edit',op:name});});
 input.addEventListener('beforeinput',event=>{
  const type=(event as InputEvent).inputType;
  if(type==='historyUndo'||type==='historyRedo'){event.preventDefault();send({t:'edit',op:type==='historyUndo'?'undo':'redo'});}
 });
 input.addEventListener('select',()=>{if(input.selectionStart===0&&input.selectionEnd===input.value.length){send({t:'edit',op:'selectAll'});reset();}});
 input.addEventListener('focus',()=>send({t:'focus',focus:true}));
 input.addEventListener('blur',()=>send({t:'focus',focus:false}));
 send({t:'ready'});
});
