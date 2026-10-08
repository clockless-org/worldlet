// Focus on a website page (core/browser/page-focus.ts), in the page's isolated world. The build bundles it with
// Readability into WorldletWeb/browser/page-focus.js; the host evaluates it on each page load and when the person
// turns Focus on or off, as `worldletPageFocus(plan)`. The page's own DOM is never removed: hidden parts get a style
// rule, and an article shows over the page in a closed shadow root that turning Focus off takes away again.
import {Readability,isProbablyReaderable} from '@mozilla/readability';

type Plan={on:boolean;hide:string[];reader:boolean;articleChars:number};
type State={plan:Plan;href:string;timer:number;retry:number;style:HTMLStyleElement|null;overlay:HTMLElement|null;overflow:string|null;moved:boolean};
const STYLE_ID='worldlet-focus-style',OVERLAY_TAG='worldlet-focus';

const READER_CSS=`:host{all:initial;position:fixed;inset:0;z-index:2147483647;display:block;overflow:auto;background:#fbf8f1;color:#24221f;color-scheme:light}
@media(prefers-color-scheme:dark){:host{background:#1c1d1b;color:#e7e3d9;color-scheme:dark}a{color:#9cc7ff}figcaption,.site{color:#a7a196}}
main{display:block;box-sizing:border-box;max-width:720px;margin:0 auto;padding:40px 28px 96px;font:19px/1.75 "Iowan Old Style",Charter,Georgia,"Songti SC","Noto Serif CJK SC",serif;overflow-wrap:break-word}
.site{font:500 13px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;color:#6f6a60;letter-spacing:.02em;margin:0 0 10px}
h1{font-size:34px;line-height:1.25;margin:0 0 28px}h2{font-size:26px;line-height:1.3}h3{font-size:21px}
a{color:#1f5fa8}img,video,iframe,svg,figure{max-width:100%;height:auto}figure{margin:24px 0}figcaption{font-size:14px;color:#6f6a60}
pre{overflow:auto;padding:14px;border-radius:8px;background:#0000000d;font-size:14px;line-height:1.5}code{font-size:.9em}
blockquote{margin:20px 0;padding-left:18px;border-left:3px solid #8883}table{display:block;overflow:auto;border-collapse:collapse}td,th{padding:4px 8px;border:1px solid #8884}`;

function state():State|null {return (globalThis as any).__worldletFocus??null;}

function clearReader(s:State){
 s.overlay?.remove();s.overlay=null;
 if(s.overflow!==null){document.documentElement.style.overflow=s.overflow;s.overflow=null;}
}
function clear(s:State){clearReader(s);s.style?.remove();s.style=null;clearInterval(s.timer);clearTimeout(s.retry);}

// Selectors that do not parse, or that would hide the whole page, are skipped one by one.
function hide(s:State){
 const rules:string[]=[];let count=0;
 for(const selector of s.plan.hide){
  try{
   const found=document.querySelectorAll(selector);
   if([...found].some(e=>e===document.documentElement||e===document.body))continue;
   rules.push(selector+'{display:none!important}');count+=found.length;
  }catch{}
 }
 if(!s.style||!s.style.isConnected){s.style=document.createElement('style');s.style.id=STYLE_ID;(document.head||document.documentElement).append(s.style);}
 s.style.textContent=rules.join('\n');
 return count;
}

// Where the person writes (an editor, a compose box) the page stays the page.
const editing=()=>!!document.querySelector('[contenteditable=""],[contenteditable="true"],[contenteditable="plaintext-only"]')||
 document.activeElement instanceof HTMLTextAreaElement||document.activeElement instanceof HTMLInputElement&&!['button','submit','checkbox','radio'].includes(document.activeElement.type);

