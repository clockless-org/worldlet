// Fox's microphone choice (#1228). One choice per app profile (the page's own storage), used by
// every capture path: the browser recorders here and the Electron media surface, which receives
// the choice with `speechStart`. A choice that is not present falls back to the default device
// and says so once per page session; the choice is kept so a re-plugged dock works again.
import {setupText} from '../onboarding/index.ts';

export type Microphone={id:string,label:string};
const KEY='worldlet-microphone';
const FALLBACK='The chosen microphone is unavailable. Using the default microphone.';
const announced=new Set<string>();

export function microphoneText(text:string){
 let language='';try{language=document.documentElement.lang||localStorage.getItem('worldlet-interface-language')||'';}catch{}
 return setupText(text,language.split('-')[0]);
}
export function savedMicrophone():Microphone|null{
 try{const value=JSON.parse(localStorage.getItem(KEY)||'null');if(value&&typeof value.id==='string'&&value.id)return {id:value.id,label:String(value.label||'')};}catch{}
 return null;
}
export function chooseMicrophone(choice:Microphone|null){
 try{if(choice?.id)localStorage.setItem(KEY,JSON.stringify({id:choice.id,label:choice.label||''}));else localStorage.removeItem(KEY);}catch{}
 announced.clear();
 window.dispatchEvent(new CustomEvent('worldlet:microphone',{detail:choice?.id?choice:null}));
}
/** Tell the person once that the chosen device is missing; the next capture says nothing. */
export function microphoneFallback(){
 const choice=savedMicrophone(),key=choice?.id||'';
 if(announced.has(key))return;announced.add(key);
 window.dispatchEvent(new CustomEvent('worldlet:microphone-fallback',{detail:microphoneText(FALLBACK)}));
}
/** Audio inputs, without Chromium's "default"/"communications" aliases. Labels need permission. */
export function audioInputs(devices:{kind:string,deviceId:string,label:string}[]):Microphone[]{
 const seen=new Set<string>(),list:Microphone[]=[];
 for(const d of devices||[]){
  if(d?.kind!=='audioinput'||!d.deviceId||d.deviceId==='default'||d.deviceId==='communications'||seen.has(d.deviceId))continue;
  seen.add(d.deviceId);list.push({id:d.deviceId,label:String(d.label||'')});
 }
 return list;
}
export async function listMicrophones():Promise<Microphone[]>{
 try{return audioInputs(await navigator.mediaDevices.enumerateDevices());}catch{return [];}
}
/** The device the choice names now: its id, else a device with the same label (ids can rotate). */
export function resolveMicrophone(choice:Microphone|null,inputs:Microphone[]){
 if(!choice)return null;
 return inputs.find(d=>d.id===choice.id)||(choice.label?inputs.find(d=>d.label===choice.label):undefined)||null;
}
const missing=(error:any)=>error?.name==='OverconstrainedError'||error?.name==='NotFoundError'||error?.name==='NotReadableError';
/** Open the chosen microphone with `deviceId: {exact}`, or the default when none is chosen or it is gone. */
export async function openMicrophone(base:MediaTrackConstraints):Promise<MediaStream>{
 const media=navigator.mediaDevices,choice=savedMicrophone();
 const open=(audio:MediaTrackConstraints)=>media.getUserMedia({audio,video:false});
 if(!choice)return open(base);
 let id=choice.id;
 const inputs=await listMicrophones();
 // Without permission the list has no labels yet; then only the exact id can tell.
 if(inputs.some(d=>d.label)){const found=resolveMicrophone(choice,inputs);if(!found){microphoneFallback();return open(base);}id=found.id;}
 try{return await open({...base,deviceId:{exact:id}});}
 catch(error){if(!missing(error))throw error;microphoneFallback();return open(base);}
}
