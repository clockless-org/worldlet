import path from 'node:path';
import fs from 'node:fs';
import {createAmbientSelection} from '../../../../../core/tools/index.ts';
import {pathToFileURL} from 'node:url';
import {WorldletError,errorMessage} from '../../files.ts';
import type {Preferences} from '../../preferences.ts';
import type {Row} from '../../host/types.ts';
import type {MediaSurface} from './surface.ts';
import {PodcastBookmarks,PodcastDirectory,RadioDirectory,streamURL,type RadioStation} from './directory.ts';
import {cancelled} from './io.ts';
import {setTimeout as sleep} from 'node:timers/promises';

export const TOGGLE_DURATION=0.7;
const DUCK=0.12;
const isNumber=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value);
const keysWithin=(body:Row,allowed:string[])=>Object.keys(body).every(key=>allowed.includes(key));

/** One audio element in the media surface. The host keeps the volume envelope so a
 * snapshot reports the output level without asking the page. */
export class SurfaceAudio {
 readonly id:string;
 private surface:MediaSurface;
 token=0;
 loaded=false;
 paused=true;
 time=0;
 duration:number|null=null;
 private level=0;
 private envelope:{from:number,to:number,start:number,duration:number}|null=null;
 private timer:NodeJS.Timeout|null=null;
 onMedia:(event:Row)=>void=()=>{};
 constructor(surface:MediaSurface,id:string){
  this.surface=surface;this.id=id;
  surface.onEvent(event=>{
   if(event.type==='gone'&&this.loaded){this.reset();this.onMedia({event:'error',error:1});return;}
   if(event.type!=='media'||event.id!==id||event.token!==this.token||!this.loaded)return;
   if(isNumber(event.time))this.time=event.time;
   if(event.duration===null||isNumber(event.duration))this.duration=event.duration;
   if(['pause','ended','error'].includes(event.event))this.paused=true;
   if(event.event==='playing')this.paused=false;
   this.onMedia(event);
  });
 }
 get volume(){
  const e=this.envelope;
  if(!e)return this.level;
  const progress=Math.min(1,(performance.now()-e.start)/(e.duration*1000));
  return e.from+(e.to-e.from)*progress*progress*(3-2*progress);
 }
 private reset(){this.cancelFade(false);this.loaded=false;this.paused=true;this.level=0;this.time=0;this.duration=null;}
 async load(url:string,loop:boolean){
  this.reset();const token=++this.token;this.loaded=true;
  await this.surface.call('load',this.id,token,url,loop);
  return token;
 }
 async play(){const info=await this.surface.call<Row|null>('play',this.id);this.paused=false;return info;}
 info(){return this.surface.call<Row|null>('info',this.id);}
 metadata(timeout:number){return this.surface.call<Row|null>('metadata',this.id,timeout);}
 seek(seconds:number){return this.surface.call<boolean>('seek',this.id,seconds);}
 pause(){this.paused=true;this.surface.callIfOpen('pause',this.id);}
 stop(){this.paused=true;this.time=0;this.surface.callIfOpen('stop',this.id);}
 unload(){if(!this.loaded)return;this.token++;this.reset();this.surface.callIfOpen('unload',this.id);}
 setVolume(value:number){this.cancelFade(false);this.level=value;this.surface.callIfOpen('volume',this.id,value);}
 fade(to:number,duration:number,completion?:()=>void){
  const from=this.volume;this.cancelFade(false);
  this.envelope={from,to,start:performance.now(),duration};
  this.surface.callIfOpen('fade',this.id,from,to,duration);
  this.timer=setTimeout(()=>{this.timer=null;this.envelope=null;this.level=to;completion?.();},duration*1000);
 }
 cancelFade(tellPage=true){
  if(this.envelope)this.level=this.volume;
  this.envelope=null;
  if(this.timer){clearTimeout(this.timer);this.timer=null;}
  if(tellPage)this.surface.callIfOpen('cancelFade',this.id);
 }
}

