/** Settings › Agents, its list (issue #674): your own Agent first, with Manage for its page (`own`), then each Agent that
 * reaches this World's tools on its own (agent/gate/GRANTS.md, host `agentAccess`), with where it runs, when it was last
 * used, what it last reported and what it may do in one sentence, Manage and Remove. Remove asks once more in the page,
 * then removes that Agent's key so it can no longer reach the World. Manage shows the Agent's own page: one switch per
 * thing it may do, each giving or taking back one Grant at once: "Can read <Service>" for each connected Service, "Can ask
 * you" and "Can take work" (agent/gate/GRANTS.md#agent-asks), "Can see your board" and "Can set up your board"
 * (context/connectors/BOARD.md), "Can report its work" and "Can see other Agents" (agent/gate/GRANTS.md#agent-reports),
 * "Can save to your Journal" and "Can read Agents' Journal artifacts" (agent/gate/GRANTS.md#agent-artifacts), and "Can
 * draft <Service> changes" for GitHub, PostHog and Notion while connected. Nothing is folded and nothing is typed (owner
 * request 2026-10-22: no Advanced in Settings); standing GitHub writes, wake commands, Agents for scripts and who gets new
 * work stay with the host's `agentAccess`. Plain words: the page names places in the World and what was allowed, never
 * tokens, endpoints or MCP. */
import {agentButton as button,agentEl as el} from './agent-change.ts';
import {AGENT_ICONS,appLogoSource} from '../applets/index.ts';
import {settingsIcon,settingsRow,settingsSwitch,type SettingsIcon} from './settings-rows.ts';
/** The Agent Fox works through (companion-settings.ts): first in the list, with Manage for its own page. `harness` names
 * the listed Agent that is it, when it reaches the World too; `line` says how it is doing. */
export type OwnAgent={harness:string|null;title:string;line:string;open:()=>void};
type Scope={repo:string;writes:string[];labelPrefix?:string};
type Grant={id:string;targets:string[];access:'read'|'write';duration:'standing'|'once';grantedAt:string;expiresAt?:string;revokedAt?:string;github?:Scope};
type Audit={at:string;target:string;action:string;decision:'allowed'|'denied'|'asked';reason?:string};
type Service={provider:string;title:string;granted:boolean};
type Agent={id:string;name:string;harness:string;kind:'local'|'remote';createdAt:string;lastSeenAt?:string;revokedAt?:string;grants:Grant[];audit:Audit[];services?:Service[];asks?:{ask:boolean;work:boolean};board?:{read:boolean;define:boolean};githubDrafts?:boolean;githubWrites?:{add:boolean;grants:Scope[]};
 reports?:{report:boolean;list:boolean};artifacts?:{save:boolean;read:boolean};serviceDrafts?:Service[];
 /** Its wake command as the person typed it: the program's full path, then each argument. */
 wake?:string[];liveness?:'live'|'stale'|'offline';report?:Report;
 /** An Agent for a script: the file its program reads its endpoint and token from. */
 endpointFile?:string};
type Report={status:'working'|'idle'|'blocked'|'offline';summary:string;work:{title:string;state?:string}[];runs:{title:string;status:string}[];reportedAt:string};
/** "Can ask you" and "Can take work" (core askGrant): the page names only which, never targets. */
const ASK_TOGGLES=[['ask','Can ask you','can now ask you things in Attention','can no longer ask you things'],['work','Can take work','can now take work left for Agents','can no longer take work']] as const;
/** "Can see your board" and "Can set up your board" (core boardGrant, context/connectors/BOARD.md), the same way. */
const BOARD_TOGGLES=[['read','Can see your board','can now see your board','can no longer see your board'],['define','Can set up your board','can now set up your board','can no longer set up your board']] as const;
/** "Can save to your Journal" and "Can read Agents' Journal artifacts" (core artifactGrant,
 * agent/gate/GRANTS.md#agent-artifacts), the same way. */
const ARTIFACT_TOGGLES=[['save','Can save to your Journal','can now save to your Journal','can no longer save to your Journal'],['read','Can read Agents\' Journal artifacts','can now read what Agents saved to your Journal','can no longer read what other Agents saved to your Journal']] as const;
/** "Can draft GitHub changes" (core githubDraftGrant, agent/gate/GRANTS.md#github-drafts): shown once GitHub is
 * connected (the sign-in, or the person's own GitHub App) to write what the person approves. */
