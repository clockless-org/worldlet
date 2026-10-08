import path from 'node:path';
import {spawn,type ChildProcess} from 'node:child_process';
import {LOCAL_MUSIC_LIMITS,MEDIA_REMOTE_COMMANDS,localMusicCommand,localMusicQuery,readNowPlaying,readPlaylists,readTracks,type LocalMusicState} from '../../../../../core/applets/index.ts';
import {WorldletError} from '../../files.ts';
import type {Row} from '../../host/types.ts';
import {WINDOWS_BASE,children,end,environment,jsonLines,run} from './io.ts';

// Local music players (core/applets/local-music.ts). A Mac says what is playing through MediaRemote, which
// macOS 15.4 opened only to Apple's own programs, so an osascript (com.apple.osascript) helper asks it for
// any player's track (MRNowPlayingRequest) and sends play, pause and skip (MRMediaRemoteSendCommand). Apple
// Music's playlists and library search go through its own scripting, which asks once for Automation.
// Windows asks the system media transport controls through PowerShell. One watcher runs only while the World
// is in front and prints a line when the track or its state changes; it ends itself after ten minutes and is
// started again if the World still shows. Requests travel on stdin as JSON, never as script text.

const OSASCRIPT='/usr/bin/osascript';
const WATCH_SECONDS=600;

const MAC_PRELUDE=String.raw`
ObjC.import('Foundation');ObjC.import('AppKit');
const none=v=>v===undefined||v===null||(typeof v.isNil==='function'&&v.isNil());
const text=v=>{if(none(v))return '';try{const s=ObjC.unwrap(v);return typeof s==='string'?s:'';}catch(e){return '';}};
$.NSBundle.bundleWithPath('/System/Library/PrivateFrameworks/MediaRemote.framework/').load;
const Request=$.NSClassFromString('MRNowPlayingRequest');
function nowPlaying(){
 if(none(Request))return {unsupported:true};
 const item=Request.localNowPlayingItem;if(none(item))return {none:true};
 const info=item.nowPlayingInfo;if(none(info))return {none:true};
 const path=Request.localNowPlayingPlayerPath,client=none(path)?null:path.client;
 const bundle=client&&!none(client)?text(client.bundleIdentifier):'',name=client&&!none(client)?text(client.displayName):'';
 const field=key=>text(info.valueForKey('kMRMediaRemoteNowPlayingInfo'+key));
 return {bundle,app:name,title:field('Title'),artist:field('Artist'),album:field('Album'),playing:Request.localIsPlaying===true||Request.localIsPlaying==1};
}
`;
const MAC_WATCH=MAC_PRELUDE+String.raw`
const out=$.NSFileHandle.fileHandleWithStandardOutput;
const write=v=>out.writeData($.NSString.alloc.initWithUTF8String(JSON.stringify(v)+'\n').dataUsingEncoding($.NSUTF8StringEncoding));
const until=Date.now()+${WATCH_SECONDS}*1000;let last='';
while(Date.now()<until){
 let value;try{value=nowPlaying();}catch(e){value={failure:String(e)};}
 const line=JSON.stringify(value);if(line!==last){write(value);last=line;}
 if(value.unsupported)break;
 $.NSThread.sleepForTimeInterval(1.5);
}
`;
const MAC_INPUT=String.raw`const input=JSON.parse(ObjC.unwrap($.NSString.alloc.initWithDataEncoding($.NSFileHandle.fileHandleWithStandardInput.readDataToEndOfFile,$.NSUTF8StringEncoding)));`;
// The command goes to whichever player has the system's now playing, like the keyboard's media keys. If
// MediaRemote refuses, Apple Music and Spotify are told directly through their own scripting. While that
// player is Worldlet itself the command would only reach its own hidden sound page, so none is sent.
const MAC_COMMAND=MAC_PRELUDE+MAC_INPUT+String.raw`
let sent=false;const own=(()=>{try{const now=nowPlaying();return /^app\.worldlet(\.|$)/i.test(now.bundle||'')||now.title==='Worldlet media';}catch(e){return false;}})();
if(own){sent=null;}else try{ObjC.bindFunction('MRMediaRemoteSendCommand',['bool',['int','id']]);sent=$.MRMediaRemoteSendCommand(input.code,$())==true;}catch(e){}
if(sent===false){
 const now=nowPlaying(),names={'com.apple.Music':'Music','com.spotify.client':'Spotify'},name=names[now.bundle];
 if(name&&Application(name).running()){
  const player=Application(name);
  ({play:()=>player.play(),pause:()=>player.pause(),toggle:()=>player.playpause(),next:()=>player.nextTrack(),previous:()=>player.previousTrack()})[input.command]();
  sent=true;
 }
}
JSON.stringify({ok:sent===true});
`;
// Apple Music's own scripting. A refusal (-1743) means Automation for Music is off.
const APPLE_MUSIC=MAC_INPUT+String.raw`
function work(){
 const music=Application('Music');
 if(input.operation==='playlists'){
  const lists=music.userPlaylists,names=lists.name(),ids=lists.persistentID();let kinds=[];try{kinds=lists.specialKind();}catch(e){}
  // Folders and Apple's own lists (Library, Purchased) are left out; the person's own and smart lists stay.
  return {playlists:names.map((name,i)=>({id:ids[i],name,kind:kinds[i]})).filter(p=>!p.kind||p.kind==='none').slice(0,${LOCAL_MUSIC_LIMITS.playlists})};
 }
 if(input.operation==='playPlaylist'){const found=music.userPlaylists.whose({persistentID:input.id});if(!found.length)return {missing:true};found[0].play();return {ok:true,name:found[0].name()};}
 if(input.operation==='search'){
  const tracks=music.search(music.libraryPlaylists[0],{for:input.query})||[];
  return {tracks:tracks.slice(0,${LOCAL_MUSIC_LIMITS.results}).map(t=>({id:t.persistentID(),title:t.name(),artist:t.artist(),album:t.album()}))};
 }
 if(input.operation==='playTrack'){const found=music.libraryPlaylists[0].tracks.whose({persistentID:input.id});if(!found.length)return {missing:true};found[0].play();return {ok:true,name:found[0].name()};}
 return {missing:true};
}
let result;try{result=work();}catch(e){result=String(e).includes('-1743')?{denied:true}:{failure:String(e)};}
JSON.stringify(result);
`;

