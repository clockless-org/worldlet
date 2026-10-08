/** Fox keeps talking while it plans a task, so the first ~20 seconds are not silence.
 * Lines are true of every run (read the saved details, work out steps) and never claim a
 * page action; the first real page step replaces them. */
export type NarrationLine={at:number;text:string};
export function helpNarration(title:string,onPage:boolean):NarrationLine[]{
 const name=String(title||'this').trim()||'this';
 return [
  {at:0,text:'On it: **'+name+'**.'+(onPage?' I opened the page, so you can watch me work.':'')},
  {at:4000,text:'First I’m reading the saved details, so I get them right.'},
  {at:9000,text:onPage?'Now I’m working out the steps on this page.':'Now I’m working out what to do.'},
  {at:15000,text:onPage?'Almost ready. I’ll start on the page in a moment.':'Almost ready.'},
  {at:23000,text:'Still with you. I’m checking everything before I act.'},
  {at:33000,text:'This is taking a little longer than usual. Nothing has been changed yet.'},
 ];
}
/** Once Fox acts on the page, its label says each step (browser-device.ts); the bubble only invites. */
export const WATCH='Watch me on the page, or step in any time.';
/** Plays the lines through `say` until stopped; `acting` swaps in the invitation. */
export function narrateHelp(lines:NarrationLine[],say:(text:string)=>void){
 const timers=lines.map(line=>setTimeout(()=>say(line.text),line.at));
 let done=false;
 const stop=()=>{if(done)return;done=true;timers.forEach(clearTimeout);};
 return {stop,acting(){if(done)return;stop();say(WATCH);}};
}
