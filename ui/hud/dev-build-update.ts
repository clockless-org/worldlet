import {callHost} from '../../platform/bridge/host.ts';

/** Compact age of a commit, e.g. "just now", "12m ago", "3h ago", "2d ago". */
export function commitAge(iso:string|undefined,now=Date.now()):string{
 const at=Date.parse(iso||'');if(!Number.isFinite(at))return '';
 const minutes=Math.max(0,Math.floor((now-at)/60000));
 if(minutes<1)return 'just now';if(minutes<60)return minutes+'m ago';
 const hours=Math.floor(minutes/60);if(hours<48)return hours+'h ago';
 return Math.floor(hours/24)+'d ago';
}

/** "1 commit behind", "12 commits behind"; empty when the count is unknown or zero. */
export function commitsBehind(count:number|undefined):string{
 return Number.isInteger(count)&&count!>0?`${count} commit${count===1?'':'s'} behind`:'';
}

// Shared Dev presentation; the native adapter only reads watcher state and writes a request.
// A prepared newer build is a capsule in the bottom-left update dock, the same control as the release
// Update button: "Apply · <N> commits behind", nothing else (owner 2026-10-04; the PR number and merge time
// before were noise). Plain "Apply" until an Apply records the running revision. Before, it was an underlined word at the end of the hidden
// footer line and easy to miss (owner report 2026-10-02).
export function mountDevBuildUpdate(root:HTMLElement,request=callHost){
 const apply=document.createElement('button');apply.type='button';apply.className='world-footer-update ui-button dev-build-update';apply.hidden=true;
 const label=document.createElement('span');label.className='dev-build-update-label';label.setAttribute('aria-live','polite');
 apply.append(label);root.prepend(apply);
 // An independent notice, not a click away from Fox: Apply must never dismiss
 // Fox's pending suggestion (the same marker the Attention card uses).
 apply.addEventListener('pointerdown',e=>{(e as any).worldletKeepFox=true;});
 apply.addEventListener('click',e=>e.stopPropagation());
 let candidate='',revision='',behind:number|undefined,note='',pending=false,supported=true,disposed=false,timer;
 const render=()=>{
  label.textContent=note||['Apply',commitsBehind(behind)].filter(Boolean).join(' · ');
  apply.title=note?note:`Apply & restart Dev with commit ${revision.slice(0,7)}${commitsBehind(behind)?' ('+commitsBehind(behind)+')':''}. Save unfinished work first.`;
 };
 apply.onclick=async()=>{
  if(pending||apply.disabled||!candidate)return;
  pending=true;apply.disabled=true;note='Applying…';render();
  try{await request('devBuildApply',{id:candidate});}
  catch(error){pending=false;apply.disabled=false;note=String(error?.message||'Could not apply this build.').slice(0,120);render();}
 };
 async function poll(){
  if(disposed||!supported)return;
  try{
   const value=await request('devBuildStatus');if(disposed)return;
   if(!value?.supported){supported=false;apply.hidden=true;return;}
   const next=value.candidate?.id||'';
   if(next!==candidate){candidate=next;pending=false;}
   revision=value.candidate?.revision||'';behind=value.candidate?.behind;
   apply.hidden=!candidate;
   apply.disabled=!value.online||value.applying||pending;
   note=value.error?String(value.error).slice(0,120):!value.online?'New build ready · watcher offline':value.applying||pending?'Applying…':'';
   if(value.error)pending=false;
   render();
  }catch{apply.hidden=true;}
  finally{if(!disposed&&supported)timer=setTimeout(poll,1500);}
 }
 void poll();return ()=>{disposed=true;clearTimeout(timer);apply.remove();};
}
