/** Settings › Agent › Access: each Agent that reaches this World's tools on its own (core/agent/GRANTS.md, host
 * `agentAccess`), with when it was last used, what it may do and what it last asked for, and Revoke, which asks once
 * more in the page, then removes that Agent's key so it can no longer reach the World. Plain words: the page names
 * places in the World and what was allowed, never tokens, endpoints or MCP. */
import {agentButton as button,agentEl as el} from './agent-change.ts';
type Grant={id:string;targets:string[];access:'read'|'write';duration:'standing'|'once';grantedAt:string;expiresAt?:string;revokedAt?:string};
type Audit={at:string;target:string;action:string;decision:'allowed'|'denied'|'asked';reason?:string};
type Agent={id:string;name:string;harness:string;kind:'local'|'remote';createdAt:string;lastSeenAt?:string;revokedAt?:string;grants:Grant[];audit:Audit[]};
const date=(at:string)=>new Date(at).toLocaleDateString(undefined,{year:'numeric',month:'short',day:'numeric'});
const time=(at:string)=>new Date(at).toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});
const SHOWN_PLACES=6,SHOWN_AUDIT=5;
/** The line under an Agent's name: where it runs and when it was last used or revoked. */
export function accessLine(agent:Agent):string {
 const where=agent.kind==='remote'?'On another computer':'On this computer';
 if(agent.revokedAt)return `${where}. Revoked ${date(agent.revokedAt)}.`;
 return `${where}. ${agent.lastSeenAt?'Last used '+date(agent.lastSeenAt):'Not used yet'}.`;
}
/** One Grant in a sentence: what it allows and where. Applet copies of a place are not repeated. */
export function grantLine(grant:Grant):string {
 const verb=grant.access==='write'?(grant.duration==='once'?'Read, and change after asking you,':'Read and change'):'Read';
 const places=[...new Set(grant.targets.map(t=>t.split('/')[0]).filter(t=>!t.startsWith('applet:')))];
 const all=places.includes('*');
 const named=all?'everywhere in your World':places.slice(0,SHOWN_PLACES).join(', ')+(places.length>SHOWN_PLACES?` and ${places.length-SHOWN_PLACES} more`:'');
 const one=grant.targets.length===1&&!all?` (${grant.targets[0].split('/')[1]})`:'';
 return `${verb}: ${named}${one}.`;
}
const DECISION:Record<Audit['decision'],string>={allowed:'Allowed',denied:'Refused',asked:'Asked you'};
export function auditLine(entry:Audit):string {return `${time(entry.at)} · ${entry.target} ${entry.action} · ${DECISION[entry.decision]??entry.decision}`;}

export async function showAgentAccess(target:HTMLElement,call:(action:string,body?:any)=>Promise<any>,current:()=>boolean){
 const box=el('div','companion-settings-approvals companion-settings-access'),said=el('p','companion-settings-status');said.setAttribute('role','status');
 target.append(box,said);
 function confirmRevoke(row:HTMLElement,agent:Agent){
  for(const open of box.querySelectorAll?.('.companion-settings-confirm')??[])open.remove();
  said.textContent='';
  const ask=el('div','companion-settings-confirm');ask.setAttribute('role','group');ask.dataset.confirm=agent.id;
  ask.append(el('span','',`${agent.name} will no longer reach your World's tools from any chat, Fox's conversations with it included. This cannot be undone here.`),
   button('Revoke','confirm-revoke-agent',async()=>{
    try{await call('agentAccess',{operation:'revoke',id:agent.id});await draw();said.textContent=`${agent.name} can no longer reach your World.`;}
    catch(e){said.textContent='Could not revoke: '+((e as Error).message||'try again.');}
   },true),
   button('Keep','keep-agent',()=>{ask.remove();said.textContent='Nothing was changed.';}));
  row.append(ask);
 }
 async function draw(){
  const listed=await call('agentAccess',{operation:'list'}).catch((e:Error)=>({error:e.message}));
  if(!current())return;
  box.replaceChildren();
  if(listed?.error){box.append(el('p','companion-info-note',listed.error));return;}
  const agents:Agent[]=Array.isArray(listed?.agents)?listed.agents:[];
  if(!agents.length){box.append(el('p','companion-info-note','No Agent has reached your World on its own yet.'));return;}
  const rows=el('div','companion-settings-rows');box.append(rows);
  for(const agent of agents){
   const row=el('div','companion-settings-row'),words=el('div');row.dataset.accessAgent=agent.id;
   words.append(el('strong','',agent.name),el('span','',accessLine(agent)));
   for(const grant of agent.grants.filter(g=>!g.revokedAt))words.append(el('span','companion-settings-quiet',grantLine(grant)));
   const recent=agent.audit.slice(0,SHOWN_AUDIT);
   if(recent.length){
    const log=el('ul','companion-settings-quiet companion-settings-access-audit');log.setAttribute('aria-label',`What ${agent.name} last asked for`);
    for(const entry of recent)log.append(el('li','',auditLine(entry)));
    words.append(log);
   }
   row.append(words);
   if(!agent.revokedAt)row.append(button('Revoke','revoke-agent',()=>confirmRevoke(row,agent)));
   rows.append(row);
  }
 }
 await draw();
}