export interface Track {file:string;title:string;source?:string;sourceURL?:string;icon?:string}
export const MUSIC_TRACKS:Record<string,Track>={
 calm:{file:'bridge-at-dusk.m4a',title:'Bridge at Dusk'},
 focus:{file:'quiet-workshop.m4a',title:'Quiet Workshop'},
 brisk:{file:'morning-path.m4a',title:'Morning Path'}
};
export const AMBIENCE_TRACKS:Record<string,Track>={
 village:{file:'village-air.m4a',title:'Village Air'},
 ocean:{file:'ocean-shore.m4a',title:'Ocean Shore',source:'CC0 field recording · pulswelle',sourceURL:'https://freesound.org/people/pulswelle/sounds/339517/'},
 rain:{file:'soft-rain.m4a',title:'Soft Rain',source:'CC0 field recording · Q.K.',sourceURL:'https://freesound.org/people/Q.K./sounds/56306/'},
 forest:{file:'forest-air.m4a',title:'Forest Air',source:'CC0 field recording · kyles',sourceURL:'https://freesound.org/people/kyles/sounds/637559/'}
};
/** Only the build's local audio catalogue may name files. UI requests carry catalogue IDs. */
function themeTracks(webRoot:string):Record<string,Track>{
 const file=path.join(webRoot,'audio/theme-tracks.json');if(!fs.existsSync(file))return {};
 const tracks=JSON.parse(fs.readFileSync(file,'utf8'));
 for(const [id,t] of Object.entries<Track>(tracks))if(!/^theme:[a-z][a-z0-9-]*:[a-z][a-z0-9-]*$/.test(id)||!/^themes\/[a-z][a-z0-9-]*\/[a-z][a-z0-9-]*\.(wav|m4a|mp3|ogg)$/.test(t.file)||typeof t.title!=='string'||!['breeze','wave','tree','flame'].includes(t.icon||''))throw new WorldletError('Invalid bundled theme sound.');
 return tracks;
}
const has=(tracks:Record<string,Track>,id:unknown):id is string=>typeof id==='string'&&Object.hasOwn(tracks,id);

