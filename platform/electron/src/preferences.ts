import fs from 'node:fs';
import path from 'node:path';
import {readJSON,writeJSON} from './files.ts';
// Display, voice and companion preferences. The Mac host kept these in app-scoped
// UserDefaults under `worldlet.*`; Electron keeps the same keys in the library root so
// every OS shares one format.
export const PREFERENCE_KEYS=['worldlet.sampleEnabled','worldlet.companionName','worldlet.spokenReplies','worldlet.talkReplies','worldlet.wakeWord','worldlet.spokenVoice','worldlet.attentionFocus','worldlet.textScale','worldlet.modelRoute','worldlet.foxModel','worldlet.companionStyle','worldlet.companionLook','worldlet.voiceMemos.retryAfterRestart','worldlet.messages.retryAfterRestart','worldlet.backgroundMusic','worldlet.worldAudio','worldlet.desktopCompanion'] as const;
/** The person's choices about their World: who Fox is and how it speaks, text size, Attention focus, the
 * World's sound and podcast places. Owner decision 2026-10-05: everything in the World is recorded in its
 * database, so these live in `world.sqlite` (`world_settings` 'preferences') and come back with a restored
 * backup. The rest (practice mode, volumes, update channel, analytics identity, Open at Login, window
 * state) belongs to this computer and stays in `preferences.json`. */
export const WORLD_PREFERENCE_KEYS:readonly string[]=['worldlet.companionName','worldlet.companionStyle','worldlet.companionLook','worldlet.textScale','worldlet.attentionFocus','worldlet.spokenReplies','worldlet.talkReplies','worldlet.spokenVoice','worldlet.modelRoute','worldlet.foxModel','worldlet.backgroundMusic','worldlet.worldAudio','worldlet.desktopCompanion','worldlet.ambience.enabled','worldlet.ambience.track','worldlet.podcast.bookmarks.v1'];
const isWorld=(key:string)=>WORLD_PREFERENCE_KEYS.includes(key);
/** Also imported once from the Mac host, but outside World backups: installation identity,
 * update progress and audio levels belong to this computer, not to a restored world. */
export const MAC_IMPORT_KEYS=[...PREFERENCE_KEYS,'WorldletUsageAnalyticsEnabled','WorldletUsageAccount','WorldletUsageAnonymousID','WorldletUsageInstallID','WorldletUsageOnboardingReported','WorldletUsageLastDay','worldlet.update.finishLatest','worldlet.update.attemptedBuild','worldlet.ambience.volume','worldlet.music.volume','worldlet.ambience.enabled','worldlet.ambience.track','worldlet.podcast.bookmarks.v1'];
/** Where the World's own preferences are kept (store/world-store.ts attaches the World database). */
export interface WorldPreferenceStore {read():Record<string,unknown>|null;write(values:Record<string,unknown>):void}
export class Preferences {
 private values:Record<string,unknown>;
 private world:WorldPreferenceStore|null=null;
 private worldValues:Record<string,unknown>|null=null;
 readonly file:string;
 constructor(file:string,legacy?:()=>Record<string,unknown>){
  this.file=file;
  this.values=fs.existsSync(file)?readJSON(file,{}):{};
  if(!fs.existsSync(file)&&legacy){
   // One-time import of the Mac host's UserDefaults; later writes stay here.
   try{const imported=legacy();for(const [key,value] of Object.entries(imported))if(value!==undefined&&value!==null)this.values[key]=value;}catch{}
   this.flush();
  }
 }
 /** Keeps the World's preferences in the World. Values still in `preferences.json` move in once. */
 attachWorld(world:WorldPreferenceStore){
  this.world=world;this.worldValues=null;
  const stored=this.worldStore(),local=Object.entries(this.values).filter(([key])=>isWorld(key));
  if(!local.length)return;
  // The World's own copy wins; a key it does not have yet comes from this computer's file.
  try{world.write({...Object.fromEntries(local),...stored});}catch{return;}
  this.worldValues=null;
  for(const [key] of local)delete this.values[key];
  this.flush();
 }
 /** Reads the World's preferences again (after a restore or reset replaced its database). */
 reloadWorld(){this.worldValues=null;}
 private worldStore():Record<string,unknown> {
  if(!this.world)return {};
  if(this.worldValues)return this.worldValues;
  let value:Record<string,unknown>|null=null;
  try{value=this.world.read();}catch{}
  return this.worldValues=value&&typeof value==='object'&&!Array.isArray(value)?{...value}:{};
 }
 private source(key:string){return this.world&&isWorld(key)?this.worldStore():this.values;}
 get<T=unknown>(key:string,fallback?:T):T {const values=this.source(key);return (key in values?values[key]:fallback) as T;}
 bool(key:string,fallback=false){const value=this.source(key)[key];return typeof value==='boolean'?value:fallback;}
 number(key:string,fallback=0){const value=this.source(key)[key];return typeof value==='number'&&Number.isFinite(value)?value:fallback;}
 string(key:string,fallback=''){const value=this.source(key)[key];return typeof value==='string'?value:fallback;}
 set(key:string,value:unknown){
  const values=this.source(key);
  if(value===undefined||value===null)delete values[key];else values[key]=value;
  this.save(key);
 }
 remove(...keys:string[]){
  let world=false,local=false;
  for(const key of keys){const values=this.source(key);delete values[key];if(values===this.values)local=true;else world=true;}
  if(world)this.writeWorld();
  if(local)this.flush();
 }
 /** This computer's preferences and the World's together. */
 snapshot(){return {...this.values,...this.worldStore()};}
 replace(values:Record<string,unknown>){
  const world=Object.fromEntries(Object.entries(values).filter(([key])=>this.world&&isWorld(key)));
  this.values=Object.fromEntries(Object.entries(values).filter(([key])=>!(key in world)));
  this.flush();
  if(this.world){this.worldValues=world;this.writeWorld();}
 }
 /** The World's preferences only, as a backup carries them. */
 worldSnapshot(){return Object.fromEntries(Object.entries(this.world?this.worldStore():this.values).filter(([key])=>isWorld(key)));}
 private save(key:string){if(this.world&&isWorld(key))this.writeWorld();else this.flush();}
 private writeWorld(){if(this.world&&this.worldValues)this.world.write(this.worldValues);}
 private flush(){writeJSON(this.file,this.values);}
 static at(root:string,legacy?:()=>Record<string,unknown>){return new Preferences(path.join(root,'preferences.json'),legacy);}
}
