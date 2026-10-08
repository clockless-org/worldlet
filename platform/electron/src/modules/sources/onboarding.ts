import crypto from 'node:crypto';
import {WorldletError} from '../../files.ts';
import {canBuild} from '../../store/world-store.ts';
import type {SourcesContext} from './context.ts';
import type {Row} from '../../host/types.ts';
// Setup progress (Mac Onboarding.swift host action) and the one-time headline fallback
// (OnboardingNews.swift): a bounded first-party RSS read, never a subscription.
const FEEDS:[string,string][]=[['https://feeds.bbci.co.uk/news/world/rss.xml','BBC News'],['https://www.theguardian.com/world/rss','The Guardian']];
const HOSTS=['www.bbc.com','www.bbc.co.uk','www.theguardian.com'];
const ENTITIES:Record<string,string>={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"};
const decode=(text:string)=>text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi,(whole,name:string)=>{
 if(name[0]==='#'){const code=name[1].toLowerCase()==='x'?parseInt(name.slice(2),16):parseInt(name.slice(1),10);return Number.isFinite(code)&&code<=0x10ffff?String.fromCodePoint(code):whole;}
 return ENTITIES[name.toLowerCase()]??whole;
});
/** Element text with CDATA sections kept literally and entities decoded elsewhere. */
function field(item:string,name:string){
 const match=new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`).exec(item);
 if(!match)return undefined;
 return match[1].split(/(<!\[CDATA\[[\s\S]*?\]\]>)/).map(part=>part.startsWith('<![CDATA[')?part.slice(9,-3):decode(part.replace(/<[^>]*>/g,''))).join('').trim();
}
const RFC822=/^[A-Z][a-z]{2}, \d{1,2} [A-Z][a-z]{2} \d{4} \d{2}:\d{2}:\d{2} (GMT|UTC|UT|[+-]\d{4})$/;
export function recentHeadlines(xml:string,now=Date.now()){
 if(Buffer.byteLength(xml)>2_000_000)throw new WorldletError('News feed is too large.');
 const items=[...xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/g)].map(match=>({title:field(match[1],'title'),link:field(match[1],'link'),pubDate:field(match[1],'pubDate')}));
 return items.filter(row=>{
  if(!row.title||Array.from(row.title).length>200||!row.link||!row.pubDate||!RFC822.test(row.pubDate))return false;
  let url:URL;try{url=new URL(row.link);}catch{return false;}
  if(url.protocol!=='https:'||url.username||url.password||!HOSTS.includes(url.hostname))return false;
  const published=Date.parse(row.pubDate);
  return Number.isFinite(published)&&published<=now+300_000&&published>=now-86_400_000;
 }) as {title:string,link:string,pubDate:string}[];
}

export function createOnboarding(ctx:SourcesContext){
 const {store}=ctx;
 async function news():Promise<Row> {
  if(!store.writable||store.sampleEnabled())throw new WorldletError('News is unavailable in this world.');
  const workspace=store.state.workspaceId,existing=store.worldItems();
  for(const [address,publisher] of FEEDS){
   let rows;
   try{
    const response=await fetch(address,{signal:AbortSignal.timeout(8000),redirect:'follow'});
    if(response.status!==200)continue;
    const text=await response.text();
    if(store.state.workspaceId!==workspace||store.sampleEnabled())throw new WorldletError('News is unavailable in this world.');
    rows=recentHeadlines(text);
   }catch(error){if(store.state.workspaceId!==workspace||store.sampleEnabled())throw error;continue;}
   for(const row of rows){
    const saved=existing.find(item=>Array.isArray(item.sources)&&item.sources.some((ref:Row)=>ref?.url===row.link));
    if(saved){if(saved.status==='open')return saved;continue;}
    const item={provider:'browser',kind:'update',title:row.title,context:`${publisher} · A headline from the past 24 hours. Open the article to read the full story.`,priority:'normal',sources:[{provider:'browser',id:row.link,url:row.link,quote:row.title}]};
    try{
     const ids=store.ledger().upsert([item],'onboarding-news-'+crypto.randomUUID().toUpperCase());store.worldChanged();
     const created=store.worldItems().find(value=>value.id===ids[0]);
     if(created)return created;
    }catch{continue;}
   }
  }
  throw new WorldletError('Today’s headlines are unavailable. Retry when connected; no headline has been invented.');
 }
 return {
  async onboarding(body:Row):Promise<Row> {
   if(store.sampleEnabled())throw new WorldletError('Turn off Sample Mode to change your own world.');
   if(body.operation==='checkMail'){
    if(!store.writable||!store.state.cloudConsent||!store.state.connections.some((c:Row)=>c.provider==='gmail'&&canBuild(c)))throw new WorldletError('Connect Mail before checking it.');
    const tools=ctx.worldTools();
    if(!tools)throw new WorldletError('Background checks are unavailable in this build.');
    tools.startOnboardingMailCheck();
    return {ok:true};
   }
   if(body.operation==='news')return news();
   const completedBefore=store.state.onboarding?.completed===true;
   const result=store.updateOnboarding(body);
   if(!completedBefore&&store.state.onboarding?.completed===true)ctx.analytics()?.recordOnboardingCompleted();
   return result;
  }
 };
}