const WINDOWS_PRELUDE=String.raw`
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asTask=([System.WindowsRuntimeSystemExtensions].GetMethods()|Where-Object{$_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation${'`'}1'})[0]
function Await($operation,[Type]$type){$task=$asTask.MakeGenericMethod($type).Invoke($null,@($operation));$null=$task.Wait(5000);$task.Result}
$null=[Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager,Windows.Media.Control,ContentType=WindowsRuntime]
$manager=Await ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])
function NowPlaying(){
 $session=$manager.GetCurrentSession()
 if(-not $session){return @{none=$true}}
 $properties=Await ($session.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
 $value=@{player=$session.SourceAppUserModelId;title=$properties.Title;artist=$properties.Artist;album=$properties.AlbumTitle;playing=($session.GetPlaybackInfo().PlaybackStatus.ToString() -eq 'Playing')}
 $value
}
`;
const WINDOWS_WATCH=WINDOWS_PRELUDE+String.raw`
$until=(Get-Date).AddSeconds(${WATCH_SECONDS});$last=''
while((Get-Date) -lt $until){
 try{$value=NowPlaying}catch{$value=@{failure=$_.Exception.Message}}
 $line=(($value.GetEnumerator()|Sort-Object Key|ForEach-Object{"$($_.Key)=$($_.Value)"}) -join ';')
 if($line -ne $last){[Console]::Out.WriteLine(($value|ConvertTo-Json -Compress));[Console]::Out.Flush();$last=$line}
 Start-Sleep -Milliseconds 1500
}
`;
const WINDOWS_COMMAND=WINDOWS_PRELUDE+String.raw`
$command=[Console]::In.ReadToEnd().Trim()
$session=$manager.GetCurrentSession()
if(-not $session -or $session.SourceAppUserModelId -match '(?i)(^app\.worldlet|worldlet( web)?(\.exe)?$)'){'{"ok":false}';exit}
$operation=switch($command){'play'{$session.TryPlayAsync()}'pause'{$session.TryPauseAsync()}'toggle'{$session.TryTogglePlayPauseAsync()}'next'{$session.TrySkipNextAsync()}'previous'{$session.TrySkipPreviousAsync()}}
@{ok=[bool](Await $operation ([bool]))}|ConvertTo-Json -Compress
`;

const powershell=()=>path.join(process.env.SystemRoot??'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe');
const macEnv=()=>environment(['HOME','USER','LOGNAME','TMPDIR'],{PATH:'/usr/bin:/bin:/usr/sbin:/sbin',LANG:'en_US.UTF-8'});

export class LocalMusic {
 readonly supported=process.platform==='darwin'||process.platform==='win32';
 private watcher:ChildProcess|null=null;
 private wanted=false;
 private state:LocalMusicState={supported:this.supported,nowPlaying:null,revision:0};
 /** Helpers in a row that ended within a minute of starting: each waits twice as long, and five end it. */
 private quickEnds=0;
 private restart:ReturnType<typeof setTimeout>|null=null;
 private changed:(state:LocalMusicState)=>void;
 constructor(changed:(state:LocalMusicState)=>void){this.changed=changed;}
 get snapshot(){return this.state;}

 /** The World is in front (watch) or not (stop): only then does a helper look. */
 watch(active:boolean){
  this.wanted=active&&this.supported&&this.state.supported;
  // The World coming back to the front is a fresh start, even after a helper gave up.
  this.quickEnds=0;if(this.restart){clearTimeout(this.restart);this.restart=null;}
  if(this.wanted)this.start();else this.stop();
  return this.state;
 }
 stop(){const child=this.watcher;this.watcher=null;if(child){children.delete(child);void end(child);}}
 private start(){
  if(this.watcher)return;
  const mac=process.platform==='darwin';
  let child:ChildProcess;
  try{
   child=mac?spawn(OSASCRIPT,['-l','JavaScript','-e',MAC_WATCH],{env:macEnv(),stdio:['ignore','pipe','ignore']})
    :spawn(powershell(),['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-Command',WINDOWS_WATCH],{env:environment(WINDOWS_BASE),stdio:['ignore','pipe','ignore'],windowsHide:true});
  }catch{return;}
  this.watcher=child;children.add(child);
  const started=Date.now();
  child.stdout!.on('data',jsonLines(value=>{if(this.watcher===child)this.receive(value);},()=>this.stop(),LOCAL_MUSIC_LIMITS.line));
  child.on('error',()=>{});
  child.on('close',()=>{
   children.delete(child);
   if(this.watcher!==child)return;
   this.watcher=null;
   // It ends itself after ten minutes and starts again. One that ends early waits 2, 4, 8, 16 s, and after
   // five in a row it is left stopped until the World comes back to the front.
   this.quickEnds=Date.now()-started<60_000?this.quickEnds+1:0;
   if(!this.wanted||!this.state.supported||this.quickEnds>=5)return;
   this.restart=setTimeout(()=>{this.restart=null;if(this.wanted&&!this.watcher)this.start();},2000*2**Math.max(0,this.quickEnds-1));
  });
 }
 private receive(value:Row){
  if(value.unsupported){this.state={...this.state,supported:false,nowPlaying:null};this.wanted=false;this.publish();return;}
  if(value.failure)return;
  this.state={...this.state,nowPlaying:readNowPlaying(value)};
  this.publish();
 }
 private publish(){this.state={...this.state,revision:this.state.revision+1};this.changed(this.state);}

 async command(request:Row){
  const command=localMusicCommand(request.command);
  if(!command)throw new WorldletError('Choose play, pause, next or previous.');
  if(!this.supported)throw new WorldletError('This computer cannot control its music players from Worldlet.');
  const mac=process.platform==='darwin';
  const result=mac
   ?await run(OSASCRIPT,['-l','JavaScript','-e',MAC_COMMAND],{env:macEnv(),timeout:8000,limit:4000,input:JSON.stringify({command,code:MEDIA_REMOTE_COMMANDS[command]})})
   :await run(powershell(),['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-Command',WINDOWS_COMMAND],{env:environment(WINDOWS_BASE),timeout:10000,limit:4000,input:command});
  let answer:Row={};try{answer=JSON.parse(result.stdout.toString('utf8').trim()||'{}');}catch{}
  if(answer.ok!==true)throw new WorldletError(this.state.nowPlaying?`${this.state.nowPlaying.app} did not take the command.`:'Nothing is playing on this computer.');
  // Show the change at once; the watcher confirms it on its next look.
  const now=this.state.nowPlaying;
  if(now&&(command==='play'||command==='pause'||command==='toggle')){
   this.state={...this.state,nowPlaying:{...now,playing:command==='toggle'?!now.playing:command==='play'}};this.publish();
  }
  return {ok:true,command,nowPlaying:this.state.nowPlaying};
 }

 /** Apple Music's playlists and library (Mac): its own scripting, after the person asks for them. */
 async appleMusic(request:Row){
  if(process.platform!=='darwin')throw new WorldletError('Apple Music playlists are available on a Mac.');
  const operation=typeof request.operation==='string'?request.operation:'';
  let input:Row;
  if(operation==='playlists')input={operation};
  else if(operation==='playPlaylist'||operation==='playTrack'){
   if(typeof request.id!=='string'||!/^[0-9A-F]{16}$/.test(request.id))throw new WorldletError('Choose a playlist or a song from the list.');
   input={operation,id:request.id};
  }else if(operation==='search'){
   const query=localMusicQuery(request.query);if(!query)throw new WorldletError('Say what to look for in Apple Music.');
   input={operation,query};
  }else throw new WorldletError('Unknown Apple Music request.');
  const result=await run(OSASCRIPT,['-l','JavaScript','-e',APPLE_MUSIC],{env:macEnv(),timeout:30000,limit:400_000,input:JSON.stringify(input)});
  let answer:Row={};try{answer=JSON.parse(result.stdout.toString('utf8').trim()||'{}');}catch{}
  if(answer.denied)throw new WorldletError('Worldlet is not allowed to control Music. Turn it on in System Settings › Privacy & Security › Automation, then try again.');
  if(answer.failure)throw new WorldletError('Apple Music did not answer. Open Music and try again.');
  if(answer.missing)throw new WorldletError('That is no longer in your Apple Music library.');
  if(operation==='playlists')return {playlists:readPlaylists(answer.playlists)};
  if(operation==='search')return {tracks:readTracks(answer.tracks)};
  return {ok:true,name:typeof answer.name==='string'?answer.name.slice(0,LOCAL_MUSIC_LIMITS.text):''};
 }
}
