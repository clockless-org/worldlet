import {uiIcon} from '../components/index.ts';

// Dictation into any text field of the World (an Applet's box, a note, a reply), not only Fox's own bar: ⌘⇧D (Ctrl+Shift+D
// elsewhere) in a focused field listens through the same local Whisper as Fox's microphone, with the World's names
// as its hint; pressing it again, or leaving the field, stops and the words go in at the caret. Escape stops without
// them. A small microphone at the field's corner shows it listening, then understanding, and stops it when clicked.
// Fox's own bar keeps its microphone (it sends what was said); a password field, Fox's bar and a field marked
// `data-no-dictation` are never dictated into. Nothing is captured before the shortcut.

const KINDS=new Set(['','text','search','email','url']);
/** Whether `element` takes dictation: a writable text box or rich-text field outside Fox's bar. */
export function dictationTarget(element:any):boolean {
 if(!element||element.disabled||element.readOnly||element.closest?.('[data-no-dictation],#notionCommand'))return false;
 const tag=String(element.tagName||'').toLowerCase();
 if(tag==='textarea')return true;
 if(tag==='input')return KINDS.has(String(element.getAttribute?.('type')??'').toLowerCase());
 return element.isContentEditable===true;
}
const cjk=(char:string)=>/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}　-〿＀-￯]/u.test(char);
/** `words` as they go between `before` and `after` the caret: a space where a word meets a word, none beside CJK text
 * or whitespace. */
export function dictationWords(before:string,words:string,after:string):string {
 const text=words.trim();if(!text)return '';
 const last=before.slice(-1),next=after.slice(0,1);
 const lead=last&&!/\s/.test(last)&&!(cjk(last)&&cjk(text[0]))?' ':'';
 const tail=next&&!/[\s.,;:!?)\]}、，。！？]/.test(next)&&!(cjk(next)&&cjk(text[text.length-1]))?' ':'';
 return lead+text+tail;
}

export function installFieldDictation({call}:{call:(action:string,body?:any)=>Promise<any>}){
 const mac=/Mac|iPhone|iPad/i.test(navigator.platform);
 let state:'idle'|'starting'|'listening'|'processing'='idle',target:HTMLElement|null=null,range:Range|null=null,ticket=0,chip:HTMLButtonElement|null=null,stopPending=false;
 const shortcut=mac?'⌘⇧D':'Ctrl+Shift+D';
 function place(){
  if(!chip||!target)return;
  const box=target.getBoundingClientRect();
  chip.style.left=Math.max(4,Math.min(innerWidth-32,box.right-30))+'px';chip.style.top=Math.max(4,Math.min(innerHeight-32,box.bottom-30))+'px';
 }
 function render(){
  if(state==='idle'){chip?.remove();chip=null;target?.removeAttribute('data-dictating');return;}
  if(!chip){
   chip=Object.assign(document.createElement('button'),{type:'button',className:'field-dictation'});
   chip.innerHTML=uiIcon('microphone');
   // Keep the field focused: the chip stops listening without taking the caret.
   chip.addEventListener('pointerdown',e=>e.preventDefault());
   chip.onclick=()=>{if(state==='listening'||state==='starting')void stop();};
   document.body.append(chip);
  }
  chip.dataset.state=state;chip.setAttribute('aria-label',state==='processing'?'Understanding your words…':'Listening. Press '+shortcut+' or click to stop.');chip.title=chip.getAttribute('aria-label')!;
  target?.setAttribute('data-dictating',state);place();
 }
 function reset(){state='idle';stopPending=false;render();target=null;range=null;}
 async function start(element:HTMLElement){
  const turn=++ticket;target=element;stopPending=false;
  const selection=getSelection();range=element.isContentEditable&&selection?.rangeCount?selection.getRangeAt(0).cloneRange():null;
  state='starting';render();
  try{await call('speechStart',{purpose:'field'});if(turn!==ticket)return;state='listening';render();if(stopPending)await stop();}
  catch{if(turn===ticket)reset();}
 }
 async function stop(){
  if(state==='starting'){stopPending=true;return;}
  if(state!=='listening')return;
  state='processing';render();
  try{await call('speechStop');}catch{reset();}
 }
 async function cancel(){if(state==='idle')return;ticket++;reset();try{await call('speechCancel');}catch{}}
 function insert(element:HTMLElement,words:string){
  if(!element.isConnected)return;
  if(element instanceof HTMLInputElement||element instanceof HTMLTextAreaElement){
   const start=element.selectionStart??element.value.length,end=element.selectionEnd??start;
   const text=dictationWords(element.value.slice(0,start),words,element.value.slice(end));if(!text)return;
   element.setRangeText(text,start,end,'end');
   element.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:text}));
   return;
  }
  element.focus({preventScroll:true});
  const selection=getSelection();
  if(range&&selection){selection.removeAllRanges();selection.addRange(range);}
  const at=selection?.rangeCount?selection.getRangeAt(0):null;
  const before=at?.startContainer.nodeType===Node.TEXT_NODE?String(at.startContainer.textContent).slice(0,at.startOffset):'';
  const after=at?.endContainer.nodeType===Node.TEXT_NODE?String(at.endContainer.textContent).slice(at.endOffset):'';
  // insertText keeps the field's own undo and input events.
  document.execCommand('insertText',false,dictationWords(before,words,after));
 }
 window.addEventListener('worldlet:speech',(event:any)=>{
  if(state==='idle')return;const value=event.detail||{};
  if(value.phase==='processing'){state='processing';render();}
  else if(value.phase==='final'){const element=target;reset();if(element)insert(element,String(value.text||''));}
  else if(value.phase==='error')reset();
 });
 window.addEventListener('keydown',e=>{
  if(e.key==='Escape'&&state!=='idle'){e.preventDefault();e.stopImmediatePropagation();void cancel();return;}
  if(e.code!=='KeyD'||!e.shiftKey||e.altKey||e.repeat||e.isComposing||!(mac?e.metaKey&&!e.ctrlKey:e.ctrlKey&&!e.metaKey))return;
  const element=document.activeElement as HTMLElement|null;
  if(state!=='idle'){e.preventDefault();if(state==='listening'||state==='starting')void stop();return;}
  // A rich-text field's own editing root takes the words.
  const field=element?.isContentEditable?(element.closest('[contenteditable]:not([contenteditable=false])') as HTMLElement|null)??element:element;
  if(!dictationTarget(field))return;
  e.preventDefault();void start(field!);
 },true);
 // Leaving the field stops listening and keeps what was said; leaving the app ends it (the host cancels the capture).
 document.addEventListener('focusout',e=>{if(target&&e.target===target&&(state==='listening'||state==='starting'))void stop();},true);
 window.addEventListener('blur',()=>void cancel());
 addEventListener('resize',place);addEventListener('scroll',place,true);
 return {get active(){return state!=='idle';},cancel};
}
