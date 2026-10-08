/** Settings › Approvals: one list of the standing rules an Always left in each Agent on this computer (host
 * `harnessApprovalRules`, contracts/harness-services.ts HarnessStandingRules): what it allows, which agent, when and from
 * which Fox thread it was granted (when the World saw it, or the Harness recorded it), and Revoke, which makes that
 * Agent forget it its own way. An Agent that cannot have a rule revoked from here says how instead. */
type Rule={id:string;allows:string;agent:string;kind:string;main?:boolean;grantedAt?:number;lastUsedAt?:number;note?:string;thread?:string;inWorld?:boolean};
type Harness={harness:string;title:string;rules:Rule[];revoke:string|null;note?:string;error?:string;inUse?:boolean};
const day=(at:number)=>new Date(at).toLocaleDateString(undefined,{year:'numeric',month:'short',day:'numeric'});
/** The one line under a rule: its agent, when and where it was granted, when it was last used. */
export function approvalRuleLine(rule:Rule,title:string):string {
 const who=rule.agent==='*'?'All agents':rule.main?'Main agent':`Agent “${rule.agent}”`;
 const when=rule.grantedAt?`granted ${day(rule.grantedAt)}`:`granted outside Worldlet; ${title} keeps no date`;
 const where=rule.thread?`, ${rule.thread[0].toLowerCase()+rule.thread.slice(1)}`:'';
 const used=rule.lastUsedAt?`. Last used ${day(rule.lastUsedAt)}`:'';
 return `${who} · ${when}${where}${used}.`;
}
export async function showApprovalRules(target:HTMLElement,call:(action:string,body?:any)=>Promise<any>,current:()=>boolean){
 const el=(tag:string,cls='',text='')=>Object.assign(document.createElement(tag),{className:cls,textContent:text});
 const box=el('div','companion-settings-approvals'),said=el('p','companion-settings-status');said.setAttribute('role','status');
 target.append(el('p','companion-info-note','When you choose Always on an approval card, your Agent stops asking for that. Every such rule on this computer is here; Revoke makes your Agent ask again.'),box,said);
 async function draw(){
  const listed=await call('harnessApprovalRules',{operation:'list'}).catch((e:Error)=>({error:e.message}));
  if(!current())return;
  box.replaceChildren();
  if(listed?.error)box.append(el('p','companion-info-note',listed.error));
  const harnesses:Harness[]=Array.isArray(listed?.harnesses)?listed.harnesses:[];
  for(const harness of harnesses){
   const rows=el('div','companion-settings-rows');rows.dataset.harness=harness.harness;
   box.append(el('h5','companion-settings-subhead',harness.title+(harness.inUse?' · In use':'')),rows);
   if(harness.error){rows.append(el('p','companion-info-note',harness.error));continue;}
   if(!harness.rules.length)rows.append(el('p','companion-info-note','No standing rules. It asks every time.'));
   for(const rule of harness.rules){
    const row=el('div','companion-settings-row'),words=el('div'),allows=el('code','',rule.allows);row.dataset.rule=rule.id;
    words.append(allows,...rule.note&&rule.note!==rule.allows?[el('span','companion-settings-quiet',rule.note)]:[],el('span','',approvalRuleLine(rule,harness.title)));
    row.append(words);
    if(harness.revoke){
     const b=el('button','companion-info-action','Revoke') as HTMLButtonElement;b.type='button';b.dataset.action='revoke-rule';
     b.onclick=async()=>{
      if(b.disabled)return;b.disabled=true;said.textContent='';
      try{await call('harnessApprovalRules',{operation:'revoke',harness:harness.harness,id:rule.id});await draw();said.textContent=`${harness.title} will ask again before: ${rule.allows}`+(harness.revoke==='restart'&&harness.note?` ${harness.note}`:'');}
      catch(e){said.textContent='Could not revoke: '+((e as Error).message||'try again.');if(b.isConnected)b.disabled=false;}
     };
     row.append(b);
    }
    rows.append(row);
   }
   if(!harness.revoke&&harness.rules.length)rows.append(el('p','companion-info-note',harness.note||`Worldlet cannot revoke these. Change them in ${harness.title} itself.`));
   else if(harness.revoke==='live'&&harness.note&&harness.rules.length)rows.append(el('p','companion-info-note',harness.note));
  }
  if(typeof listed?.elsewhere==='string')box.append(el('p','companion-info-note',`${listed.elsewhere} keeps its standing rules where it runs, so they are not listed here.`));
  if(!harnesses.length&&typeof listed?.elsewhere!=='string'&&!listed?.error)box.append(el('p','companion-info-note','No Agent on this computer keeps standing rules Worldlet can read.'));
 }
 await draw();
}
