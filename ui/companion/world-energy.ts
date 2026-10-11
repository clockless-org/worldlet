// The world's energy (platform/electron/src/modules/fox/energy.ts): model tokens shown as the power
// that runs the whole world, Fox and every Applet. The words are always energy and charge; tokens,
// model names and money stay out of the meter.
export type EnergyState='full'|'medium'|'low'|'empty';
// Worldlet provides no energy of its own (owner decision 2026-10-05): it all comes from the person's computer.
export interface Energy {source:'chatgpt'|'own'|'none';ready:boolean;name:string;provider:string;level:number|null;resetsAt:string|null;localCodex:boolean}

/** Full above half, or when only the provider knows the balance; low under 10%; empty at none left. */
export function energyState(energy:Pick<Energy,'ready'|'level'>|null):EnergyState {
 if(!energy?.ready)return 'empty';
 const level=energy.level;
 return level===null||level>=50?'full':level>=10?'medium':level>0?'low':'empty';
}
export const ENERGY_LABEL:Record<EnergyState,string>={full:'Fully charged',medium:'Half charged',low:'Low energy',empty:'Out of energy'};
export function energySourceLabel(energy:Energy|null):string {
 if(!energy||energy.source==='none')return 'no energy source connected';
 if(energy.source==='chatgpt')return 'your ChatGPT plan';
 return 'your own account or API key';
}

/** The ChatGPT plan's tightest window (5 hours or weekly) from Codex `account/rateLimits/read`. */
export function planCharge(value:any,now=Date.now()):{level:number,resetsAt:string}|null {
 const buckets=value?.rateLimitsByLimitId?Object.values<any>(value.rateLimitsByLimitId):value?.rateLimits?[value.rateLimits]:[];
 const windows=buckets.flatMap(b=>[b?.primary,b?.secondary]).filter(w=>Number.isFinite(w?.usedPercent)&&Number.isFinite(w?.resetsAt)&&w.resetsAt*1000>now);
 if(!windows.length)return null;
 const tightest=windows.reduce((a,b)=>a.usedPercent>=b.usedPercent?a:b);
 return {level:Math.round(Math.max(0,Math.min(100,100-tightest.usedPercent))),resetsAt:new Date(tightest.resetsAt*1000).toISOString()};
}

export async function readEnergy(call):Promise<Energy> {
 const energy:Energy=await call('foxEnergy');
 if(!['chatgpt','own','none'].includes(energy?.source))throw new Error('Energy is unavailable on this host.');
 if(energy.source==='chatgpt'&&energy.localCodex){
  const plan=planCharge(await call('codexSession',{operation:'usage'}).catch(()=>null));
  if(plan)Object.assign(energy,plan);
 }
 return energy;
}
/** What Fox says when nothing on this computer can answer for it. */
export const NO_MODEL_TEXT='I need an AI Agent to answer. Choose one and sign it in to a provider in Settings, under Your Agent.';
export function rechargeText(energy:Energy|null):string {
 if(!energy?.resetsAt||energy.level===null||energy.level>=100)return '';
 const at=new Date(energy.resetsAt);
 return Number.isFinite(at.getTime())?'Recharges '+at.toLocaleString([],{weekday:'short',hour:'numeric',minute:'2-digit'}):'';
}

/** Watches the world's energy without showing it in the World (owner 2026-10-04: no battery in the
 * top-right corner; no Energy page since 2026-10-10, low energy opens Settings › Your Agent). `say` tells the person once when
 * energy runs low and returns false when it could not be said yet. `needed` tells them, once each time it
 * happens, that no model is connected on this computer (Worldlet provides none, owner decision 2026-10-05). */
export function watchWorldEnergy({call,say,needed=()=>false}:{call:any;say:(text:string)=>boolean|void;needed?:(text:string)=>boolean|void}){
 let current:Energy|null=null,warned=false,reading=false,asked=false;
 async function refresh(){
  if(reading)return current;reading=true;
  try{
   current=await readEnergy(call);
   const state=energyState(current);
   if(current.source==='none'){if(!asked)asked=needed(NO_MODEL_TEXT)!==false;}else asked=false;
   if((state==='low'||state==='empty')&&current.source!=='none'&&!warned)warned=say(state==='low'?'Your world is running low on energy. Charge it to keep going.':'Your world is out of energy. Charge it to keep going.')!==false;
   if(state==='full'||state==='medium')warned=false;
  }catch{}finally{reading=false;}
  return current;
 }
 void refresh();
 const timer=setInterval(()=>void refresh(),5*60_000);
 for(const name of ['worldlet:model-changed','worldlet:model-refresh'])window.addEventListener(name,()=>void refresh());
 // After a finished turn, at most once a minute: each turn spends energy.
 let lastTurn=0;
 window.addEventListener('worldlet:fox-timing',(e:any)=>{if(e.detail?.outcome==='running'||Date.now()-lastTurn<60_000)return;lastTurn=Date.now();void refresh();});
 return {refresh,get energy(){return current;},destroy(){clearInterval(timer);}};
}
