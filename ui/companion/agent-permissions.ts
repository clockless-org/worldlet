/** Settings › Agent › Permissions: the standing rules an Always on an approval card left in
 * each Agent on this computer (host `harnessApprovalRules`, contracts/harness-services.ts HarnessStandingRules): what it
 * allows, which agent, when and in which Fox conversation it was granted, when it was last used, and Revoke, which asks
 * once more in the page and then makes that Agent forget it its own way. An Agent that cannot have a rule revoked from
 * here says how instead. Plain words only: no allowlist, cron or MCP in what the page shows. */
import {agentButton as button,agentEl as el} from './agent-change.ts';
type Rule={id:string;allows:string;agent:string;kind:string;main?:boolean;grantedAt?:number;lastUsedAt?:number;note?:string;thread?:string;inWorld?:boolean};
type Harness={harness:string;title:string;rules:Rule[];revoke:'live'|'restart'|null;note?:string;error?:string;inUse?:boolean};
const day=(at:number)=>new Date(at).toLocaleDateString(undefined,{year:'numeric',month:'short',day:'numeric'});
const KIND:Record<string,string>={command:'Run',tool:'Use the tool',automation:'In a routine, run'};
/** What a rule lets the Agent do, as the start of a sentence: “Run”, “Use the tool”. */
export function permissionVerb(rule:Rule):string {return KIND[rule.kind]??'Do';}
/** The one line under a rule: when and where it was granted, when it was last used (no profile: owner request 2026-10-11). */
export function permissionLine(rule:Rule,title:string):string {
 const when=rule.grantedAt?`allowed ${day(rule.grantedAt)}`:`allowed outside Worldlet; ${title} keeps no date`;
 const where=rule.thread?`, ${rule.thread[0].toLowerCase()+rule.thread.slice(1)}`:'';
 const used=rule.lastUsedAt?`. Last used ${day(rule.lastUsedAt)}`:'';
 return `${when[0].toUpperCase()+when.slice(1)}${where}${used}.`;
}
export async function showAgentPermissions(target:HTMLElement,call:(action:string,body?:any)=>Promise<any>,current:()=>boolean){
 const box=el('div','companion-settings-approvals'),said=el('p','companion-settings-status');said.setAttribute('role','status');
 target.append(box,said);
 /** The in-page second ask: what revoking does, and only then the Agent's own way of forgetting it. */
 function confirmRevoke(row:HTMLElement,harness:Harness,rule:Rule){
  for(const open of box.querySelectorAll?.('.companion-settings-confirm')??[])open.remove();
  said.textContent='';
  const ask=el('div','companion-settings-confirm');ask.setAttribute('role','group');ask.dataset.confirm=rule.id;
  const question=`${harness.title} will ask you again before it does this.`+(harness.revoke==='restart'?' It takes effect the next time it starts; Worldlet restarts it for you.':'');
  ask.append(el('span','',question),
   button('Revoke','confirm-revoke',async()=>{
    try{await call('harnessApprovalRules',{operation:'revoke',harness:harness.harness,id:rule.id});await draw();said.textContent=`${harness.title} will ask again before: ${rule.allows}`+(harness.note?` ${harness.note}`:'');}
    catch(e){said.textContent='Could not revoke: '+((e as Error).message||'try again.');}
   },true),
   button('Keep','keep-rule',()=>{ask.remove();said.textContent='Nothing was changed.';}));
  row.append(ask);
 }
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
   if(!harness.rules.length)rows.append(el('p','companion-info-note','Nothing yet. It asks you every time.'));
   for(const rule of harness.rules){
    const row=el('div','companion-settings-row'),words=el('div'),allows=el('strong','',permissionVerb(rule)+' ');row.dataset.rule=rule.id;
    allows.append(el('span','',rule.allows));
    words.append(allows,...rule.note&&rule.note!==rule.allows?[el('span','companion-settings-quiet',rule.note)]:[],el('span','',permissionLine(rule,harness.title)));
    row.append(words);
    if(harness.revoke)row.append(button('Revoke','revoke-rule',()=>confirmRevoke(row,harness,rule)));
    rows.append(row);
   }
   if(!harness.revoke&&harness.rules.length)rows.append(el('p','companion-info-note',harness.note||`Worldlet cannot take these back. Change them in ${harness.title} itself.`));
  }
  if(typeof listed?.elsewhere==='string')box.append(el('p','companion-info-note',`${listed.elsewhere} keeps these where it runs, so they are not listed here.`));
  if(!harnesses.length&&typeof listed?.elsewhere!=='string'&&!listed?.error)box.append(el('p','companion-info-note','No Agent on this computer keeps a list Worldlet can read.'));
 }
 await draw();
}
