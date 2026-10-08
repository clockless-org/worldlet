// Local music players in the World's corner (owner Order 2026-10-07): the shared rules that read what the
// Mac's or Windows' now-playing record says, Fox's control_local_music, and the World's sound line in the
// page with a mocked host: an outside player's track and who made it take that one line with previous,
// play or pause and next (owner Order 2026-10-08: no cover, no separate card), and Worldlet's own radio
// never shows there.
// Real MediaRemote, the media transport controls and Automation for Music need a signed-in Mac or Windows PC;
// these fixtures do not claim them.
import assert from 'node:assert/strict';
import {localMusicCommand,localMusicQuery,localPlayerName,nowPlayingLine,readNowPlaying,readPlaylists,readTracks,worldletPlayer} from '../core/applets/index.ts';
import {listWorldTools} from '../core/tools/catalog.ts';
import {runLocalMusicTool} from '../ui/shell/local-music.ts';
import {withBrowser,fileAccess,pageErrors,worldUrl} from './browser-test.ts';

// What the helpers print, as what is playing.
const soda=readNowPlaying({bundle:'com.soda.music',app:'汽水音乐',title:' 晴天 ',artist:'周杰伦',album:'叶惠美',playing:true});
assert.deepEqual(soda,{app:'汽水音乐',player:'com.soda.music',title:'晴天',artist:'周杰伦',album:'叶惠美',playing:true,appleMusic:false});
assert.equal(readNowPlaying({bundle:'com.apple.Music',app:'Music',title:'Song',playing:false})?.appleMusic,true,'Apple Music is the one with playlists');
assert.equal(readNowPlaying({none:true}),null,'nothing playing is no track');
assert.equal(readNowPlaying({title:''}),null,'a track needs a title');
assert.equal(readNowPlaying({title:'x\u0000y'})?.title,'x y','control characters never reach the page');
assert.equal(readNowPlaying({title:'a'.repeat(500)})?.title.length,200,'long titles are cut');
assert.equal(readNowPlaying({title:'x',playing:'yes'})?.playing,false,'only a real true is playing');
// Windows names players by app ID.
assert.equal(localPlayerName('','Spotify.exe'),'Spotify');
assert.equal(localPlayerName('','Microsoft.ZuneMusic_8wekyb3d8bbwe!Microsoft.ZuneMusic'),'Media Player');
assert.equal(localPlayerName('','cloudmusic.exe'),'网易云音乐');
assert.equal(localPlayerName('','QQMusic.exe'),'QQ 音乐');
assert.equal(localPlayerName('','SodaMusic.exe'),'汽水音乐');
assert.equal(localPlayerName('','C:\\Program Files\\Foo\\Foobar2000.exe'),'Foobar2000');
assert.equal(localPlayerName('',''),'Music');
// Worldlet's own sound page is in the system's record too; it is never an outside player.
assert.equal(readNowPlaying({bundle:'app.worldlet.mac',app:'Worldlet',title:'Worldlet media',playing:true}),null,'Worldlet\'s own radio is not local music');
assert.equal(readNowPlaying({bundle:'app.worldlet.mac.dev.wt3',app:'Worldlet Dev',title:'Station',playing:true}),null,'a development build is Worldlet too');
assert.equal(readNowPlaying({player:'C:\\Program Files\\Worldlet\\Worldlet.exe',title:'Station'}),null,'so is the Windows app');
assert.equal(readNowPlaying({bundle:'com.example.player',title:'Worldlet media'}),null,'the sound page\'s own title gives it away');
assert(worldletPlayer('app.worldlet.web')&&!worldletPlayer('com.spotify.client')&&!worldletPlayer('app.worldletfan.player'));
assert.deepEqual(nowPlayingLine(soda!),{title:'晴天',detail:'周杰伦'});
assert.deepEqual(nowPlayingLine(readNowPlaying({app:'Chrome',title:'Lo-fi radio'})!),{title:'Lo-fi radio',detail:'Chrome'},'no artist names the player');
assert.equal(localMusicCommand('next'),'next');
assert.equal(localMusicCommand('stop'),null,'only the five controls');
assert.deepEqual(readPlaylists([{id:'0123456789ABCDEF',name:'Running'},{id:'0123456789ABCDEF',name:'Again'},{id:'bad',name:'X'},{id:'FEDCBA9876543210',name:''}]),[{id:'0123456789ABCDEF',name:'Running'}]);
assert.equal(readPlaylists(Array.from({length:80},(_,i)=>({id:i.toString(16).toUpperCase().padStart(16,'0'),name:'P'+i}))).length,60);
assert.deepEqual(readTracks([{id:'0123456789ABCDEF',title:'晴天',artist:'周杰伦',album:''},{id:'x',title:'y'}]),[{id:'0123456789ABCDEF',title:'晴天',artist:'周杰伦',album:''}]);
assert.equal(localMusicQuery('  周杰伦 '),'周杰伦');
assert.equal(localMusicQuery(''),null);
assert.equal(localMusicQuery('x'.repeat(121)),null);

