/** Self-contained: also serialized into isolated Chromium worlds by the resource builder. */
export function installActivityCollector(options = {}) {
 const key='__worldletActivityV2';
 if(window[key])return window[key];
 const root=options.root||document,signalController=new AbortController(),signal=signalController.signal;
 const state={documentId:crypto.randomUUID(),clicks:[],edits:[],interactions:[],dropped:0};
 const nodes=new WeakMap();let nextNode=0,timer,lastSnapshot='',stopped=false;
 // Reading the visible text walks the whole document and measures each text's element (about
 // 30 ms on a long feed), so a busy page (a ticking clock, a video's controls, a mail list) is
 // read at most once a second, and only after it changed; a click or a host poll in between
 // reports the last reading (owner report 2026-10-05: lag). After the first reading the walk runs
 // in slices of a few milliseconds while the page is idle, so its own animations and scrolling
 // keep every frame (owner report 2026-10-06: Xiaohongshu's animations stuttered once a second).
 const READ_GAP_MS=1000,SLICE_MS=4;let dirty=true,lastRead=0,visibleText='',visibleTruncated=false,walking=null,idle=0;
 const later=typeof requestIdleCallback==='function'?f=>requestIdleCallback(f,{timeout:READ_GAP_MS}):f=>setTimeout(f,16);
 const cancelLater=typeof cancelIdleCallback==='function'?cancelIdleCallback:clearTimeout;
 const discard=()=>{state.clicks.length=0;state.edits.length=0;state.interactions.length=0;state.dropped=0;};
 const enabled=()=>!stopped&&(!options.enabled||options.enabled());
 const privatePage=()=>['accounts.google.com','appleid.apple.com','login.microsoftonline.com'].includes(location.hostname)||!!root.querySelector('input[type=password]')||/\/(login|signin|sign-in|oauth|authorize|callback|checkout|payment)(\/|$)/i.test(location.pathname);
 const sensitive=t=>!!t.closest('input[type=password],[data-history-private]')||/password|token|secret|credential|card|otp|api.?key/i.test([t.id,t.getAttribute('name'),t.getAttribute('type'),t.getAttribute('autocomplete')].join(' '));
 const editable=t=>!!t.closest('input,textarea,select,[contenteditable]');
 const target=t=>{if(!nodes.has(t))nodes.set(t,++nextNode);return {nodeId:nodes.get(t),tag:t.tagName.toLowerCase(),target:(t.id||t.getAttribute('data-applet')||'').slice(0,180)};};
 const queue=(list,event)=>{if(list.length>=2000){state.dropped++;return;}list.push(event);};
 // A reading starts clean: a change while it runs makes the page dirty again for the next one.
 const startWalk=(restarts=0)=>{dirty=false;return {walker:document.createTreeWalker(options.root||document.body,NodeFilter.SHOW_TEXT),text:'',count:0,truncated:false,shown:new Map(),restarts};};
 /** Walks until `until` (performance.now()); true once the reading is complete. */
 const step=(w,until)=>{
  // The page removed the text the walk stood on: start over, twice at most, then finish with what was read.
  const at=w.walker.currentNode;if(at!==w.walker.root&&!at.isConnected){if(w.restarts>=2)return true;Object.assign(w,startWalk(w.restarts+1));}
  let node;
  while((node=w.walker.nextNode())){
   if(++w.count>30000||w.text.length>=1000000){w.truncated=true;return true;}
   if(!(w.count&63)&&performance.now()>=until)return false;
   const t=node.textContent.trim();if(!t)continue;
   const p=node.parentElement;if(!p)continue;
   // Blank text and siblings under one element cost no layout query of their own.
   let visible=w.shown.get(p);
   if(visible===undefined){
    visible=!p.closest('script,style,noscript,form,input,textarea,select,[contenteditable],[hidden],[aria-hidden=true],[data-history-private]');
    if(visible){const r=p.getBoundingClientRect();visible=!(r.bottom<=0||r.top>=innerHeight||r.right<=0||r.left>=innerWidth||!p.getClientRects().length);}
    if(visible){const style=getComputedStyle(p);visible=!(style.visibility==='hidden'||style.opacity==='0');}
    w.shown.set(p,visible);
   }
   if(visible)w.text+=t+' ';
  }
  return true;
 };
 const finish=w=>{lastRead=Date.now();visibleText=w.text;visibleTruncated=w.truncated;};
 const slice=()=>{idle=0;if(!walking)return;if(!enabled()||!document.body){walking=null;return;}
  if(!step(walking,performance.now()+SLICE_MS)){idle=later(slice);return;}
  finish(walking);walking=null;flush(false);
 };
 const begin=()=>{walking=startWalk();idle||=later(slice);};
 const read=(walk=true)=>{
  let text='',truncated=false;const omitted=!enabled()?'capture-disabled':privatePage()?'sensitive-page':undefined;
  if(omitted)discard();
  if(enabled()&&!omitted&&document.body&&walk&&dirty&&!walking){
   // The first reading is whole, so the first sample has the page's text; later ones run in slices.
   if(!lastRead){const w=startWalk();step(w,Infinity);finish(w);}
   else begin();
  }
  if(enabled()&&!omitted){text=visibleText;truncated=visibleTruncated;}
  const value={documentId:state.documentId,url:options.url||location.href,title:omitted?'':document.title,text:text.slice(0,1000000),visible:document.visibilityState==='visible'&&document.hasFocus(),truncated,omitted,scrollX,scrollY,clicks:state.clicks.splice(0),edits:state.edits.splice(0),interactions:state.interactions.splice(0),dropped:state.dropped,...(!omitted?{coverage:{scope:'document',frameElements:root.querySelectorAll('iframe,frame').length,workers:'not-observed'}}:{})};state.dropped=0;return value;
 };
 const flush=(walk=true)=>{clearTimeout(timer);timer=0;if(!enabled()){discard();lastSnapshot='';return;}if(!options.sink&&typeof window.worldletActivity!=='function')return;const value=read(walk);if(dirty&&!walking)schedule();
  const snapshot=JSON.stringify([value.url,value.title,value.text,value.visible,value.omitted,value.truncated,value.scrollX,value.scrollY,value.coverage]);
  if(snapshot===lastSnapshot&&!value.clicks.length&&!value.edits.length&&!value.interactions.length&&!value.dropped)return;
  lastSnapshot=snapshot;
  if(options.sink)options.sink(value);else if(typeof window.worldletActivity==='function')window.worldletActivity(JSON.stringify(value));
 };
 // A reading in slices reports once it is complete; until then the page has nothing new to send.
 const schedule=()=>{timer||=setTimeout(()=>{timer=0;if(walking)return;
  if(lastRead&&dirty&&Date.now()-lastRead>=READ_GAP_MS&&enabled()&&document.body&&!privatePage())begin();else flush(Date.now()-lastRead>=READ_GAP_MS);
 },Math.max(100,lastRead+READ_GAP_MS-Date.now()));};
 const changed=()=>{dirty=true;schedule();};
 for(const type of ['click','dblclick','contextmenu','input','change','submit','focusin','focusout','scroll'])root.addEventListener(type,event=>{
  if(!enabled()||!event.isTrusted||privatePage())return;
  const t=event.target instanceof Element?event.target:document.documentElement;if(sensitive(t))return;
  const detail={type,at:Date.now(),...target(t)};
  if(type==='input'||type==='change')Object.assign(detail,{inputType:event.inputType||type,characters:typeof t.value==='string'?t.value.length:(t.textContent||'').length,contentRecorded:false});
  else if(type==='scroll')Object.assign(detail,{x:t.scrollLeft,y:t.scrollTop});
  else if(type==='click'||type==='dblclick'||type==='contextmenu')Object.assign(detail,{x:event.clientX,y:event.clientY,label:editable(t)?'input-control':(t.getAttribute('aria-label')||t.textContent||'').trim().slice(0,200)});
  queue(state.interactions,detail);
  // Keep existing click/edit consumers compatible while the generic stream is authoritative.
  if(type==='click')queue(state.clicks,{tag:detail.tag,label:detail.label,...(t.closest('a')?{href:t.closest('a').href}:{})});
  if(type==='input')queue(state.edits,{tag:detail.tag,inputType:detail.inputType,characters:detail.characters});
  if(type==='scroll')dirty=true;
  if(type==='click'||type==='submit'||type==='focusout')flush(false);else schedule();
 },{capture:true,passive:true,signal});
 for(const type of ['visibilitychange','selectionchange'])document.addEventListener(type,()=>{
  if(!enabled()||privatePage())return;queue(state.interactions,{type,at:Date.now(),active:document.visibilityState==='visible'});schedule();
 },{signal});
 for(const type of ['resize','popstate','hashchange','pageshow','pagehide','focus','blur'])window.addEventListener(type,()=>{
  if(!enabled()||privatePage())return;queue(state.interactions,{type,at:Date.now()});if(['resize','popstate','hashchange','pageshow'].includes(type))dirty=true;flush(false);
 },{signal});
 // Observe application-independent content changes, including dynamically loaded reader content.
 const observer=new MutationObserver(changed);observer.observe(options.root||document.documentElement,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['hidden','aria-hidden','open','class','style']});
 const interval=setInterval(()=>flush(),3000);
 const api={read,flush,stop(){flush();stopped=true;clearTimeout(timer);if(idle)cancelLater(idle);idle=0;walking=null;clearInterval(interval);observer.disconnect();signalController.abort();delete window[key];}};
 window[key]=api;schedule();return api;
}
