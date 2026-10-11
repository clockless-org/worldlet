// Whether anything on this computer answers for Fox (`modelSource`, platform/electron/src/modules/fox/model-source.ts, only its
// `source`). There is no energy, charge or battery any more (owner request 2026-10-10): Fox says once when no Agent can
// answer and points to Settings › Your Agent.

/** What Fox says when nothing on this computer can answer for it. */
export const NO_MODEL_TEXT='I need an AI Agent to answer. Choose one and sign it in to a provider in Settings, under Your Agent.';

/** `needed` tells the person, once each time it happens, that no Agent can answer here (Worldlet provides none, owner
 * decision 2026-10-05); it returns false when it could not be said yet. */
export function watchModelNeeded({call,needed}:{call:any;needed:(text:string)=>boolean|void}){
 let reading=false,asked=false;
 async function refresh(){
  if(reading)return;reading=true;
  try{const source=(await call('modelSource'))?.source;if(source==='none'){if(!asked)asked=needed(NO_MODEL_TEXT)!==false;}else if(source)asked=false;}
  catch{}finally{reading=false;}
 }
 void refresh();
 const timer=setInterval(()=>void refresh(),5*60_000);
 for(const name of ['worldlet:model-changed','worldlet:model-refresh'])window.addEventListener(name,()=>void refresh());
 return {refresh,destroy(){clearInterval(timer);}};
}