// Fox controls the player the person uses, not Worldlet's own radio.
const tool=listWorldTools().find(t=>t.name==='control_local_music') as any;
assert(tool,'Fox has control_local_music');
assert.deepEqual(tool.parameters.properties.operation.enum,['status','play','pause','toggle','next','previous','playlists','play_playlist','search','play_track']);
const calls:any[]=[];
const host=async(action:string,body:any)=>{calls.push({action,...body});
 if(body.operation==='status')return {supported:true,revision:3,nowPlaying:soda};
 if(body.operation==='command')return {ok:true,command:body.command,nowPlaying:{...soda,playing:false}};
 if(body.operation==='playlists')return {playlists:[{id:'0123456789ABCDEF',name:'Running'}]};
 if(body.operation==='playPlaylist')return {ok:true,name:'Running'};
 throw Error('Worldlet is not allowed to control Music.');};
assert.deepEqual(await runLocalMusicTool(host,{operation:'status'}),{ok:true,app:'汽水音乐',title:'晴天',artist:'周杰伦',album:'叶惠美',playing:true,appleMusic:false});
assert.deepEqual(await runLocalMusicTool(host,{operation:'pause'}),{ok:true,command:'pause',app:'汽水音乐',title:'晴天',artist:'周杰伦',playing:false});
assert.deepEqual(await runLocalMusicTool(host,{operation:'playlists'}),{ok:true,playlists:[{id:'0123456789ABCDEF',name:'Running'}]});
assert.deepEqual(await runLocalMusicTool(host,{operation:'play_playlist',id:'0123456789ABCDEF'}),{ok:true,name:'Running'});
assert.match((await runLocalMusicTool(host,{operation:'play_track'})).error,/ID/,'never plays a guessed song');
assert.match((await runLocalMusicTool(host,{operation:'search',query:'晴天'})).error,/not allowed/,'a refusal reaches Fox as it is');
assert.deepEqual(calls.map(c=>c.operation),['status','command','playlists','playPlaylist','search']);
assert.deepEqual(await runLocalMusicTool(async()=>({supported:true,nowPlaying:null,revision:1}),{operation:'status'}),{ok:true,playing:false,nothing:'No music app on this computer has a track right now.'});

