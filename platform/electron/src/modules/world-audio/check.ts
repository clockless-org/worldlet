import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {setTimeout as sleep} from 'node:timers/promises';
import {app} from 'electron';
import {WorldAudio} from './audio.ts';
import {MediaSurface} from '../media/surface.ts';
import {Preferences} from '../../preferences.ts';

// Actual Chromium decoding and playback, at a very quiet test volume; no network or accounts.
await app.whenReady();
const profile=process.env.WORLDLET_CHECK_ROOT!;assert(profile);
const preferences=Preferences.at(profile);preferences.set('worldlet.ambience.volume',.001);preferences.set('worldlet.music.volume',.001);
class ObservedSurface extends MediaSurface{
 sources=new Map<string,string>();
 afterAmbienceLoad:(()=>Promise<void>)|null=null;
 override async call<T=any>(method:string,...args:unknown[]):Promise<T>{if(method==='load')this.sources.set(String(args[0]),String(args[2]));const result=await super.call<T>(method,...args);if(method==='load'&&args[0]==='ambience')await this.afterAmbienceLoad?.();return result;}
}
let notifications=0;
// A fixture theme's four room loops beside the built audio: short quiet tones in the build's own catalogue format.
const webRoot=path.join(profile,'web'),themeDir=path.join(webRoot,'audio/themes/fixture');
fs.mkdirSync(themeDir,{recursive:true});fs.cpSync(path.resolve('dist/WorldletWeb/audio'),path.join(webRoot,'audio'),{recursive:true});
const tone=(hz:number)=>{const rate=8000,samples=rate*2,b=Buffer.alloc(44+samples*2);b.write('RIFF',0);b.writeUInt32LE(36+samples*2,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(rate,24);b.writeUInt32LE(rate*2,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(samples*2,40);for(let i=0;i<samples;i++)b.writeInt16LE(Math.round(Math.sin(2*Math.PI*hz*i/rate)*3000),44+i*2);return b;};
const LOOPS={lake:['Lake','wave',220],hearth:['Hearth','flame',260],greenhouse:['Greenhouse','tree',300],halls:['Halls','breeze',340]} as const;
const catalogue:Record<string,unknown>={};
for(const [id,[title,icon,hz]] of Object.entries(LOOPS)){fs.writeFileSync(path.join(themeDir,id+'.wav'),tone(hz));catalogue['theme:fixture:'+id]={file:'themes/fixture/'+id+'.wav',title,icon};}
fs.writeFileSync(path.join(webRoot,'audio/theme-tracks.json'),JSON.stringify(catalogue));
const surface=new ObservedSurface(),audio=new WorldAudio(surface,preferences,webRoot,()=>notifications++);
const present=(loop:string,active=true)=>audio.command({operation:'presentation',track:loop==='village'?loop:'theme:fixture:'+loop,active});
const state=()=>audio.snapshot.ambience as any;
const oneSource=async()=>{let sounding=0;for(const id of ['ambience','music','radio']){const p=await surface.call('info',id);if(p&&!p.paused&&p.volume>0)sounding++;}assert(sounding<=1,'one native audible source');};
try{
 await present('lake');assert.equal(state().track,'Lake');assert.equal(state().state,'stopped');assert.equal(await surface.call('info','ambience'),null,'theme selection never starts sound');
 await audio.command({operation:'ambience',enabled:true});await sleep(850);
 let info=await surface.call('info','ambience');assert(info.readyState>=2&&!info.paused&&info.duration>0);assert(state().outputVolume>0);assert.equal(state().volume,.001);await oneSource();
 for(const [loop,title] of [['hearth','Hearth'],['greenhouse','Greenhouse'],['halls','Halls']]){
  await present(loop);await sleep(750);assert.equal(state().track,title);assert.equal(state().state,'playing');assert(surface.sources.get('ambience')?.endsWith('/themes/fixture/'+loop+'.wav'));assert.equal((await surface.call('info','ambience')).paused,false);await oneSource();
 }
 const beforeDuck=notifications;audio.setDucked(true,'fixture');assert(notifications>beforeDuck,'event sounds receive the new ducking state');await sleep(450);assert(state().outputVolume<.0002&&state().outputVolume>0,'theme sound follows voice ducking');
 await present('lake');await sleep(750);assert(state().outputVolume<.0002,'room change preserves voice ducking');audio.setDucked(false,'fixture');
 await present('lake',false);await sleep(100);assert.equal(state().suspended,true);assert.equal(state().state,'playing');assert.equal((await surface.call('info','ambience')).paused,true);assert.equal(state().outputVolume,0);
 await present('hearth',true);await sleep(750);assert.equal(state().suspended,false);assert.equal((await surface.call('info','ambience')).paused,false);
 await audio.command({operation:'ambience',enabled:false});await present('greenhouse');assert.equal(state().state,'paused');assert.equal(state().outputVolume,0,'a room change does not unmute');
 await audio.control({channel:'ambience',operation:'volume',volume:0});await present('lake');assert.equal(state().volume,0,'a room change preserves zero volume');
 await audio.control({channel:'ambience',operation:'volume',volume:.001});await audio.command({operation:'ambience',enabled:true});
 await Promise.all([present('hearth'),present('lake'),present('greenhouse')]);assert.equal(state().track,'Greenhouse');await oneSource();
 let loaded!:()=>void,release!:()=>void;const pendingLoad=new Promise<void>(resolve=>loaded=resolve),released=new Promise<void>(resolve=>release=resolve);
 surface.afterAmbienceLoad=async()=>{loaded();await released;};const changingRoom=present('halls');await pendingLoad;
 await audio.control({operation:'play',track:'calm'});release();await changingRoom;surface.afterAmbienceLoad=null;
 await present('lake');await sleep(750);assert.equal((audio.snapshot.music as any).state,'playing');assert.equal(state().state,'paused','a pending room change cannot restart ambience over music');await oneSource();
 await audio.control({channel:'ambience',operation:'play',track:'rain'});await present('hearth',false);await sleep(750);assert.equal(state().track,'Soft Rain');assert.equal(state().suspended,false,'explicit rain is independent of hidden scenery');assert.equal((audio.snapshot.music as any).state,'paused');await oneSource();
 await present('village');assert.equal(state().track,'Soft Rain','theme switching preserves explicit sound');
 for(const track of ['https://example.com/a.wav','../secret','theme:fixture:missing'])await assert.rejects(audio.command({operation:'presentation',track,active:true}),/Unknown theme ambience/);
 assert.equal(state().track,'Soft Rain','rejected sound IDs do not change playback');
 console.log('PASS native theme audio: four decoded room loops, no autoplay, one channel, volume/ducking, hidden pause, mute, manual-source preservation, ordered switches and invalid IDs');
}finally{audio.stop();surface.close();}
