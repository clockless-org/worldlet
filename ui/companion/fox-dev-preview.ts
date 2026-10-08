import {companionPreviewActions} from './companion-life.ts';

export const FOX_DEV_PREVIEW_EVENT='worldlet:dev-fox-preview';
/** Local render-only controls. No task, conversation, settings or storage API. */
export function createFoxDevPreviewControls(root:ParentNode){
 const controls=document.createElement('div');controls.className='fox-dev-preview';
 const select=document.createElement('select');select.setAttribute('aria-label','Fox animation preview state');
 for(const state of companionPreviewActions(true)){
  const option=document.createElement('option');option.value=state;option.textContent=state.replaceAll('_',' ');select.append(option);
 }
 const status=document.createElement('span');status.setAttribute('role','status');status.textContent='Local animation only · up to 60 seconds';
 const send=(state:string|null)=>{
  const host=root.querySelector<HTMLElement>('.companion-avatar');
  if(!host){status.textContent='Fox is not mounted.';return;}
  const request=new CustomEvent(FOX_DEV_PREVIEW_EVENT,{detail:state,cancelable:true});
  host.dispatchEvent(request);
  status.textContent=request.defaultPrevented?(state?`Requested: ${state.replaceAll('_',' ')} · up to 60 seconds`:'Preview stopped.'):'Preview unavailable while Fox is busy.';
 };
 const play=document.createElement('button');play.type='button';play.textContent='Preview animation';play.onclick=()=>send(select.value);
 const stop=document.createElement('button');stop.type='button';stop.textContent='Stop preview';stop.onclick=()=>send(null);
 controls.append(select,play,stop,status);return controls;
}
