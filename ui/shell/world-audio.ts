// Native-only, event-driven status below the weather; no polling or render loop.
//
// One control for one thing: the sound in this world right now. There used to be
// two, an ambience toggle and a music toggle, which meant the corner of the
// screen described the plumbing rather than what you were hearing. It now wears
// the face of whatever is actually sounding -- a note for music, a microphone
// for a spoken programme, and for ambience the thing itself: waves, rain, trees,
// open air -- and names it alongside.
import {celebrationSound} from './celebration-sound.ts';
import {uiIcon} from '../components/index.ts';
import {ACTIVE_THEME,themeAmbientTrack,syncThemeSounds} from '../themes/index.ts';
import {windowActive} from '../world/index.ts';

const AMBIENCE_ICONS={ocean:'wave',rain:'drop',forest:'tree',village:'breeze'};
const QUIET_ICON='breeze';


/// Which channel the control speaks for. A spoken programme or music is what you
/// are listening to; ambience is what you are listening through. When both are
/// on, the foreground one is the sound you would name.
export function sounding(value: any={}) {
 const live=channel=>['loading','buffering'].includes(channel?.state)||(channel?.state==='playing'&&channel.volume>0);
 if(live(value.music))return 'music';
 if(live(value.ambience))return 'ambience';
 return null;
}

export function soundIcon(value: any={},key=sounding(value)) {
 if(key==='music')return value.music?.kind==='podcast'?'mic':'note';
 if(key==='ambience')return value.ambience?.icon||AMBIENCE_ICONS[value.ambience?.trackID]||QUIET_ICON;
 return value.ambience?.icon||AMBIENCE_ICONS[value.ambience?.trackID]||QUIET_ICON;
}