/** Bundled looping audio. App-owned playback outlives page navigation; never starts on its own. */
export class BackgroundMusic {
 private audio:SurfaceAudio;
 private preferences:Preferences;
 private directory:string;
 private file:string;
 private tracks:Record<string,Track>;
 private trackID:string;
 private track:string;
 private volumeKey:string;
 private duckReasons=new Set<string>();
 private state='stopped';
 private suspended=false;
 private playGeneration=0;
 private playbackError:string|null=null;
 private notify:()=>void;
 volume:number;
 constructor(audio:SurfaceAudio,preferences:Preferences,notify:()=>void,options:{directory:string,volumeKey:string,defaultVolume:number,trackID:string,tracks:Record<string,Track>}){
  this.audio=audio;this.preferences=preferences;this.notify=notify;this.directory=options.directory;this.tracks=options.tracks;
  this.trackID=options.trackID;this.track=options.tracks[options.trackID].title;this.file=options.tracks[options.trackID].file;this.volumeKey=options.volumeKey;
  const saved=preferences.get<unknown>(options.volumeKey);
  this.volume=isNumber(saved)?Math.min(1,Math.max(0,saved)):options.defaultVolume;
  audio.onMedia=event=>{
   if(event.event!=='error')return;
   audio.cancelFade();audio.stop();this.state='stopped';
   this.playbackError='Audio playback stopped because the audio could not be decoded.';this.notify();
  };
 }
 get snapshot():Row {
  const track=this.tracks[this.trackID];
  const result:Row={ok:this.playbackError===null,state:this.state,track:this.track,trackID:this.trackID,source:track?.source??'Built-in original audio',volume:this.volume,ducked:this.duckReasons.size>0,outputVolume:this.audio.loaded?this.audio.volume:0,position:this.audio.loaded?this.audio.time:0};
  if(track?.sourceURL)result.sourceURL=track.sourceURL;
  if(track?.icon)result.icon=track.icon;
  result.suspended=this.suspended;
  if(this.playbackError)result.error=this.playbackError;
  return result;
 }
 async command(body:Row):Promise<Row> {
  const operation=body.operation;
  if(typeof operation!=='string'||!['play','resume','pause','stop','volume','quieter','louder','status'].includes(operation))throw new WorldletError('Unsupported music control.');
  if(!keysWithin(body,['operation','volume','track']))throw new WorldletError('Unsupported music parameter.');
  if(operation==='volume'){if(!isNumber(body.volume)||body.volume<0||body.volume>1)throw new WorldletError('Music volume must be between 0 and 100 percent.');}
  else if(body.volume!==undefined)throw new WorldletError('Use the volume control to change music volume.');
  let selected:string|null=null;
  if(body.track!==undefined){
   if(operation!=='play'||!has(this.tracks,body.track))throw new WorldletError('Choose an available sound with the play control.');
   selected=body.track;
  }
  switch(operation){
   case 'play':case 'resume':{
    const generation=++this.playGeneration;
    if(this.suspended){this.state='playing';this.playbackError=null;break;}
    if(!this.audio.loaded||(selected!==null&&selected!==this.trackID)){
     const file=selected!==null?this.tracks[selected].file:this.file;
     this.audio.cancelFade();
     try{await this.audio.load(pathToFileURL(path.join(this.directory,file)).href,true);if(generation!==this.playGeneration)return this.snapshot;await this.audio.play();if(generation!==this.playGeneration){this.audio.pause();return this.snapshot;}}
     catch{this.audio.unload();throw new WorldletError('The built-in audio could not start. Check your audio output device.');}
     this.file=file;
     if(selected!==null){this.trackID=selected;this.track=this.tracks[selected].title;}
    }
    if(this.audio.paused){
     this.audio.setVolume(0);
     try{await this.audio.play();if(generation!==this.playGeneration){this.audio.pause();return this.snapshot;}}catch{throw new WorldletError('Music could not start. Check your audio output device.');}
    }
    this.playbackError=null;this.state='playing';this.applyVolume(TOGGLE_DURATION);
    break;
   }
   case 'pause':this.fadeOut(false);break;
   case 'stop':this.fadeOut(true);this.playbackError=null;break;
   case 'volume':case 'quieter':case 'louder':
    this.volume=operation==='volume'?body.volume:Math.min(1,Math.max(0,this.volume+(operation==='louder'?0.1:-0.1)));
    this.preferences.set(this.volumeKey,this.volume);this.applyVolume();
    break;
  }
  this.notify();
  return this.snapshot;
 }
 /** Change the authored background without starting a stopped channel or changing its volume. */
 async present(trackID:string,suspended:boolean){
  if(!has(this.tracks,trackID))throw new WorldletError('Unknown ambience track.');
  const changed=trackID!==this.trackID,resumed=this.suspended&&!suspended;
  if(changed){this.audio.unload();this.trackID=trackID;this.file=this.tracks[trackID].file;this.track=this.tracks[trackID].title;this.playbackError=null;}
  this.suspended=suspended;
  if(suspended){this.audio.cancelFade();this.audio.pause();this.audio.setVolume(0);}
  else if(this.state==='playing'&&(changed||resumed))await this.command({operation:'play'});
  this.notify();
 }
 /** Switching sources is exclusive, not a crossfade. Retain the playhead. */
 pauseForSwitch(){
  this.playGeneration++;this.audio.cancelFade();this.audio.pause();this.audio.setVolume(0);
  if(this.state==='playing')this.state='paused';
  this.notify();
 }
 setDucked(value:boolean,reason:string){if(value)this.duckReasons.add(reason);else this.duckReasons.delete(reason);this.applyVolume();}
 /** Voice/volume changes must not cancel a pending fade-out or restore sound. */
 private applyVolume(duration=0.35){
  if(this.suspended||this.state!=='playing'||!this.audio.loaded)return;
  this.audio.fade(this.volume*(this.duckReasons.size?DUCK:1),duration);
 }
 private fadeOut(stop:boolean){
  this.playGeneration++;
  this.state=stop?'stopped':'paused';
  if(!this.audio.loaded)return;
  const audio=this.audio,token=audio.token;
  audio.fade(0,TOGGLE_DURATION,()=>{if(audio.token!==token)return;if(stop)audio.stop();else audio.pause();});
 }
 stop(){this.playGeneration++;this.audio.cancelFade();this.audio.unload();this.state='stopped';}
}

