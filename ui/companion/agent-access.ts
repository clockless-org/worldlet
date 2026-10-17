/** Settings › Agent › Access: each Agent that reaches this World's tools on its own (core/agent/GRANTS.md, host
 * `agentAccess`), with when it was last used, what it may do and what it last asked for, and Revoke, which asks once
 * more in the page, then removes that Agent's key so it can no longer reach the World; and, for each connected
 * Service, "Can read <Service>", which gives or takes back that Service's read Grant at once; "Can ask you" and "Can
 * take work" (Agent asks, core/agent/GRANTS.md#agent-asks), and "Can see your board" and "Can set up your board"
 * (core/board/README.md), the same way. Plain words: the page names
 * places in the World and what was allowed, never tokens, endpoints or MCP. */
import {agentButton as button,agentEl as el} from './agent-change.ts';
import {showRemoteAccess} from './remote-access.ts';
type Grant={id:string;targets:string[];access:'read'|'write';duration:'standing'|'once';grantedAt:string;expiresAt?:string;revokedAt?:string};
type Audit={at:string;target:string;action:string;decision:'allowed'|'denied'|'asked';reason?:string};
type Service={provider:string;title:string;granted:boolean};
type Agent={id:string;name:string;harness:string;kind:'local'|'remote';createdAt:string;lastSeenAt?:string;revokedAt?:string;grants:Grant[];audit:Audit[];services?:Service[];asks?:{ask:boolean;work:boolean};board?:{read:boolean;define:boolean};githubDrafts?:boolean};
/** "Can ask you" and "Can take work" (core askGrant): the page names only which, never targets. */
const ASK_TOGGLES=[['ask','Can ask you','can now ask you things in Attention','can no longer ask you things'],['work','Can take work','can now take work left for Agents','can no longer take work']] as const;
/** "Can see your board" and "Can set up your board" (core boardGrant, core/board/README.md), the same way. */
const BOARD_TOGGLES=[['read','Can see your board','can now see your board','can no longer see your board'],['define','Can set up your board','can now set up your board','can no longer set up your board']] as const;
/** "Can draft GitHub changes" (core githubDraftGrant, core/agent/GRANTS.md#github-drafts): shown once a GitHub App can
 * write what the person approves. */
const DRAFT_TOGGLES=[['draft','Can draft GitHub changes','can now draft GitHub changes for you to approve','can no longer draft GitHub changes']] as const;
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
export function auditLine(entry:Audit):string {
 // The person's own change in Settings (core serviceGrantAuditEntry), not a call.
 // "Can ask you" and "Can take work" (core askGrantAuditEntry), and the person's answer to one of its asks.
 if(entry.target==='asks'&&/^(un)?grant-(ask|work)$/.test(entry.action))return `${time(entry.at)} · ${entry.action.endsWith('work')?'Taking work':'Asking you'} · ${entry.action.startsWith('un')?'You turned it off':'You allowed it'}`;
 if(entry.target==='asks'&&entry.action==='answer')return `${time(entry.at)} · You answered its ask`;
 if(entry.target==='board'&&/^(un)?grant-(read|define)$/.test(entry.action))return `${time(entry.at)} · ${entry.action.endsWith('define')?'Setting up your board':'Seeing your board'} · ${entry.action.startsWith('un')?'You turned it off':'You allowed it'}`;
 // "Can draft GitHub changes", and the person's Approve or Dismiss on one of its drafts.
 if(entry.target==='github-drafts'&&(entry.action==='grant'||entry.action==='ungrant'))return `${time(entry.at)} · Drafting GitHub changes · ${entry.action==='ungrant'?'You turned it off':'You allowed it'}`;
 if(entry.target==='github-drafts'&&entry.action==='approve')return `${time(entry.at)} · You approved its GitHub draft · ${entry.decision==='allowed'?'Written':'Not written'}`;
 if(entry.target==='github-drafts'&&entry.action==='dismiss')return `${time(entry.at)} · You dismissed its GitHub draft`;
 if(entry.action==='grant'||entry.action==='ungrant')return `${time(entry.at)} · ${entry.target} · ${entry.action==='grant'?'You let it read':'You stopped it reading'}`;
 return `${time(entry.at)} · ${entry.target} ${entry.action} · ${DECISION[entry.decision]??entry.decision}`;
}

export async function showAgentAccess(target:HTMLElement,call:(action:string,body?:any)=>Promise<any>,current:()=>boolean){
 // Remote access first: the connectors it lets in are listed below like any other Agent.
 const remote=el('div');target.append(remote);
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
   if(!agent.revokedAt&&agent.services?.length){
    const services=el('div','companion-settings-access-services');
    for(const service of agent.services){
     const label=el('label','companion-settings-access-service'),box=document.createElement('input');
     box.type='checkbox';box.checked=!!service.granted;box.dataset.service=service.provider;
     box.onchange=async()=>{
      const on=box.checked;box.disabled=true;said.textContent='';
      try{
       await call('agentAccess',{operation:on?'grantService':'ungrantService',id:agent.id,provider:service.provider});
       await draw();said.textContent=on?`${agent.name} can now read ${service.title}.`:`${agent.name} can no longer read ${service.title}.`;
      }catch(e){box.checked=!on;box.disabled=false;said.textContent='Could not change that: '+((e as Error).message||'try again.');}
     };
     label.append(box,document.createTextNode(`Can read ${service.title}`));
     services.append(label);
    }
    words.append(services);
   }
   // "Can ask you" and "Can take work"; "Can see your board" and "Can set up your board": each gives or takes back one
   // Grant at once, naming only which.
   const toggles=(granted:Record<string,boolean>|undefined,list:readonly (readonly [string,string,string,string])[],operation:'Asks'|'Board'|'GithubDrafts',data:'asks'|'board'|'githubDrafts')=>{
    if(agent.revokedAt||!granted)return;
    const group=el('div','companion-settings-access-services');
    for(const [kind,title,on,off] of list){
     const label=el('label','companion-settings-access-service'),box=document.createElement('input');
     box.type='checkbox';box.checked=!!granted[kind];box.dataset[data]=kind;
     box.onchange=async()=>{
      const allowed=box.checked;box.disabled=true;said.textContent='';
      try{await call('agentAccess',{operation:(allowed?'grant':'ungrant')+operation,id:agent.id,...operation==='GithubDrafts'?{}:{kind}});await draw();said.textContent=`${agent.name} ${allowed?on:off}.`;}
      catch(e){box.checked=!allowed;box.disabled=false;said.textContent='Could not change that: '+((e as Error).message||'try again.');}
     };
     label.append(box,document.createTextNode(title));
     group.append(label);
    }
    words.append(group);
   };
   toggles(agent.asks,ASK_TOGGLES,'Asks','asks');
   toggles(agent.board,BOARD_TOGGLES,'Board','board');
   toggles(agent.githubDrafts===undefined?undefined:{draft:agent.githubDrafts},DRAFT_TOGGLES,'GithubDrafts','githubDrafts');
   row.append(words);
   if(!agent.revokedAt)row.append(button('Revoke','revoke-agent',()=>confirmRevoke(row,agent)));
   rows.append(row);
  }
 }
 await Promise.all([draw(),showRemoteAccess(remote,call,current)]);
}