// The World's sound line in the page.
await withBrowser(fileAccess,async browser=>{
 const page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'}),errors=pageErrors(page);
 await page.addInitScript(()=>{
  const w=window as any;
  w.sent=[];
  w.webkit={messageHandlers:{worldlet:{async postMessage(b:any){w.sent.push(b);
   if(b.action==='snapshot')return {workspaceId:'local-music',revision:0,activityRevision:0,hostCapabilities:{version:1,features:{localMusic:true}},sources:[],knowledge:[],worldItems:[],worldChecks:[],cloudConsent:true,onboarding:{completed:true},connections:[],sampleEnabled:false,sampleUI:{},textScale:0,overlay:{version:1,created:{},edits:{},trash:{},receipts:{},undo:null},layout:null,appUpdate:{visible:false}};
   if(b.action==='localMusic'){
    if(b.operation==='watch')return {supported:true,nowPlaying:null,revision:1};
    if(b.operation==='command')return {ok:true,command:b.command,nowPlaying:null};
    return {ok:true};
   }
   if(b.action==='worldAudio')return {ambience:{state:'playing',track:'Village Air',trackID:'village',volume:.18},music:{state:'stopped'}};
   if(b.action==='modelStatus')return {available:true,cloudAllowed:true};
   if(b.action==='foxPreferences')return {model:{name:'Fixture',ready:true,provider:'custom'},cloudConsent:true};
   if(b.action==='appContent')return {pages:[]};
   if(b.action==='weatherLoad')return null;
   return {ok:true};}}}};
 });
 await page.goto(worldUrl());
 const line=page.locator('.world-audio'),sound=line.locator('.world-audio-current'),music=line.locator('.world-now-playing');
 await sound.waitFor();
 await page.waitForFunction(()=>(window as any).sent.some((s:any)=>s.action==='localMusic'&&s.operation==='watch'));
 assert.equal(await music.isHidden(),true,'nothing playing leaves the World\'s sound on its line');
 const before=await page.evaluate(()=>{const r=(s:string)=>document.querySelector(s)!.getBoundingClientRect();return {audio:r('.world-audio'),clock:r('#worldClock')};});
 const push=(value:any)=>page.evaluate(v=>(window as any).worldletLocalMusic(v),value);
 await push({supported:true,revision:5,nowPlaying:{app:'汽水音乐',player:'com.soda.music',title:'晴天',artist:'周杰伦',album:'叶惠美',playing:true,appleMusic:false}});
 await music.waitFor();
 assert.equal(await sound.isHidden(),true,'the track takes the one line');
 assert.equal(await music.locator('.world-now-playing-words').innerText(),'晴天 · 周杰伦');
 assert.equal(await music.locator('[data-command=toggle]').getAttribute('aria-label'),'Pause','a playing track offers Pause');
 assert.equal(await page.locator('.world-now-playing img, .world-now-playing-sleeve, .world-now-playing-shelf').count(),0,'no cover and no shelf');
 // It is the same line: the same height and right edge, and it moves neither the clock nor the date.
 const after=await page.evaluate(()=>{const r=(s:string)=>document.querySelector(s)!.getBoundingClientRect();return {audio:r('.world-audio'),music:r('.world-now-playing'),clock:r('#worldClock'),controls:r('.world-now-playing-controls')};});
 assert(Math.abs(after.audio.top-before.audio.top)<=1&&Math.abs(after.audio.height-before.audio.height)<=1,'the sound line keeps its place: '+JSON.stringify({before,after}));
 assert(Math.abs(after.music.top-after.audio.top)<=2&&after.music.bottom<=after.audio.bottom+2,'the track sits on the sound line');
 assert(Math.abs(after.controls.top+after.controls.height/2-(after.music.top+after.music.height/2))<=2,'the controls are on that same row');
 assert(Math.abs(after.clock.top-before.clock.top)<=1,'the clock does not move');
 assert(after.music.width<=300,'it stays compact');
 if(process.env.WORLDLET_LOCAL_MUSIC_SHOT)await page.screenshot({path:process.env.WORLDLET_LOCAL_MUSIC_SHOT+'-line.png',clip:{x:1000,y:0,width:440,height:200}});
 await music.locator('[data-command=next]').click();
 await music.locator('[data-command=toggle]').click();
 await page.waitForFunction(()=>(window as any).sent.filter((s:any)=>s.operation==='command').length===2);
 assert.deepEqual(await page.evaluate(()=>(window as any).sent.filter((s:any)=>s.operation==='command').map((s:any)=>s.command)),['next','toggle']);
 // An older reply never overwrites a newer state; a paused player gives the line back while the World's sound plays.
 await push({supported:true,revision:9,nowPlaying:{app:'Music',player:'com.apple.Music',title:'Song for Apple',artist:'',album:'',playing:false,appleMusic:true}});
 await push({supported:true,revision:7,nowPlaying:{app:'Spotify',player:'com.spotify.client',title:'Old',artist:'',album:'',playing:true,appleMusic:false}});
 await page.waitForFunction(()=>(document.querySelector('.world-now-playing') as HTMLElement).hidden);
 assert.equal(await sound.isVisible(),true,'the World\'s sound is back on its line');
 await push({supported:true,revision:10,nowPlaying:{app:'Music',player:'com.apple.Music',title:'Song for Apple',artist:'',album:'',playing:true,appleMusic:true}});
 await page.waitForFunction(()=>document.querySelector('.world-now-playing-words')?.textContent==='Song for Apple · Music');
 // A player that stops is gone from the line.
 await push({supported:true,revision:12,nowPlaying:null});
 await page.waitForFunction(()=>(document.querySelector('.world-now-playing') as HTMLElement).hidden);
 assert.equal(await sound.isVisible(),true);
 assert.deepEqual(errors,[]);
});
console.log('PASS local music: now-playing rules, Worldlet\'s own radio left out, Windows player names, Fox control_local_music, and the World\'s sound line (track and artist with previous, play or pause and next on that one line, no cover, newest state wins, paused player yields to the World\'s sound).');