export function mountWorldAudio(call){
 // The World's sound stands in the top-left corner with today's date and weather (owner request 2026-10-08: "声音也改左边吧").
 const parent=document.querySelector('.world-today')||document.querySelector('.world-environment');if(!parent)return;
 const row=document.createElement('div');row.className='world-audio';row.setAttribute('aria-label','World audio');
 const status=document.createElement('span');status.className='world-audio-error';status.setAttribute('role','status');
 const button=document.createElement('button');button.type='button';button.className='world-audio-current';
 const glyph=document.createElement('span');glyph.className='world-audio-icon';
 const now=document.createElement('span');now.className='world-audio-now';
 const nowText=document.createElement('span');nowText.className='world-audio-marquee';now.append(nowText);
 button.append(glyph,now);
 // Fox chooses the sound. This corner only pauses or resumes the current mix.
 let current:any={},lastChannel=null,resumeChannels:string[]=[],pending=false;
 row.append(button,status);parent.append(row);

 function render(value){
  // WebView2 can deliver a command reply after a newer native playback event.
  if(Number.isSafeInteger(value.revision)&&Number.isSafeInteger(current.revision)&&value.revision<current.revision)return;
  current=value;
  // A theme's own sounds follow the World sounds switch (ui/themes/theme-surfaces.ts).
  document.documentElement.dataset.worldSounds=value.ambience?.state==='playing'&&value.ambience.volume>0&&!value.ambience.suspended?'on':'off';
  document.documentElement.dataset.worldSoundVolume=String((value.ambience?.volume||0)*(value.ambience?.ducked ? .12 : 1));syncThemeSounds();
  const error=value.error||value.music?.error||value.ambience?.error;
  status.textContent=error?'Sound unavailable':'';
  const key=sounding(value);
  if(key&&!pending)lastChannel=key;
  const target=key||lastChannel||(value.music?.state==='paused'?'music':'ambience');
  const channel=value[target];
  const busy=['loading','buffering'].includes(channel?.state);
  const on=!!key;
  button.dataset.channel=target;
  button.dataset.on=String(on);
  button.setAttribute('aria-pressed',String(on));
  button.setAttribute('aria-busy',String(busy));
  glyph.innerHTML=uiIcon(soundIcon(value,target));
  // A station that has not started is never named as if it were playing.
  const playing=busy?'Connecting…':channel?.track||(target==='music'?'Music':'Ambience');
  nowText.textContent=playing;
  requestAnimationFrame(()=>{const overflow=Math.ceil(nowText.scrollWidth-now.clientWidth);now.dataset.scroll=String(overflow>0);if(overflow>0)now.style.setProperty('--world-audio-scroll',`${overflow}px`);else now.style.removeProperty('--world-audio-scroll');});
  button.setAttribute('aria-label',`${playing} · ${on?'Mute':'Resume'}`);button.dataset.playing=playing;
 };
 button.onclick=async()=>{
  if(pending)return;
  const live=['music','ambience'].filter(key=>['loading','buffering'].includes(current[key]?.state)||(current[key]?.state==='playing'&&current[key]?.volume>0));
  const enabled=live.length===0;
  if(!enabled)resumeChannels=live;
  const targets=enabled?(resumeChannels.length?resumeChannels:[button.dataset.channel]):live;
  pending=true;button.disabled=true;
  try{for(const operation of targets)render(await call('worldAudio',{operation,enabled}));}
  catch{status.textContent='Sound unavailable';}
  finally{pending=false;button.disabled=false;}
 };
 // A quiet, one-shot arrival cue; respect the existing world's mute state.
 let cue:AudioContext|null=null;
 const prime=()=>{if(document.querySelector('[data-onboarding=true],[data-onboarding-finish=true]')&&!cue){try{cue=new AudioContext();void cue.resume();}catch{}}};
 const arrival=()=>{if(!cue||cue.state!=='running'||!['music','ambience'].some(k=>current[k]?.state==='playing'&&current[k]?.volume>0))return;
  const start=cue.currentTime;for(const [i,hz] of [523.25,783.99,1046.5].entries()){const tone=cue.createOscillator(),gain=cue.createGain();tone.type='sine';tone.frequency.value=hz;gain.gain.setValueAtTime(0,start+i*.13);gain.gain.linearRampToValueAtTime(.025,start+i*.13+.04);gain.gain.exponentialRampToValueAtTime(.0001,start+i*.13+.8);tone.connect(gain).connect(cue.destination);tone.start(start+i*.13);tone.stop(start+i*.13+.85);tone.onended=()=>{tone.disconnect();gain.disconnect();};}
 };
 document.addEventListener('pointerdown',prime,{capture:true});document.addEventListener('keydown',prime,{capture:true});window.addEventListener('worldlet:applet-arrival',arrival);
 const celebrate=(event:Event)=>{if(cue&&sounding(current))celebrationSound(cue,(event as CustomEvent).detail?.kind);};
 window.addEventListener('worldlet:celebration-sound',celebrate);
 const update=e=>render(e.detail);window.addEventListener('worldlet:audio',update);
  const world=document.querySelector<HTMLElement>('#notionWorld');let lastPresentation='',presentationGeneration=0,disposed=false;
 const present=()=>{
  const track=world?.dataset.soundTrack||themeAmbientTrack(ACTIVE_THEME.pack),active=!document.hidden&&windowActive()&&!document.documentElement.classList.contains('desktop-companion'),key=track+':'+active;
  if(key===lastPresentation||disposed)return;lastPresentation=key;const generation=++presentationGeneration;
  void call('worldAudio',{operation:'presentation',track,active}).then(value=>{if(!disposed&&generation===presentationGeneration)render(value);}).catch(()=>{if(!disposed&&generation===presentationGeneration){lastPresentation='';status.textContent='Sound unavailable';}});
 };
 const sceneObserver=new MutationObserver(present);if(world)sceneObserver.observe(world,{attributes:true,attributeFilter:['data-sound-track']});
 const projectionEvents=['worldlet:app-active','worldlet:app-inactive','worldlet:desktop-companion','focus','blur'];
 for(const event of projectionEvents)window.addEventListener(event,present);document.addEventListener('visibilitychange',present);
 call('worldAudio',{operation:'start'}).then(value=>{if(!disposed){render(value);present();}})
  .catch(()=>{status.textContent='Sound unavailable'});
 return ()=>{disposed=true;sceneObserver.disconnect();for(const event of projectionEvents)window.removeEventListener(event,present);document.removeEventListener('visibilitychange',present);window.removeEventListener('worldlet:celebration-sound',celebrate);document.removeEventListener('pointerdown',prime,true);document.removeEventListener('keydown',prime,true);window.removeEventListener('worldlet:applet-arrival',arrival);void cue?.close();window.removeEventListener('worldlet:audio',update);row.remove()};
}