// The article's own markup, inert: no scripts, handlers or script addresses.
function cleanArticle(html:string){
 const parsed=new DOMParser().parseFromString(html,'text/html');
 for(const e of parsed.querySelectorAll('script,style,link,object,embed,form,input,button,textarea,select'))e.remove();
 for(const e of parsed.querySelectorAll('*')){
  for(const attr of [...e.attributes]){
   const name=attr.name.toLowerCase();
   if(name.startsWith('on')||name==='style'||(['href','src','action','formaction','xlink:href'].includes(name)&&/^\s*(?:javascript|data:text\/html|vbscript):/i.test(attr.value)))e.removeAttribute(attr.name);
  }
  if(e.tagName==='IFRAME'&&!/^https:\/\//i.test(e.getAttribute('src')||''))e.remove();
 }
 return parsed.body;
}

function reader(s:State):boolean {
 if(!s.plan.on||!s.plan.reader||s.overlay||editing())return false;
 try{if(!isProbablyReaderable(document))return false;}catch{return false;}
 let article:ReturnType<Readability['parse']>=null;
 try{article=new Readability(document.cloneNode(true) as Document,{charThreshold:500}).parse();}catch{return false;}
 const text=(article?.textContent||'').replace(/\s+/g,' ').trim();
 if(!article?.content||[...text].length<s.plan.articleChars)return false;
 const overlay=document.createElement(OVERLAY_TAG);
 const root=overlay.attachShadow({mode:'closed'});
 const style=document.createElement('style');style.textContent=READER_CSS;
 const body=document.createElement('main');if(article.dir)body.dir=article.dir;if(article.lang)body.lang=article.lang;
 const site=document.createElement('p');site.className='site';site.textContent=[article.siteName||location.hostname.replace(/^www\./,''),article.byline].filter(Boolean).join(' · ');
 const title=document.createElement('h1');title.textContent=article.title||document.title;
 body.append(site,...title.textContent?[title]:[],...cleanArticle(article.content).childNodes);
 for(const a of body.querySelectorAll('a[href]'))a.setAttribute('href',(a as HTMLAnchorElement).href);
 root.append(style,body);
 overlay.tabIndex=-1;
 s.overflow=document.documentElement.style.overflow;document.documentElement.style.overflow='hidden';
 document.documentElement.append(overlay);s.overlay=overlay;
 try{overlay.focus({preventScroll:true});}catch{}
 return true;
}

/** Applies a plan to this page, replacing the last one; returns what Focus did here. */
function worldletPageFocus(plan:Plan){
 const previous=state();if(previous)clear(previous);
 const s:State={plan,href:location.href,timer:0,retry:0,style:null,overlay:null,overflow:null,moved:false};
 (globalThis as any).__worldletFocus=s;
 if(!plan.on)return {on:false,hidden:0,reader:false};
 const hidden=hide(s);
 let shown=reader(s);
 // A page that fills in its article after load gets one more look, unless the person already moved on it.
 const moved=()=>{s.moved=true;};
 for(const input of ['pointerdown','keydown','wheel','touchstart'])addEventListener(input,moved,{capture:true,once:true});
 if(!shown&&plan.reader)s.retry=window.setTimeout(()=>{if(!s.moved&&state()===s)reader(s);},1500);
 // Single-page sites change address without a load: the article shown belongs to the old address, and new parts of the
 // page arrive under the rules already in place.
 s.timer=window.setInterval(()=>{
  if(state()!==s){clearInterval(s.timer);return;}
  if(!s.style?.isConnected)hide(s);
  if(location.href===s.href)return;
  s.href=location.href;clearReader(s);s.moved=false;
  clearTimeout(s.retry);s.retry=window.setTimeout(()=>{if(!s.moved&&state()===s)reader(s);},1200);
 },1000);
 return {on:true,hidden,reader:shown};
}
// A stable selector for an element, as rules are saved: a unique ID, a test ID or the tag with up to two classes, never
// a generated-looking name. Null when the element has none.
const plain=(name:string)=>/^[A-Za-z][\w-]{1,40}$/.test(name)&&!/\d{3}|[a-z]+-[a-z0-9]{5,}$|^_|^css-|^sc-|^jsx-/i.test(name);
function selectorFor(e:Element):string|null {
 if(e.id&&plain(e.id)&&document.querySelectorAll('#'+CSS.escape(e.id)).length===1)return '#'+e.id;
 const test=e.getAttribute('data-testid');if(test&&/^[\w-]{1,60}$/.test(test))return `${e.localName}[data-testid="${test}"]`;
 const classes=[...e.classList].filter(plain).slice(0,2);
 const tag=e.localName;
 if(!classes.length&&!tag.includes('-')&&!['aside','nav','header','footer'].includes(tag))return null;
 const selector=tag+classes.map(c=>'.'+CSS.escape(c)).join('');
 try{return document.querySelectorAll(selector).length<=20?selector:null;}catch{return null;}
}
/** The page's parts as Fox chooses what to hide (`outline`): blocks with a stable selector, where they are, how much of
 * the page's text each holds and how they begin. A part holding most of the text is opened into its own parts. Measured
 * as the site draws it, without Focus's rules. */
function outline(){
 const s=state();if(s?.style)s.style.disabled=true;
 try{
  const total=Math.max(1,(document.body?.innerText||'').replace(/\s+/g,'').length),items:Record<string,unknown>[]=[];
  const queue:[Element,number][]=[...(document.body?.children||[])].map(e=>[e,0]);
  let seen=0;
  while(queue.length&&items.length<60&&seen++<1500){
   const [e,depth]=queue.shift()!;
   if(['SCRIPT','STYLE','NOSCRIPT','TEMPLATE','LINK','META'].includes(e.tagName)||e.localName===OVERLAY_TAG)continue;
   const r=e.getBoundingClientRect(),text=((e as HTMLElement).innerText||'').replace(/\s+/g,' ').trim();
   const share=Math.round(text.replace(/\s/g,'').length/total*100)/100;
   const selector=r.width>=120&&r.height>=40?selectorFor(e):null;
   if(selector&&share<0.6)items.push({selector,tag:e.localName,...e.getAttribute('role')?{role:e.getAttribute('role')}:{},box:[r.x,r.y+scrollY,r.width,r.height].map(Math.round),share,text:text.slice(0,100)});
   // Small unnamed parts are passed over; a part with much of the page is opened up.
   else if(share>=0.05&&depth<8)for(const child of e.children)queue.push([child,depth+1]);
  }
  return {url:location.href,title:document.title,viewport:[innerWidth,innerHeight],items};
 }finally{if(s?.style)s.style.disabled=false;}
}
(globalThis as any).worldletPageFocus=Object.assign(worldletPageFocus,{outline});