/** Network radio and podcasts: one validated HTTPS stream at a time, no downloads. */
export class RadioMusic {
 private audio:SurfaceAudio;
 private preferences:Preferences;
 private notify:()=>void;
 private canResumeDuringFade=false;
 private generation=0;
 private observed=-1;
 private progress:NodeJS.Timeout|null=null;
 private pendingRequestID:string|null=null;
 private duckReasons=new Set<string>();
 private station:RadioStation|null=null;
 private selectedGenre='chillout';
 private state='stopped';
 private error:string|null=null;
 volume:number;
 kind='radio';
 get selectedShow(){return this.selectedGenre;}
 constructor(audio:SurfaceAudio,preferences:Preferences,notify:()=>void){
  this.audio=audio;this.preferences=preferences;this.notify=notify;
  const saved=preferences.get<unknown>('worldlet.music.volume');
  this.volume=isNumber(saved)?Math.min(1,Math.max(0,saved)):0.24;
  audio.onMedia=event=>{
   if(this.observed!==this.generation)return;
   if(event.event==='error'){this.state='error';this.error='Radio playback stopped. Try another station.';}
   else if(event.event==='playing')this.state='playing';
   else if(event.event==='pause'||event.event==='ended')this.state='paused';
   else if(event.event==='waiting'||event.event==='stalled')this.state='buffering';
   else return;
   this.notify();
  };
 }
 get snapshot():Row {
  const result:Row={ok:this.error===null,source:this.kind,kind:this.kind,state:this.state,track:this.station?.name??(this.kind==='podcast'?'Podcast':'Internet radio'),stationID:this.station?.stationuuid??'',genre:this.selectedGenre,volume:this.volume,ducked:this.duckReasons.size>0,outputVolume:this.audio.loaded?this.audio.volume:0};
  if(this.error)result.error=this.error;
  if(this.kind==='podcast'&&this.station){result.showID=this.station.stationuuid;if(this.station.publishedAt)result.episodePublishedAt=this.station.publishedAt;}
  return result;
 }
 private savedProgress='';
 /** Saves the podcast position, skipping a write when the show and position have not moved. */
 private saveProgress(){
  if(this.kind!=='podcast'||!this.audio.loaded||!this.station)return;
  const key=JSON.stringify([this.selectedGenre,this.station.url_resolved,this.audio.time]);
  if(key===this.savedProgress)return;
  this.savedProgress=key;
  PodcastBookmarks.save(this.preferences,this.selectedGenre,this.station,this.audio.time,this.audio.duration??NaN);
 }
 private clearPlayer(){
  this.saveProgress();
  if(this.progress){clearInterval(this.progress);this.progress=null;}
  this.audio.cancelFade();this.canResumeDuringFade=false;this.observed=-1;this.audio.unload();
 }
 cancelPending(id:string){if(this.pendingRequestID===id&&this.state==='loading')this.pause();}
 pause(stop=false,immediate=false){
  this.saveProgress();
  this.canResumeDuringFade=!stop&&(['playing','buffering'].includes(this.state)||this.canResumeDuringFade);
  this.pendingRequestID=null;this.generation+=1;this.observed=-1;
  this.state=stop?'stopped':'paused';this.error=null;
  if(immediate)this.clearPlayer();
  else if(this.audio.loaded){const token=this.audio.token;this.audio.fade(0,TOGGLE_DURATION,()=>{if(this.audio.token===token)this.clearPlayer();});}
  this.notify();
 }
 adjust(body:Row):Row {
  const operation=body.operation;
  if(!keysWithin(body,['operation','volume'])||!['volume','quieter','louder','status'].includes(operation))throw new WorldletError('Unsupported radio control.');
  if(operation==='volume'){
   if(!isNumber(body.volume)||body.volume<0||body.volume>1)throw new WorldletError('Music volume must be between 0 and 100 percent.');
   this.volume=body.volume;
  }else{
   if(body.volume!==undefined)throw new WorldletError('Use the volume control to change volume.');
   if(operation==='quieter')this.volume=Math.max(0,this.volume-0.1);
   if(operation==='louder')this.volume=Math.min(1,this.volume+0.1);
  }
  if(operation!=='status'){this.preferences.set('worldlet.music.volume',this.volume);this.applyVolume();this.notify();}
  return this.snapshot;
 }
 setDucked(value:boolean,reason:string){if(value)this.duckReasons.add(reason);else this.duckReasons.delete(reason);this.applyVolume();}
 private applyVolume(duration=0.35){
  if(!['playing','buffering'].includes(this.state)||!this.audio.loaded)return;
  this.audio.fade(this.volume*(this.duckReasons.size?DUCK:1),duration);
 }
 async play(raw:string|null=null,next=false,requestID:string|null=null,requestedKind:string|null=null,latest=false):Promise<Row> {
  const wanted=requestedKind??this.kind;
  // Switching between a station and an episode is a different thing to listen to, never a resume.
  if(wanted!==this.kind){this.clearPlayer();this.station=null;this.selectedGenre='';this.kind=wanted;}
  const genre=wanted==='podcast'?PodcastDirectory.term(raw??this.selectedGenre):RadioDirectory.genre(raw??this.selectedGenre);
  if(!next&&!latest&&genre===this.selectedGenre&&this.state==='playing')return this.snapshot;
  // Reversing an in-flight toggle keeps the live stream and current gain.
  if(!next&&!latest&&genre===this.selectedGenre&&this.state==='paused'&&this.canResumeDuringFade&&this.audio.loaded){
   const info=await this.audio.info().catch(()=>null);
   if(info&&!info.error&&info.readyState>=3&&this.state==='paused'&&this.audio.loaded){
    this.generation+=1;this.state='playing';this.error=null;
    void this.audio.play().catch(()=>{});
    this.applyVolume(TOGGLE_DURATION);this.observe(this.generation);this.notify();
    return this.snapshot;
   }
  }
  this.generation+=1;const token=this.generation,previous=this.station;
  this.pendingRequestID=requestID;
  try{
   this.clearPlayer();if(genre!==this.selectedGenre)this.station=null;
   this.selectedGenre=genre;this.state='loading';this.error=null;this.notify();
   let candidates:RadioStation[];
   const saved=this.kind==='podcast'&&!next&&!latest?PodcastBookmarks.load(this.preferences)[genre.toLowerCase()]:undefined;
   const bookmark=saved&&typeof saved.station?.stationuuid==='string'&&saved.station.stationuuid.startsWith('podcast:')&&isNumber(saved.seconds)?saved:undefined;
   if(bookmark&&bookmark.seconds>0)candidates=[bookmark.station];
   else if(raw===null&&!next&&!latest&&previous)candidates=[previous];
   else candidates=this.kind==='podcast'?await PodcastDirectory.episodes(genre):await RadioDirectory.stations(genre);
   if(token!==this.generation)throw cancelled();
   if(next&&previous){
    const index=candidates.findIndex(c=>c.url_resolved===previous.url_resolved);
    if(this.kind==='podcast'&&index>=0)candidates=candidates.slice(index+1);
    else candidates=candidates.filter(c=>c.url_resolved!==previous.url_resolved);
   }
   // Podcast failures must not silently select another episode or show.
   for(const candidate of candidates.slice(0,this.kind==='podcast'?1:3)){
    if(token!==this.generation)throw cancelled();
    const url=streamURL(candidate);
    if(!url)continue;
    await this.audio.load(url,false);this.station=candidate;
    void this.audio.play().catch(()=>{});
    let restored=false,firstPlaybackTime:number|null=null;
    for(let attempt=0;attempt<100;attempt++){
     await sleep(100);
     if(token!==this.generation)throw cancelled();
     const info=await this.audio.info().catch(()=>null);
     if(token!==this.generation)throw cancelled();
     if(!info||info.error)break;
     if(!restored&&info.readyState>=1){
      restored=true;
      if(bookmark&&bookmark.station.url_resolved===candidate.url_resolved&&bookmark.seconds>0){
       const duration=info.duration;
       if(!isNumber(duration)||bookmark.seconds<duration-5){
        const sought=await this.audio.seek(bookmark.seconds);
        if(token!==this.generation)throw cancelled();
        if(!sought)throw new WorldletError('Could not resume this episode at its saved position.');
        void this.audio.play().catch(()=>{});
       }
      }
     }
     const time=info.time;
     if(info.readyState>=3&&!info.paused&&isNumber(time)){if(firstPlaybackTime===null)firstPlaybackTime=time;}
     else firstPlaybackTime=null;
     if(firstPlaybackTime!==null&&time-firstPlaybackTime>=0.15){
      this.state='playing';this.error=null;this.audio.paused=false;this.applyVolume(TOGGLE_DURATION);this.observe(token);this.notify();
      if(this.kind==='radio')void RadioDirectory.reportPlayback(candidate.stationuuid);
      return this.snapshot;
     }
    }
    this.clearPlayer();
   }
   throw new WorldletError(next?'No other station could start. Try another style.':'The station could not start. Check your connection or try another style.');
  }catch(error){
   if(token===this.generation){this.clearPlayer();this.state='error';this.error=errorMessage(error);this.notify();}
   throw error;
  }finally{if(token===this.generation)this.pendingRequestID=null;}
 }
 private observe(token:number){
  this.observed=token;
  if(this.progress)clearInterval(this.progress);
  this.progress=setInterval(()=>{if(this.generation===token)this.saveProgress();},5000);
 }
 stop(){this.pause(true,true);}
}