const DRAFT_TOGGLES=[['draft','Can draft GitHub changes','can now draft GitHub changes for you to approve','can no longer draft GitHub changes']] as const;
/** "Can report its work" and "Can see other Agents" (core reportGrant), the same way. */
const REPORT_TOGGLES=[['report','Can report its work','can now report what it is doing','can no longer report what it is doing'],['list','Can see other Agents','can now see what your other Agents are doing','can no longer see your other Agents']] as const;
const date=(at:string)=>new Date(at).toLocaleDateString(undefined,{year:'numeric',month:'short',day:'numeric'});
/** The line under an Agent's name: where it runs and when it was last used or revoked. */
export function accessLine(agent:Agent):string {
 const where=agent.kind==='remote'?'On another computer':'On this computer';
 if(agent.revokedAt)return `${where}. Revoked ${date(agent.revokedAt)}.`;
 return `${where}. ${agent.lastSeenAt?'Last used '+date(agent.lastSeenAt):'Not used yet'}.`;
}
const STATUS:Record<Report['status'],string>={working:'Working',idle:'Free',blocked:'Blocked',offline:'Stopped'};
/** What the Agent last reported, in a sentence: its status (or that it has gone quiet), its summary and when. Empty
 * when it never reported. */
export function reportLine(agent:Agent,clock=Date.now()):string {
 const report=agent.report;
 if(!report)return '';
 const minutes=Math.max(0,Math.round((clock-Date.parse(report.reportedAt))/60_000));
 const ago=minutes<1?'just now':minutes<60?`${minutes} min ago`:minutes<1440?`${Math.round(minutes/60)} h ago`:date(report.reportedAt);
 const status=agent.liveness==='live'||report.status==='offline'?STATUS[report.status]:agent.liveness==='stale'?'Quiet':'Offline';
 const work=report.work.length?` · ${report.work.slice(0,2).map(item=>item.title).join(', ')}${report.work.length>2?` and ${report.work.length-2} more`:''}`:'';
 return `${status}${report.summary?': '+report.summary:''}${work} · reported ${ago}.`;
}
/** What the Agent may do, in one sentence anyone reads: "It may look at your World, read PostHog, take work and see your
 * board." Only what it was allowed; the switches on its page say the rest. */
export function mayLine(agent:Agent):string {
 if(agent.revokedAt)return '';
 const live=agent.grants.filter(g=>!g.revokedAt&&!g.github),may:string[]=[];
 if(live.some(g=>g.access==='write'))may.push('look at and change things in your World');
 else if(live.length)may.push('look at your World');
 const read=(agent.services??[]).filter(s=>s.granted).map(s=>s.title);
 if(read.length)may.push('read '+words(read));
 const on:[boolean|undefined,string][]=[[agent.asks?.ask,'ask you things'],[agent.asks?.work,'take work'],[agent.board?.read,'see your board'],[agent.board?.define,'set up your board'],
  [agent.reports?.report,'report its work'],[agent.reports?.list,'see your other Agents'],[agent.artifacts?.save,'save to your Journal'],[agent.artifacts?.read,'read what Agents saved'],[agent.githubDrafts,'draft GitHub changes']];
 for(const [allowed,what] of on)if(allowed)may.push(what);
 for(const s of agent.serviceDrafts??[])if(s.granted)may.push(`draft ${s.title} changes`);
 for(const scope of agent.githubWrites?.grants??[])may.push(`update Issues in ${scope.repo} without asking`);
 return may.length?`It may ${words(may)}.`:'It may not do anything in your World yet.';
}
/** An Agent's picture on its row: its own logo when Worldlet has one (Claude, ChatGPT, Codex, Hermes…), else its first letter. */
export function agentIcon(harness:string,name:string):SettingsIcon {
 const key=harness==='claude-ai'?'claude':harness;
 const logo=AGENT_ICONS[key]||appLogoSource({key});
 return logo?{logo}:{letter:name||'?'};
}
const words=(list:string[])=>list.length<2?list.join(''):list.slice(0,-1).join(', ')+' and '+list[list.length-1];
/** A switch on an Agent's page: its words, whether it is on, and the `agentAccess` operation and fields that turn it on
 * (`grant…`) or off (`ungrant…`); `on` and `off` finish the sentence that says what changed. */
