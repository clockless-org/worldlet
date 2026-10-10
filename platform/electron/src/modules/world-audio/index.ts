import {WorldletError} from '../../files.ts';
import {AUDIO,MEDIA,type AudioService,type MediaService} from '../../host/services.ts';
import type {Host} from '../../host/types.ts';
import {WorldAudio} from './audio.ts';
import {LocalMusic} from './local-music.ts';

/** The World's sound: ambience, music, radio and podcasts on the media surface, and the computer's own music players. */
export function installWorldAudio(host:Host){
 const {store,preferences,page}=host;
 const {surface}=host.use<MediaService>(MEDIA);
 let pushQueued=false;
 const audioChanged=()=>{
  if(pushQueued)return;pushQueued=true;
  setImmediate(()=>{pushQueued=false;if(page.ready())void page.call('worldletAudio',audio.snapshot);});
 };
 const audio=new WorldAudio(surface,preferences,host.profile.webRoot,audioChanged);
 // The computer's own music players (Apple Music, Spotify, 汽水音乐…), controlled from the World's corner.
 const music=new LocalMusic(state=>{if(page.ready())void page.call('worldletLocalMusic',state);});
 host.provide<AudioService>(AUDIO,{setDucked:(active,reason)=>audio.setDucked(active,reason),snapshot:()=>audio.snapshot,stop:()=>audio.stop()});
 host.register({
  worldAudio:request=>audio.command(request),
  localMusic:request=>{
   const operation=typeof request.operation==='string'?request.operation:'status';
   // The practice world never shows the person's own music.
   if(operation==='watch')return music.watch(request.active===true&&!store.sampleEnabled());
   if(store.sampleEnabled())throw new WorldletError('Open your personal world to control your music.');
   if(operation==='status')return music.snapshot;
   if(operation==='command')return music.command(request);
   return music.appleMusic(request);
  },
  backgroundMusic:request=>{const {action:_action,...body}=request;return audio.control(body);},
  cancelAudioRequest:request=>{if(typeof request.requestID==='string')audio.radio.cancelPending(request.requestID);return {ok:true};},
 });
 host.onPageLoaded(()=>audio.setDucked(false,'live'));
 host.onPageReload(()=>{music.watch(false);});
 host.onQuit(()=>{music.watch(false);});
}