/** One audible source across ambience, bundled music, radio and podcasts. */
export class WorldAudio {
 private preferences:Preferences;
 private presentationTracks:Record<string,Track>;
 private selection=createAmbientSelection();
 private queue:Promise<unknown>=Promise.resolve();
 readonly ambience:BackgroundMusic;
 readonly music:BackgroundMusic;
 readonly radio:RadioMusic;
 private radioSelected=true;
 private error:string|null=null;
 private changed:()=>void;
 constructor(surface:MediaSurface,preferences:Preferences,webRoot:string,changed:()=>void){
  this.preferences=preferences;this.changed=changed;this.presentationTracks=themeTracks(webRoot);
  const directory=path.join(webRoot,'audio');
  this.music=new BackgroundMusic(new SurfaceAudio(surface,'music'),preferences,changed,{directory,volumeKey:'worldlet.music.volume',defaultVolume:0.24,trackID:'calm',tracks:MUSIC_TRACKS});
  this.radio=new RadioMusic(new SurfaceAudio(surface,'radio'),preferences,changed);
  // Start silent. The UI projects the current theme; explicit choices remain session-local.
  this.ambience=new BackgroundMusic(new SurfaceAudio(surface,'ambience'),preferences,changed,{directory,volumeKey:'worldlet.ambience.volume',defaultVolume:0.18,trackID:'village',tracks:{...AMBIENCE_TRACKS,...this.presentationTracks}});
 }
 get snapshot():Row {
  const value:Row={ambience:this.ambience.snapshot,music:this.radioSelected?this.radio.snapshot:this.music.snapshot};
  if(this.error)value.error=this.error;
  return value;
 }
 private enqueue<T>(run:()=>Promise<T>):Promise<T>{const task=this.queue.then(run);this.queue=task.catch(()=>{});return task;}
 command(body:Row):Promise<Row>{return ['presentation','ambience'].includes(String(body.operation))?this.enqueue(()=>this.runCommand(body)):this.runCommand(body);}
 control(body:Row):Promise<Row>{return body.channel==='ambience'?this.enqueue(()=>this.runControl(body)):this.runControl(body);}
 private async runCommand(body:Row):Promise<Row> {
  const operation=body.operation;
  if(typeof operation!=='string')throw new WorldletError('Missing audio control.');
  this.error=null;
  switch(operation){
   case 'presentation':{
    if(!keysWithin(body,['action','operation','track','active'])||typeof body.active!=='boolean'||!(body.track==='village'||has(this.presentationTracks,body.track)))throw new WorldletError('Unknown theme ambience.');
    this.selection.present(String(body.track),body.active);const next=this.selection.current;
    await this.ambience.present(next.track,next.suspended);break;
   }
   case 'start':break; // Mounting/reloading the HUD only observes audio.
   case 'ambience':{
    if(typeof body.enabled!=='boolean')throw new WorldletError('Missing ambience setting.');
    if(body.enabled&&this.ambience.volume===0)await this.ambience.command({operation:'volume',volume:0.18});
    // The sound menu names what you hear, so it can choose it; unknown ids are refused.
    if(body.enabled&&typeof body.track==='string'){
     if(!has(AMBIENCE_TRACKS,body.track))throw new WorldletError('Unknown ambience track.');
     await this.runControl({channel:'ambience',operation:'play',track:body.track});
     this.preferences.set('worldlet.ambience.track',body.track);
    }else await this.runControl({channel:'ambience',operation:body.enabled?'play':'pause'});
    this.preferences.set('worldlet.ambience.enabled',body.enabled);
    break;
   }
   case 'music':{
    if(typeof body.enabled!=='boolean')throw new WorldletError('Missing music setting.');
    const current=this.radioSelected?this.radio.volume:this.music.volume;
    if(body.enabled&&current===0)await this.runControl({operation:'volume',volume:0.24});
    await this.runControl({operation:body.enabled?'play':'pause'});
    break;
   }
   case 'podcast':{
    const current=this.radioSelected?this.radio.volume:this.music.volume;
    if(current===0)await this.runControl({operation:'volume',volume:0.24});
    const forward:Row={operation:'podcast'};
    if(typeof body.show==='string')forward.show=body.show;
    else if(typeof body.genre==='string')forward.show=body.genre;
    if(body.episode!==undefined&&body.episode!==null)forward.episode=body.episode;
    await this.runControl(forward);
    break;
   }
   case 'status':break;
   default:throw new WorldletError('Unsupported audio control.');
  }
  return this.snapshot;
 }
 /** Exact local commands and Fox use this same validated playback path. */
 private async runControl(body:Row):Promise<Row> {
  const channel=body.channel??'music';
  if(typeof channel!=='string'||!['music','ambience'].includes(channel))throw new WorldletError('Unknown audio channel.');
  const operation=body.operation;
  if(typeof operation!=='string')throw new WorldletError('Missing audio control.');
  const requestID=typeof body.requestID==='string'?body.requestID:null;
  const args:Row={};
  for(const [key,value] of Object.entries(body))if(key!=='channel'&&key!=='requestID'&&value!==undefined)args[key]=value;
  if(args.track!==undefined||channel==='ambience'&&['play','resume'].includes(operation)){
   const tracks=channel==='ambience'?AMBIENCE_TRACKS:MUSIC_TRACKS;
   if(!keysWithin(args,['operation','track'])||!['play','resume'].includes(operation)||!(args.track===undefined||operation==='play'&&has(tracks,args.track)))throw new WorldletError('Choose an available sound with the play control.');
  }
  let result:Row;
  if(channel==='ambience'){
   if(['play','resume'].includes(operation))this.selectChannel('ambience');
   if(typeof args.track==='string'){this.selection.choose(args.track);await this.ambience.present(args.track,false);}
   result=await this.ambience.command(args);
  }else if(['radio','next','podcast'].includes(operation)){
   const podcast=operation==='podcast';
   if(!keysWithin(args,['operation','genre','show','episode'])||args.episode!==undefined&&!podcast||operation==='next'&&(args.genre!==undefined||args.show!==undefined))throw new WorldletError('Unsupported radio parameter.');
   const selection=typeof args.episode==='string'?args.episode:'latest';
   if(args.episode!==undefined&&!(typeof args.episode==='string'&&['latest','resume'].includes(selection)))throw new WorldletError('Choose latest or resume for this podcast.');
   let genre:string|null;
   if(podcast){
    // A podcast with no show named and none playing still plays something.
    const named=args.show??args.genre;
    const resume=this.radio.kind==='podcast'&&this.radio.selectedShow?this.radio.selectedShow:null;
    genre=PodcastDirectory.term(typeof named==='string'?named:resume??PodcastDirectory.anything);
   }else if(operation==='radio'){
    if(typeof args.genre!=='string')throw new WorldletError('Choose a radio style.');
    genre=RadioDirectory.genre(args.genre);
   }else genre=null;
   if(!this.radioSelected)this.radio.adjust({operation:'volume',volume:this.music.volume});
   this.selectChannel('music');this.music.pauseForSwitch();this.radioSelected=true;
   result=await this.radio.play(genre,operation==='next',requestID,podcast?'podcast':operation==='next'?this.radio.kind:'radio',podcast&&selection==='latest');
  }else if(args.track!==undefined){
   this.selectChannel('music');this.radio.pause(false,true);
   result=await this.music.command(args);
   if(this.radioSelected)result=await this.music.command({operation:'volume',volume:this.radio.volume});
   this.radioSelected=false;this.radio.pause(true);
  }else if(this.radioSelected){
   if(!keysWithin(args,['operation','volume']))throw new WorldletError('Unsupported audio parameter.');
   if(['play','resume','pause','stop'].includes(operation)){
    if(args.volume!==undefined)throw new WorldletError('Use the volume control to change volume.');
    if(operation==='play'||operation==='resume'){this.selectChannel('music');result=await this.radio.play(null,false,requestID);}
    else{this.radio.pause(operation==='stop');result=this.radio.snapshot;}
   }else result=this.radio.adjust(args);
  }else{
   if(['play','resume'].includes(operation))this.selectChannel('music');
   result=await this.music.command(args);
  }
  if(channel==='ambience'){
   if(['play','resume','pause','stop'].includes(operation))this.preferences.set('worldlet.ambience.enabled',result.state==='playing');
   if(operation==='play')this.preferences.set('worldlet.ambience.track',result.trackID);
  }
  this.changed();
  result.channel=channel;
  return result;
 }
 private selectChannel(channel:string){
  if(channel==='ambience'){this.music.pauseForSwitch();this.radio.pause(false,true);}
  else{this.ambience.pauseForSwitch();this.preferences.set('worldlet.ambience.enabled',false);}
 }
 setDucked(value:boolean,reason:string){this.music.setDucked(value,reason);this.radio.setDucked(value,reason);this.ambience.setDucked(value,reason);this.changed();}
 stop(){this.music.stop();this.ambience.stop();this.radio.stop();this.changed();}
}
