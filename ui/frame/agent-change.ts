/** The in-page second ask Settings › Agents uses before any change to the person's Agent (its skills and scheduled
 * tasks): the host's `preview` returns the exact command and a one-time
 * confirmation; the page says in plain words what will happen (never the command itself), and only the
 * person's own button runs it (`change` with that confirmation). Cancel changes nothing. */
export type AgentCall=(action:string,body?:any)=>Promise<any>;
export const agentEl=(tag:string,cls='',text='')=>Object.assign(document.createElement(tag),{className:cls,textContent:text});
export function agentButton(label:string,action:string,run:(b:HTMLButtonElement)=>void|Promise<void>,primary=false){
 const b=agentEl('button','companion-info-action'+(primary?' primary':''),label) as HTMLButtonElement;b.type='button';b.dataset.action=action;
 b.onclick=async()=>{if(b.disabled)return;b.disabled=true;try{await run(b);}finally{if(b.isConnected)b.disabled=false;}};
 return b;
}
/** A day said the way people say it: today, yesterday, Oct 21, and the year only when it is not this one. */
export const agentDay=(at:number,now=Date.now())=>{
 const d=new Date(at),n=new Date(now),start=(x:Date)=>new Date(x.getFullYear(),x.getMonth(),x.getDate()).getTime();
 const days=Math.round((start(n)-start(d))/86400000);
 return days===0?'today':days===1?'yesterday':d.toLocaleDateString(undefined,{month:'short',day:'numeric',...d.getFullYear()!==n.getFullYear()?{year:'numeric'}:{}});
};
/** Asks, then runs. `where` gets the question; `said` the outcome; `done` runs after the Agent did it. */
export async function confirmAgentChange({call,action,harness,title,request,where,said,current,question,verb,working,done}:{
 call:AgentCall;action:string;harness:string;title:string;request:Record<string,unknown>;where:HTMLElement;said:HTMLElement;current:()=>boolean;
 question:string;verb:string;working:string;done:(command:string)=>Promise<void>|void}){
 said.textContent='';
 let preview:{command:string;confirm:string};
 try{preview=await call(action,{operation:'preview',harness,...request});}
 catch(e){said.textContent=(e as Error).message||'Could not prepare that.';return;}
 if(!current())return;
 for(const open of where.closest('.companion-settings-part')?.querySelectorAll?.('.companion-settings-confirm')??[])open.remove();
 const ask=agentEl('div','companion-settings-confirm');ask.setAttribute('role','group');ask.dataset.confirm=harness;
 ask.append(agentEl('span','',question),
  agentButton(verb,'confirm-change',async()=>{
   said.textContent=working;
   try{const result=await call(action,{operation:'change',confirm:preview.confirm});if(ask.isConnected)ask.remove();await done(String(result?.command??preview.command));}
   catch(e){said.textContent=`${title} did not do it: `+((e as Error).message||'try again.').replace(new RegExp('^'+title.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+' did not do it: '),'');if(ask.isConnected)ask.remove();}
  },true),
  agentButton('Cancel','cancel-change',()=>{ask.remove();said.textContent='Nothing was changed.';}));
 where.append(ask);
}
