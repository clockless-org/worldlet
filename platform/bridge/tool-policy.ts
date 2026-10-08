import {contentTools} from '../../core/tools/index.ts';

// Content tools that change the user's world; every loop gates them the same way.
export const contentWrites=new Set(contentTools.filter(t=>t.name!=='list_deleted').map(t=>t.name));
const reads=new Set(['read_content','read_content_page','open_content']);
const textReads=new Set([...reads,'find_content']);
const urlPattern=/https:\/\/[^\s<>"'`)\]]+/gi;
const canonical=(value: unknown)=>{try{const u=new URL(String(value));return u.protocol==='https:'?u.href:null;}catch{return null;}};
// "example.com/docs" as a person would type it: host without www, no trailing slash.
const typed=(u: URL)=>(u.hostname.replace(/^www\./,'')+u.pathname.replace(/\/+$/,'')).toLowerCase();
const mentions=(text: string,address: string)=>new RegExp('(?:^|[^a-z0-9.@/-])(?:https://)?(?:www\\.)?'+address.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'/?(?![a-z0-9_/-])','i').test(text);

// Model-initiated navigation (browse_web / automate_browser open) is frictionless for an
// address the user wrote, a local record returned this turn (browsing history, saved
// posts), a plain link already on screen or in a note read this turn, and a plain address
// Fox names for a site the person asked for while nothing untrusted has entered the turn
// (`clean`: no page, mail, note or history text read yet; owner decision 2026-10-08,
// "打开apple developer网站" was refused). Anything else (an address composed after
// untrusted content, or one carrying query/fragment data) is refused, so page text cannot
// exfiltrate data through a URL.
export function navigationGate(url: unknown,{request='',trusted=new Set<string>(),visible=new Set<string>(),clean=false}: {request?: string;trusted?: Set<string>;visible?: Set<string>;clean?: boolean}={}){
 const href=canonical(url);if(!href)return {confirm:false,invalid:true};
 const u=new URL(href),said=String(request||'');
 const mentioned=(said.match(urlPattern)||[]).map(canonical);
 if(mentioned.includes(href)||trusted.has(href))return {confirm:false};
 const plain=!u.search&&!u.hash;
 if(plain&&(visible.has(href)||mentions(said,typed(u))||clean&&!!said.trim()))return {confirm:false};
 return {confirm:true,reason:plain?'not-provided':'carries-data'};
}

// Per-turn guardrails shared by every agent loop: idempotent tool receipts, one
// coding delegation per turn, excerpts only from notes the model actually read, and
// the addresses the model may open without asking.
// Whether a request is a coding request is Hermes' decision, not a keyword test.
export function createTurnPolicy(){
 const receipts=new Map(),observed=new Map(),trusted=new Set<string>(),visible=new Set<string>();let delegated=false;
 const see=(set: Set<string>,value: unknown)=>{const href=canonical(value);if(href&&set.size<2000)set.add(href);};
 return {
  receipt:id=>receipts.get(id),
  hasReceipt:id=>receipts.has(id),
  remember(id,result){receipts.set(id,result);},
  observe(name,result,args: any={}){
   // Local records of the user's own visits and saves are trusted exactly as returned.
   if(name==='browse_web'&&['history','saved','bookmarks'].includes(args?.operation))for(const row of [...(result?.items||[]),...(result?.results||[])])see(trusted,row?.url);
   // Links on the visible page and in notes read this turn count only as plain addresses.
   if(name==='automate_browser'&&args?.operation==='snapshot'){see(visible,result?.url);for(const row of result?.elements||[])see(visible,row?.url);}
   // open, click and scroll bring back the page they lead to (`page`), which counts as a snapshot.
   if(name==='automate_browser'&&result?.page&&typeof result.page==='object')see(visible,result.page.url);
   if(textReads.has(name)){const note=result?.content||result;for(const text of [note?.text,note?.markdown,...(result?.results||[]).map(row=>row?.excerpt)])for(const match of String(text||'').match(urlPattern)||[])see(visible,match);}
   if(!reads.has(name))return;
   const note=result?.content||result;
   if(note?.id&&typeof note.text==='string')observed.set(note.id,{id:note.id,title:note.title,text:note.text.slice(0,3500)});
  },
  navigation(url,request,clean=false){return navigationGate(url,{request,trusted,visible,clean});},
  emailSources(ids){
   if(!Array.isArray(ids)||!ids.length||ids.some(id=>!observed.has(id)))return {error:"Read the original records this turn and provide their sourceIds before preparing this email."};
   return {ok:true};
  },
  delegation(args: any={}){
   if(delegated)return {error:'A coding task was already delegated this turn.'};
   const ids=args.note_ids||[];
   if(ids.some(key=>!observed.has(key)))return {error:'Read the requested notes before sharing them.'};
   delegated=true;return {excerpts:ids.map(key=>observed.get(key))};
  },
  get delegated(){return delegated;}
 };
}
