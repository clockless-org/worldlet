// The computer's own music, on the World's sound line (owner Orders 2026-10-07 and 2026-10-08): whatever
// Apple Music, Spotify, 汽水音乐 or a browser tab is playing takes that one line, as its title and who made
// it, with previous, play or pause, and next beside it. No cover, no shelf. While nothing outside Worldlet
// plays, or it is paused while the World's own sound plays, the line is the World's sound again
// (world-audio.ts). Worldlet's own radio never shows here (core/applets/local-music.ts). The host looks
// only while the World is in front; the practice world never shows the person's music.
import {nowPlayingLine,type LocalMusicState} from '../../core/applets/index.ts';
import {uiIcon} from '../components/index.ts';
import {windowActive} from '../world/index.ts';

const el=(tag:string,className='',text?:string)=>{const e=document.createElement(tag);if(className)e.className=className;if(text!==undefined)e.textContent=text;return e;};

export function mountLocalMusic(call:(action:string,body:any)=>Promise<any>){
 const line=document.querySelector<HTMLElement>('.world-audio');if(!line)return ()=>{};
 const sound=line.querySelector<HTMLElement>('.world-audio-current');
 const row=el('span','world-now-playing');row.setAttribute('aria-label','Music on this computer');row.hidden=true;
 const glyph=el('span','world-audio-icon');glyph.innerHTML=uiIcon('note');
 const words=el('span','world-now-playing-words');
 const controls=el('span','world-now-playing-controls');
 const button=(name:string,icon:string,label:string)=>{const b=el('button','world-now-playing-control') as HTMLButtonElement;b.type='button';b.dataset.command=name;b.innerHTML=uiIcon(icon);b.setAttribute('aria-label',label);return b;};
 const previous=button('previous','skip','Previous'),toggle=button('toggle','play','Play'),next=button('next','skip','Next');
 previous.classList.add('is-previous');
 controls.append(previous,toggle,next);
 const status=el('span','world-now-playing-status');status.setAttribute('role','status');
 row.append(glyph,words,controls,status);line.append(row);

 let state:LocalMusicState|null=null,busy=false,disposed=false;
 function render(value:LocalMusicState|null=state){
  if(value&&state&&value.revision<state.revision)return;
  state=value;
  const now=value?.supported?value.nowPlaying:null;
  // A paused player gives the line back to the World's own sound while that plays.
  const shown=!!now&&(now.playing||sound?.dataset.on!=='true');
  row.hidden=!shown;line.dataset.local=String(shown);
  if(!now||!shown)return;
  const text=nowPlayingLine(now);
  words.textContent=`${text.title} · ${text.detail}`;words.title=`${text.title} · ${text.detail} (${now.app})`;
  row.dataset.playing=String(now.playing);row.dataset.player=now.app;
  toggle.innerHTML=uiIcon(now.playing?'pause':'play');toggle.setAttribute('aria-label',now.playing?'Pause':'Play');
 }
 const say=(text:string)=>{status.textContent=text;if(text)setTimeout(()=>{if(status.textContent===text)status.textContent='';},5000);};
 controls.addEventListener('click',async event=>{
  const target=(event.target as HTMLElement).closest<HTMLButtonElement>('[data-command]');
  if(!target||busy)return;
  busy=true;row.setAttribute('aria-busy','true');
  try{const result=await call('localMusic',{operation:'command',command:target.dataset.command});if(result?.nowPlaying&&state)render({...state,nowPlaying:result.nowPlaying,revision:state.revision});say('');}
  catch(error:any){say(error?.message||'The player did not answer.');}
  finally{busy=false;row.removeAttribute('aria-busy');}
 });
 // The World's sound turning on or off decides whether a paused player keeps the line.
 const soundObserver=new MutationObserver(()=>render());
 if(sound)soundObserver.observe(sound,{attributes:true,attributeFilter:['data-on']});

 const update=(event:Event)=>render((event as CustomEvent).detail);
 window.addEventListener('worldlet:local-music',update);
 // The host looks only while the World is in front; it says at once what is playing when it starts.
 let watching:boolean|null=null;
 const present=()=>{
  if(disposed)return;
  const active=!document.hidden&&windowActive()&&!document.documentElement.classList.contains('desktop-companion');
  if(active===watching)return;watching=active;
  void call('localMusic',{operation:'watch',active}).then(value=>{if(!disposed&&value)render(value);}).catch(()=>{});
 };
 const events=['worldlet:app-active','worldlet:app-inactive','worldlet:desktop-companion','focus','blur'];
 for(const name of events)window.addEventListener(name,present);document.addEventListener('visibilitychange',present);
 present();
 return ()=>{
  disposed=true;soundObserver.disconnect();row.remove();delete line.dataset.local;
  window.removeEventListener('worldlet:local-music',update);
  for(const name of events)window.removeEventListener(name,present);document.removeEventListener('visibilitychange',present);
  void call('localMusic',{operation:'watch',active:false}).catch(()=>{});
 };
}

/** Fox's control_local_music (core/tools/controls.ts) through the same host requests as the corner. */
export async function runLocalMusicTool(call:(action:string,body:any)=>Promise<any>,args:any){
 const operation=String(args?.operation||'status');
 try{
  if(operation==='status'){
   const state:LocalMusicState=await call('localMusic',{operation:'status'});
   if(!state?.supported)return {error:'This computer cannot say what its music apps are playing.'};
   const now=state.nowPlaying;
   return now?{ok:true,app:now.app,title:now.title,artist:now.artist,album:now.album,playing:now.playing,appleMusic:now.appleMusic}:{ok:true,playing:false,nothing:'No music app on this computer has a track right now.'};
  }
  if(['play','pause','toggle','next','previous'].includes(operation)){
   const result=await call('localMusic',{operation:'command',command:operation});
   const now=result?.nowPlaying;
   return {ok:true,command:operation,...now?{app:now.app,title:now.title,artist:now.artist,playing:now.playing}:{}};
  }
  const host={playlists:'playlists',play_playlist:'playPlaylist',search:'search',play_track:'playTrack'}[operation];
  if(!host)return {error:'Unknown music operation.'};
  if((operation==='play_playlist'||operation==='play_track')&&!args?.id)return {error:'Give the ID from playlists or search.'};
  if(operation==='search'&&!args?.query)return {error:'Say what to search for.'};
  const result=await call('localMusic',{operation:host,...args?.id?{id:args.id}:{},...args?.query?{query:args.query}:{}});
  return {ok:true,...result};
 }catch(error:any){return {error:error?.message||'The music app did not answer.'};}
}
