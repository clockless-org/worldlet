import {app} from 'electron';
import {WorldletError} from '../../files.ts';
import type {Preferences} from '../../preferences.ts';
import {referenceDate} from '../../store/world-store.ts';
import {readLimited,TooLarge} from '../media/io.ts';

export interface RadioStation {stationuuid:string;name:string;url_resolved:string;tags:string;codec:string;lastcheckok:number;publishedAt?:string}

/** Only plain public HTTPS, for radio streams and podcast audio alike. */
export function audible(raw:string){
 let url:URL;
 try{url=new URL(raw);}catch{return null;}
 const host=url.hostname;
 if(url.protocol!=='https:'||url.username||url.password||!host.includes('.')||host==='localhost'||host.endsWith('.local')||/^[0-9.]+$/.test(host))return null;
 return url.href;
}
export const streamURL=(station:RadioStation)=>audible(station.url_resolved);

const BOOKMARKS='worldlet.podcast.bookmarks.v1';
/** Local episode bookmarks are separate from live radio and never autoplay. */
export const PodcastBookmarks={
 load(preferences:Preferences):Record<string,{station:RadioStation,seconds:number,updatedAt:number}> {
  const value=preferences.get<Record<string,any>>(BOOKMARKS,{});
  return value&&typeof value==='object'&&!Array.isArray(value)?value:{};
 },
 save(preferences:Preferences,show:string,station:RadioStation,seconds:number,duration:number){
  if(!Number.isFinite(seconds)||seconds<=0||!streamURL(station))return;
  const entries=PodcastBookmarks.load(preferences);
  const finished=Number.isFinite(duration)&&duration>0&&seconds>=duration-5;
  entries[show.toLowerCase()]={station,seconds:finished?0:seconds,updatedAt:referenceDate()};
  const recent=Object.entries(entries).sort((a,b)=>(b[1].updatedAt??0)-(a[1].updatedAt??0)).slice(0,100);
  preferences.set(BOOKMARKS,Object.fromEntries(recent));
 }
};

/** Public directory only: receives a genre, never conversation history or account data. */
export const RadioDirectory={
 genre(raw:string){
  const value=raw.trim().toLowerCase();
  if(value.length<2||value.length>60||!/^[a-z0-9][a-z0-9 /&+\-]*$/.test(value))throw new WorldletError('Describe the radio style with a short English genre, such as rock or jazz.');
  return value;
 },
 async get(url:string){
  try{
   const response=await fetch(url,{headers:{'User-Agent':'Worldlet/0.35 (Electron radio player)'},signal:AbortSignal.timeout(8000)});
   if(response.status!==200)throw Error('status');
   return await readLimited(response,2_000_000-1);
  }catch{throw new WorldletError('The radio directory is unavailable. Try again shortly.');}
 },
 async reportPlayback(id:string){
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))return;
  try{await RadioDirectory.get('https://all.api.radio-browser.info/json/url/'+id);}catch{}
 },
 async stations(raw:string):Promise<RadioStation[]> {
  const genre=RadioDirectory.genre(raw);
  // The shared hostname uses Radio Browser's DNS pool; discover mirrors from it instead of
  // pinning playback to one regional server.
  const bootstrap='https://all.api.radio-browser.info';
  const hosts=[bootstrap];
  try{
   const mirrors=JSON.parse((await RadioDirectory.get(bootstrap+'/json/servers')).toString('utf8'));
   if(Array.isArray(mirrors))hosts.push(...mirrors.map(m=>m?.name).filter((name):name is string=>typeof name==='string'&&name.endsWith('.api.radio-browser.info')&&!name.includes('/')).sort(()=>Math.random()-.5).slice(0,2).map(name=>'https://'+name));
  }catch{}
  for(const host of hosts){
   const query=new URLSearchParams({tag:genre,tagExact:'true',is_https:'true',hidebroken:'true',order:'clickcount',reverse:'true',limit:'60'});
   let values:unknown;
   try{values=JSON.parse((await RadioDirectory.get(`${host}/json/stations/search?${query}`)).toString('utf8'));}catch{continue;}
   if(!Array.isArray(values))continue;
   const seen=new Set<string>();
   const valid=values.filter((s:any):s is RadioStation=>s&&typeof s.stationuuid==='string'&&typeof s.name==='string'&&typeof s.url_resolved==='string'&&typeof s.tags==='string'&&typeof s.codec==='string'&&typeof s.lastcheckok==='number')
    .filter(s=>s.lastcheckok===1&&['MP3','AAC','AAC+','AAC,HLS'].includes(s.codec.toUpperCase())&&streamURL(s)!==null&&!seen.has(s.url_resolved)&&!!seen.add(s.url_resolved))
    .map(({stationuuid,name,url_resolved,tags,codec,lastcheckok})=>({stationuuid,name,url_resolved,tags,codec,lastcheckok}));
   if(valid.length)return valid.sort((a,b)=>a.tags.split(',').length-b.tags.split(',').length);
  }
  throw new WorldletError(`No playable HTTPS station was found for ${genre}. Try another style or ask for offline music.`);
 }
};