type Toggle={title:string;on:boolean;operation:string;body:Record<string,string>;onText:string;offText:string};
function toggles(agent:Agent):Toggle[] {
 if(agent.revokedAt)return [];
 const list:Toggle[]=[];
 for(const service of agent.services??[])list.push({title:`Can read ${service.title}`,on:!!service.granted,operation:'Service',body:{provider:service.provider},onText:`can now read ${service.title}`,offText:`can no longer read ${service.title}`});
 const kinds=(granted:Record<string,boolean>|undefined,rows:readonly (readonly [string,string,string,string])[],operation:string)=>{
  if(granted)for(const [kind,title,onText,offText] of rows)list.push({title,on:!!granted[kind],operation,body:operation==='GithubDrafts'?{}:{kind},onText,offText});
 };
 kinds(agent.asks,ASK_TOGGLES,'Asks');
 kinds(agent.board,BOARD_TOGGLES,'Board');
 kinds(agent.reports,REPORT_TOGGLES,'Reports');
 kinds(agent.artifacts,ARTIFACT_TOGGLES,'Artifacts');
 kinds(agent.githubDrafts===undefined?undefined:{draft:agent.githubDrafts},DRAFT_TOGGLES,'GithubDrafts');
 for(const service of agent.serviceDrafts??[])list.push({title:`Can draft ${service.title} changes`,on:!!service.granted,operation:'ServiceDrafts',body:{provider:service.provider},onText:`can now draft ${service.title} changes for you to approve`,offText:`can no longer draft ${service.title} changes`});
 return list;
}

const TOGGLE_ICONS:Record<string,string>={Service:'plug',Board:'project',Artifacts:'book',Asks:'chat',Reports:'people'};
/** One switch row per thing the Agent may do; each change says what changed in `said`, then `changed` draws again. */
function mayRows(agent:Agent,call:(action:string,body?:any)=>Promise<any>,said:HTMLElement,changed:()=>void){
 const rows=el('div','companion-settings-rows');rows.dataset.agentMay=agent.id;
 for(const t of toggles(agent))rows.append(settingsRow({icon:{icon:TOGGLE_ICONS[t.operation]??'note'},title:t.title,
  controls:[settingsSwitch({label:t.title,on:t.on,id:'may-'+(t.body.provider??t.body.kind??t.operation.toLowerCase()),change:async value=>{
   said.textContent='';
   try{await call('agentAccess',{operation:(value?'grant':'ungrant')+t.operation,id:agent.id,...t.body});said.textContent=`${agent.name} ${value?t.onText:t.offText}.`;changed();}
   catch(e){said.textContent='Could not change that: '+((e as Error).message||'try again.');return false;}
  }})]}));
 return rows;
}

/** On your own Agent's page (companion-settings.ts): what it may do, the same switches as another Agent's page, when it
 * reaches the World itself (the listed local Agent of `harness`, not revoked). */
export async function showOwnAgentMay(target:HTMLElement,call:(action:string,body?:any)=>Promise<any>,current:()=>boolean,harness:string|null){
 const box=el('div'),said=el('p','companion-settings-status');said.setAttribute('role','status');
 target.append(box,said);
 const draw=async()=>{
  const listed=await call('agentAccess',{operation:'list'}).catch(()=>null);
  if(!current())return;
  const agent=harness&&Array.isArray(listed?.agents)?(listed.agents as Agent[]).find(a=>a.harness===harness&&a.kind==='local'&&!a.revokedAt):undefined;
  const rows=agent?mayRows(agent,call,said,()=>void draw()):null;
  box.replaceChildren(...rows?.childElementCount?[rows]:[el('p','companion-info-note','It may do what you ask Fox, and asks you before it changes anything.')]);
 };
 await draw();
}

/** The list of Agents in `target`, your own first (`own`), each with Manage and Remove; Manage on another Agent shows its
 * page in the same place, with Back to the list. */
