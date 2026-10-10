import {PROACTIVE,proactiveLate,type ProactiveMoment} from '../../core/companion/index.ts';
/**
 * Fox speaks first (owner request 2026-10-06). The page notices quiet moments (the person settled
 * into a place and paused, stayed a long time, or is up late) and asks the host whether Fox has one
 * line worth saying; Core's limits decide whether it asks Fox at all, and Fox usually passes. A line
 * that comes back is said in the Fox bar only if the person is still in that place and nothing else
 * is going on; otherwise it is dropped, never queued, because a stale line is noise.
 * In an Applet or page the moment is Browse with me (owner request 2026-10-08): after a short look Fox
 * may say one line about what is on screen, asked at most twice per visit. The person turns it off with Don't bother
 * in Fox's card; the host then refuses every ask, so this page keeps no switch of its own.
 */
export function mountFoxProactive({call,thread,world,busy,environment,say}:{
 call:(action:string,request:object)=>Promise<any>;
 /** The current place's thread key, or '' where Fox must not speak first (onboarding, desktop companion). */
 thread:()=>string;
 /** The current place is the World itself, not an Applet or page. */
 world:()=>boolean;
 /** The person is talking with Fox, typing, recording, or another line or panel is showing. */
 busy:()=>boolean;
 /** What the place shows (location, state, view), as a turn of the person's own would carry it: in a native Applet
  * there is no page text, and without this Fox saw only the place's name and passed (owner 2026-10-10). */
 environment:()=>object;
 /** `browsing` marks a Browse with me line, which offers Don't bother. */
 say:(line:{id:string;text:string;browsing:boolean})=>void;
}){
 let place='',since=Date.now(),activeAt=Date.now(),settled=false,stayed=false,late=false,asking=false,visit='',looks=0,lookedAt=0;
 const touched=()=>{activeAt=Date.now();};
 for(const name of ['pointerdown','keydown','wheel'])window.addEventListener(name,touched,{passive:true,capture:true});
 async function ask(moment:ProactiveMoment,key:string){
  asking=true;
  try{
   let context={};try{context=structuredClone(environment())||{};}catch{}
   const result=await call('foxProactive',{moment,thread:key,minutes:Math.round((Date.now()-since)/60000),environment:context,...moment==='browsing'?{visit}:{}});
   // Fox was busy with something else: this visit's look is tried again on a later tick, not lost.
   if(moment==='browsing'&&result?.reason==='busy'&&key===place)looks--;
  }catch{}
  finally{asking=false;}
 }
 function tick(){
  const key=thread();
  if(key!==place){place=key;since=Date.now();settled=false;stayed=false;visit=key+'@'+since;looks=0;lookedAt=0;}
  if(!key||asking||document.hidden||document.fullscreenElement||busy()||/meeting/i.test(key))return;
  const now=Date.now(),here=(now-since)/1000,quiet=(now-activeAt)/1000;
  if(quiet>10*60)return;
  // Browsing: an Applet or page looked at for a short while; scrolling and reading count as looking, typing does not
  // reach here (busy). It stands in for the settled moment there: a first look, and one more a few minutes on.
  if(!world()){
   const due=looks===0?here>=PROACTIVE.browse.settleSeconds:looks<PROACTIVE.browse.perVisit&&(now-lookedAt)/1000>=PROACTIVE.browse.againSeconds;
   if(due&&quiet>=5){settled=true;looks++;lookedAt=now;void ask('browsing',key);return;}
  }
  // Paused: no input for a little while, but still here (not away from the computer).
  if(quiet<20)return;
  if(!late&&proactiveLate(new Date().getHours())&&here>=PROACTIVE.settleSeconds.world){late=true;void ask('late',key);return;}
  if(!stayed&&here>=PROACTIVE.longStaySeconds){stayed=true;void ask('long-stay',key);return;}
  if(!settled&&here>=(world()?PROACTIVE.settleSeconds.world:PROACTIVE.settleSeconds.applet)){settled=true;void ask('settled',key);}
 }
 const timer=setInterval(tick,10000);
 window.addEventListener('worldlet:fox-proactive',(event:any)=>{
  const {id,line,thread:key,moment}=event.detail||{};
  if(typeof id!=='string'||typeof line!=='string')return;
  const shown=!!line.trim()&&key===thread()&&!busy();
  if(shown)say({id,text:line.trim(),browsing:moment==='browsing'});
  void call('foxProactiveShown',{id,shown}).catch(()=>{});
 });
 return {stop:()=>clearInterval(timer)};
}