interface Show {collectionName?:string;feedUrl?:string;artistName?:string;collectionId?:number}
const label=(show:Show)=>[show.collectionName,show.artistName].filter(v=>typeof v==='string').join(' — ');
const normalized=(text:string)=>text.normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean).join(' ');

/** Finding a podcast to play, with nothing to sign up for: Apple's public search answers
 * with the show's own RSS feed, which carries the episode audio. Failure is reported to Fox
 * instead of silently substituting a different programme. */
export const PodcastDirectory={
 anything:'The Daily The New York Times',
 term(raw:string){
  const value=raw.trim();
  if(value.length<2||value.length>80)throw new WorldletError('Ask Fox for a podcast by name, or by what it is about.');
  return value;
 },
 async get(url:string,limit=4_000_000){
  let response:Response;
  try{response=await fetch(url,{cache:'no-store',headers:{'Cache-Control':'no-cache','User-Agent':'Worldlet/0.35 (Electron podcast player)'},signal:AbortSignal.timeout(10_000)});}
  catch{throw new WorldletError('That podcast directory is unavailable. Try again shortly.');}
  if(response.status!==200){void response.body?.cancel().catch(()=>{});throw new WorldletError('That podcast directory is unavailable. Try again shortly.');}
  try{return await readLimited(response,limit-1);}
  catch(error){
   if(error instanceof TooLarge)throw new WorldletError('The podcast feed exceeds the supported size. Its latest episode could not be verified; nothing was selected.');
   throw new WorldletError('That podcast directory is unavailable. Try again shortly.');
  }
 },
 /** Search rank is not identity: exact titles and title extensions are candidates together. */
 select(shows:Show[],term:string):Show {
  const query=normalized(term),queryWords=new Set(query.split(' ').filter(Boolean));
  const seen=new Set<string>();
  const unique=shows.filter(show=>{
   if(typeof show.feedUrl!=='string'||!audible(show.feedUrl)||typeof show.collectionId!=='number'||seen.has(show.feedUrl))return false;
   seen.add(show.feedUrl);return true;
  });
  const matches=unique.filter(show=>{
   const title=normalized(show.collectionName??''),words=new Set(title.split(' ').filter(Boolean));
   const all=new Set(normalized(label(show)).split(' ').filter(Boolean));
   return queryWords.size>0&&words.size>0&&(title===query||title.startsWith(query+' with ')||([...words].every(w=>queryWords.has(w))&&[...queryWords].every(w=>all.has(w))));
  });
  if(matches.length===1)return matches[0];
  const choices=(matches.length?matches:unique).slice(0,5).map(show=>`${label(show)} [apple:${show.collectionId}]`).join('; ');
  throw new WorldletError((matches.length?'More than one programme matches. Ask which show':'No exact programme match. Choose a show')+(choices?': '+choices:'.')+' Nothing was played.');
 },
 async shows(raw:string):Promise<Show[]> {
  const term=PodcastDirectory.term(raw);
  const lookup=term.startsWith('apple:')&&/^\d+$/.test(term.slice(6))?Number(term.slice(6)):null;
  const query=new URLSearchParams({entity:'podcast',limit:'50'});
  query.set(lookup===null?'term':'id',lookup===null?term:String(lookup));
  const region=app.getLocaleCountryCode();
  if(/^[A-Z]{2}$/i.test(region))query.set('country',region);
  const data=await PodcastDirectory.get(`https://itunes.apple.com/${lookup===null?'search':'lookup'}?${query}`,2_000_000);
  let found:Show[];
  try{const value=JSON.parse(data.toString('utf8'));if(!Array.isArray(value?.results))throw Error();found=value.results.filter((v:unknown)=>v&&typeof v==='object');}
  catch{throw new WorldletError('That podcast directory is unavailable. Try again shortly.');}
  if(lookup!==null){
   const show=found.find(s=>s.collectionId===lookup&&typeof s.feedUrl==='string'&&audible(s.feedUrl));
   if(!show)throw new WorldletError('That selected podcast is unavailable. Nothing was played.');
   return [show];
  }
  return [PodcastDirectory.select(found,term)];
 },
 /** Every candidate comes from ONE resolved show, newest published first. */
 async episodes(raw:string):Promise<RadioStation[]> {
  const show=(await PodcastDirectory.shows(raw))[0];
  const feed=show&&typeof show.feedUrl==='string'?audible(show.feedUrl):null;
  if(!show||!feed)throw new WorldletError('Choose a podcast first.');
  const data=await PodcastDirectory.get(feed,12_000_000);
  const episodes=publishedEpisodes(data.toString('utf8'));
  if(!episodes.length)throw new WorldletError(`No dated, published audio episode was found for ${label(show)}. Nothing was played.`);
  return episodes.slice(0,30).map(episode=>({stationuuid:`podcast:${show.collectionId}`,name:label(show)+' · '+episode.title,url_resolved:episode.url,tags:'podcast',codec:episode.codec,lastcheckok:1,publishedAt:new Date(episode.date).toISOString().replace(/\.\d{3}Z$/,'Z')}));
 }
};