export async function showAgentAccess(target:HTMLElement,call:(action:string,body?:any)=>Promise<any>,current:()=>boolean,{own}:{own?:OwnAgent}={}){
 const box=el('div','companion-settings-approvals companion-settings-access'),said=el('p','companion-settings-status');said.setAttribute('role','status');
 // The Agent whose page is shown instead of the list.
 let managing:string|null=null;
 target.append(box,said);
 function confirmRevoke(row:HTMLElement,agent:Agent){
  for(const open of box.querySelectorAll?.('.companion-settings-confirm')??[])open.remove();
  said.textContent='';
  const ask=el('div','companion-settings-confirm');ask.setAttribute('role','group');ask.dataset.confirm=agent.id;
  ask.append(el('span','',`${agent.name} will no longer reach your World's tools from any chat, Fox's conversations with it included. This cannot be undone here.`),
   button('Remove','confirm-revoke-agent',async()=>{
    try{await call('agentAccess',{operation:'revoke',id:agent.id});managing=null;await draw();said.textContent=`${agent.name} can no longer reach your World.`;}
    catch(e){said.textContent='Could not remove it: '+((e as Error).message||'try again.');}
   },true),
   button('Keep','keep-agent',()=>{ask.remove();said.textContent='Nothing was changed.';}));
  row.append(ask);
 }
 /** What the row and the page say about an Agent: its name (and Your Agent), how it is doing, where it runs, what it
  * last reported and what it may do. */
 function about(agent:Agent,mine:boolean){
  const words=el('div'),name=el('strong','',agent.name);
  if(mine)name.append(' ',el('span','companion-settings-tag','Your Agent'));
  words.append(name,...mine?[el('span','',own!.line)]:[],el('span','',accessLine(agent)));
  const reported=agent.revokedAt?'':reportLine(agent);
  if(reported){const line=el('span','companion-settings-access-report',reported);line.dataset.liveness=agent.liveness??'offline';words.append(line);}
  const may=mayLine(agent);
  if(may)words.append(el('span','companion-settings-access-may',may));
  return words;
 }
 function page(agent:Agent){
  const head=el('div','companion-settings-own-head');head.dataset.view='agent';head.dataset.agent=agent.id;
  head.append(button('‹ All Agents','agents-back',()=>{managing=null;said.textContent='';void draw();}),el('h5','companion-settings-own-title',agent.name));
  const card=el('div','companion-settings-row has-icon');card.dataset.accessAgent=agent.id;card.append(settingsIcon(agentIcon(agent.harness,agent.name)),about(agent,false));
  const rows=mayRows(agent,call,said,()=>void draw());
  const remove=settingsRow({icon:{icon:'close'},title:'Remove this Agent',line:'It will no longer reach your World. Asks you first.',controls:[button('Remove','revoke-agent',()=>confirmRevoke(remove,agent))]});
  box.append(head,card,...rows.childElementCount?[el('h5','companion-settings-subhead','What it may do'),rows]:[],...agent.revokedAt?[]:[remove]);
 }
 async function draw(){
  const listed=await call('agentAccess',{operation:'list'}).catch((e:Error)=>({error:e.message}));
  if(!current())return;
  box.replaceChildren();
  if(listed?.error){box.append(el('p','companion-info-note',listed.error));return;}
  const all:Agent[]=Array.isArray(listed?.agents)?listed.agents:[];
  const shown=managing?all.find(a=>a.id===managing):undefined;
  if(shown)return page(shown);
  managing=null;
  // Your own Agent first: the listed one that is it, or a row of its own when it has not reached the World by itself.
  const mine=own?.harness?all.find(a=>a.harness===own.harness&&a.kind==='local'&&!a.revokedAt):undefined;
  const agents=mine?[mine,...all.filter(a=>a!==mine)]:all;
  const ownRow=()=>{
   const row=el('div','companion-settings-row has-icon is-own'),words=el('div');row.dataset.ownAgent='';
   const name=el('strong','',own!.title);name.append(' ',el('span','companion-settings-tag','Your Agent'));
   words.append(name,el('span','',own!.line));
   row.append(settingsIcon(agentIcon(own!.harness??'',own!.title)),words,button('Manage','open-own-agent',()=>own!.open()));
   return row;
  };
  if(!agents.length){box.append(...own?[ownRow()]:[],el('p','companion-info-note','No other Agent has reached your World yet.'));return;}
  const rows=el('div','companion-settings-rows');box.append(rows);
  if(own&&!mine)rows.append(ownRow());
  for(const agent of agents){
   const row=el('div','companion-settings-row has-icon'+(agent===mine?' is-own':''));row.dataset.accessAgent=agent.id;
   row.append(settingsIcon(agentIcon(agent.harness,agent.name)),about(agent,agent===mine));
   if(agent===mine)row.append(button('Manage','open-own-agent',()=>own!.open()));
   else if(!agent.revokedAt)row.append(button('Manage','manage-agent',()=>{managing=agent.id;said.textContent='';void draw();}));
   if(!agent.revokedAt)row.append(button('Remove','revoke-agent',()=>confirmRevoke(row,agent)));
   rows.append(row);
  }
 }
 await draw();
}