const ENTITIES:Record<string,string>={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"};
const decode=(text:string)=>text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi,(whole,name:string)=>{
 if(name[0]==='#'){const code=name[1]==='x'||name[1]==='X'?parseInt(name.slice(2),16):parseInt(name.slice(1),10);return Number.isFinite(code)&&code>0&&code<=0x10ffff?String.fromCodePoint(code):whole;}
 return ENTITIES[name.toLowerCase()]??whole;
});
/** Character data of one element: CDATA verbatim, everything else entity-decoded. */
const characters=(raw:string)=>raw.split(/(<!\[CDATA\[[\s\S]*?\]\]>)/).map(part=>part.startsWith('<![CDATA[')?part.slice(9,-3):decode(part.replace(/<[^>]*>/g,''))).join('');
const element=(body:string,name:string)=>{const match=new RegExp(`<${name.replace(':','\\:')}(?:\\s[^>]*)?>([\\s\\S]*?)</${name.replace(':','\\:')}\\s*>`,'i').exec(body);return match?characters(match[1]):'';};
const attributes=(raw:string)=>{const values:Record<string,string>={};for(const match of raw.matchAll(/([\w:.-]+)\s*=\s*("([^"]*)"|'([^']*)')/g))values[match[1]]=decode(match[3]??match[4]??'');return values;};
function timestamp(raw:string){
 const value=raw.trim();
 if(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)||/^(?:[A-Za-z]{3},\s*)?\d{1,2}\s+[A-Za-z]{3}\s+\d{4}\s+\d{1,2}:\d{2}/.test(value)){const time=Date.parse(value);return Number.isFinite(time)?time:null;}
 return null;
}
/** Complete RSS items read independently; document order is never recency. */
export function publishedEpisodes(xml:string,now=Date.now()){
 const entries:{title:string,url:string,codec:string,date:number}[]=[];
 for(const item of xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item\s*>/gi)){
  const body=item[1];
  let url='',type='';
  for(const enclosure of body.matchAll(/<enclosure\b([^>]*)>/gi)){
   const values=attributes(enclosure[1]),kind=(values.type??'').toLowerCase();
   if(values.url&&audible(values.url)&&(!kind||kind.startsWith('audio/'))){url=values.url;type=kind;break;}
  }
  const title=element(body,'title').slice(0,1000).trim();
  const date=timestamp((element(body,'pubDate')||element(body,'dc:date')).slice(0,120));
  if(url&&title&&element(body,'itunes:episodeType').trim().toLowerCase()!=='trailer'&&date!==null)
   entries.push({title,url,codec:type.includes('aac')||type.includes('mp4')?'AAC':'MP3',date});
 }
 const seen=new Set<string>();
 return entries.filter(e=>e.date<=now).sort((a,b)=>a.date===b.date?(a.url<b.url?-1:a.url>b.url?1:0):b.date-a.date).filter(e=>!seen.has(e.url)&&!!seen.add(e.url));
}
