/** Settings › Agent › Access: each Agent that reaches this World's tools on its own (core/agent/GRANTS.md, host
 * `agentAccess`), with when it was last used, what it may do and what it last asked for, and Revoke, which asks once
 * more in the page, then removes that Agent's key so it can no longer reach the World; and, for each connected
 * Service, "Can read <Service>", which gives or takes back that Service's read Grant at once; "Can ask you" and "Can
 * take work" (Agent asks, core/agent/GRANTS.md#agent-asks), "Can see your board" and "Can set up your board"
 * (core/board/README.md), and "Can report its work" and "Can see other Agents"
 * (core/agent/GRANTS.md#agent-reports), and "Can save to your Journal" and "Can read Agents' Journal artifacts"
 * (core/agent/GRANTS.md#agent-artifacts), and "Can draft <Service> changes" for PostHog and Notion while connected
 * (core/agent/GRANTS.md#posthog-and-notion-drafts), the same way; once a GitHub App is connected, "Can update Issues in <repo>
 * without asking" (core/agent/GRANTS.md#standing-github-writes), one per repository with Remove; what each Agent last
 * reported it is doing; and "Add an Agent for a script" (core/agent/GRANTS.md#agents-for-scripts), which sends only the
 * name the person typed; "Give new work to", the Agent that work posted for no Agent in particular goes to, and each
 * Agent's wake command, the program the host runs on this computer when work is given to it, sent as a list of words
 * (core/agent/GRANTS.md#orders-and-waking-an-agent). Plain words: the page names
 * places in the World and what was allowed, never tokens, endpoints or MCP. */
import {agentButton as button,agentEl as el} from './agent-change.ts';
import {showRemoteAccess} from './remote-access.ts';
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
/** "Can see your board" and "Can set up your board" (core boardGrant, core/board/README.md), the same way. */
const BOARD_TOGGLES=[['read','Can see your board','can now see your board','can no longer see your board'],['define','Can set up your board','can now set up your board','can no longer set up your board']] as const;
/** "Can save to your Journal" and "Can read Agents' Journal artifacts" (core artifactGrant,
 * core/agent/GRANTS.md#agent-artifacts), the same way. */
const ARTIFACT_TOGGLES=[['save','Can save to your Journal','can now save to your Journal','can no longer save to your Journal'],['read','Can read Agents\' Journal artifacts','can now read what Agents saved to your Journal','can no longer read what other Agents saved to your Journal']] as const;
/** "Can draft GitHub changes" (core githubDraftGrant, core/agent/GRANTS.md#github-drafts): shown once GitHub is
 * connected (the sign-in, or the person's own GitHub App) to write what the person approves. */
const DRAFT_TOGGLES=[['draft','Can draft GitHub changes','can now draft GitHub changes for you to approve','can no longer draft GitHub changes']] as const;
/** "Can report its work" and "Can see other Agents" (core reportGrant), the same way. */
const REPORT_TOGGLES=[['report','Can report its work','can now report what it is doing','can no longer report what it is doing'],['list','Can see other Agents','can now see what your other Agents are doing','can no longer see your other Agents']] as const;
/** "Can update Issues in <repo> without asking" (core githubWriteGrant): the page sends the Agent, the repository and
 * one of these choices (with the label prefix the labels need), never targets. */
const WRITE_CHOICES=[['comment-labels','Comment and change labels'],['comment','Comment'],['labels','Change labels']] as const;
/** What one allows, in plain words: "comment and change “state:” labels" (core githubWriteScopeWords). */
export function githubWritesLine(scope:Scope):string {
 const what=[scope.writes.includes('issue.comment')?'comment':'',scope.writes.includes('labels.set')?`change “${scope.labelPrefix}” labels`:''].filter(Boolean).join(' and ');
 return `Can update Issues in ${scope.repo} without asking: ${what}.`;
}
const date=(at:string)=>new Date(at).toLocaleDateString(undefined,{year:'numeric',month:'short',day:'numeric'});
const time=(at:string)=>new Date(at).toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});
const SHOWN_PLACES=6,SHOWN_AUDIT=5;
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
/** One Grant in a sentence: what it allows and where. Applet copies of a place are not repeated. */
export function grantLine(grant:Grant):string {
 if(grant.github)return githubWritesLine(grant.github);
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
 // Orders: its wake command set or removed, it chosen for new work, and how each wake ended (core wakeAuditEntry).
 if(entry.target==='asks'&&/^(set|clear)-wake$/.test(entry.action))return `${time(entry.at)} · Waking it for new work · ${entry.action==='clear-wake'?'You removed it':'You set it'}`;
 if(entry.target==='asks'&&/^(clear-)?order-target$/.test(entry.action))return `${time(entry.at)} · Getting new work · ${entry.action.startsWith('clear')?'You turned it off':'You chose it'}`;
 if(entry.target==='asks'&&entry.action==='wake'){const how=(entry.reason??'').replace(/^Woken for work [^:]*: /,'').replace(/\.$/,'');return `${time(entry.at)} · Woken for new work${how?' · '+how[0].toUpperCase()+how.slice(1):''}`;}
 if(entry.target==='agents'&&/^(un)?grant-(report|list)$/.test(entry.action))return `${time(entry.at)} · ${entry.action.endsWith('list')?'Seeing other Agents':'Reporting its work'} · ${entry.action.startsWith('un')?'You turned it off':'You allowed it'}`;
 if(entry.target==='agents'&&entry.action==='report'&&entry.decision==='allowed')return `${time(entry.at)} · Reported its work`;
 if(entry.target==='board'&&/^(un)?grant-(read|define)$/.test(entry.action))return `${time(entry.at)} · ${entry.action.endsWith('define')?'Setting up your board':'Seeing your board'} · ${entry.action.startsWith('un')?'You turned it off':'You allowed it'}`;
 if(entry.target==='agent-artifacts'&&/^(un)?grant-(save|read)$/.test(entry.action))return `${time(entry.at)} · ${entry.action.endsWith('read')?'Reading Agents\' Journal artifacts':'Saving to your Journal'} · ${entry.action.startsWith('un')?'You turned it off':'You allowed it'}`;
 // "Can draft GitHub changes", and the person's Approve or Dismiss on one of its drafts.
 if(entry.target==='github-drafts'&&(entry.action==='grant'||entry.action==='ungrant'))return `${time(entry.at)} · Drafting GitHub changes · ${entry.action==='ungrant'?'You turned it off':'You allowed it'}`;
 if(entry.target==='github-drafts'&&entry.action==='approve')return `${time(entry.at)} · You approved its GitHub draft · ${entry.decision==='allowed'?'Written':'Not written'}`;
 if(entry.target==='github-drafts'&&entry.action==='dismiss')return `${time(entry.at)} · You dismissed its GitHub draft`;
 // "Can update Issues in <repo> without asking", its calls, and what each wrote.
 if(entry.target==='github-writes'&&(entry.action==='grant'||entry.action==='ungrant'))return `${time(entry.at)} · Updating GitHub Issues without asking · ${entry.action==='ungrant'?'You removed it':'You allowed it'}`;
 if(entry.target==='github-writes'&&entry.action==='run')return `${time(entry.at)} · Change on GitHub without asking · ${DECISION[entry.decision]??entry.decision}`;
 if(entry.target==='github-writes'&&entry.action==='write')return `${time(entry.at)} · Changed GitHub without asking · ${entry.decision==='allowed'?'Written':'Not written'}`;
 // "Can draft PostHog changes" and "Can draft Notion changes", the same way.
 const drafted=/^(posthog|notion)-drafts$/.exec(entry.target),service=drafted?.[1]==='posthog'?'PostHog':'Notion';
 if(drafted&&(entry.action==='grant'||entry.action==='ungrant'))return `${time(entry.at)} · Drafting ${service} changes · ${entry.action==='ungrant'?'You turned it off':'You allowed it'}`;
 if(drafted&&entry.action==='approve')return `${time(entry.at)} · You approved its ${service} draft · ${entry.decision==='allowed'?'Written':'Not written'}`;
 if(drafted&&entry.action==='dismiss')return `${time(entry.at)} · You dismissed its ${service} draft`;
 if(entry.action==='grant'||entry.action==='ungrant')return `${time(entry.at)} · ${entry.target} · ${entry.action==='grant'?'You let it read':'You stopped it reading'}`;
 return `${time(entry.at)} · ${entry.target} ${entry.action} · ${DECISION[entry.decision]??entry.decision}`;
}

export async function showAgentAccess(target:HTMLElement,call:(action:string,body?:any)=>Promise<any>,current:()=>boolean){
 // Remote access first: the connectors it lets in are listed below like any other Agent.
 const remote=el('div');target.append(remote);
 const box=el('div','companion-settings-approvals companion-settings-access'),said=el('p','companion-settings-status');said.setAttribute('role','status');
 // A daemon or scheduled job on this computer that reaches the World as an Agent of its own.
 const adder=el('div','companion-settings-access-add'),name=document.createElement('input');
 name.type='text';name.maxLength=60;name.placeholder='Name, like Nightly build';name.setAttribute('aria-label','Name of the script');
 adder.append(el('span','','Add an Agent for a script'),name,button('Add','add-script-agent',async()=>{
  said.textContent='';
  try{
   const added=await call('agentAccess',{operation:'addScript',name:name.value});
   name.value='';await draw();
   said.textContent=`${added.name} can now reach your World from a script on this computer. Its key is in ${added.endpointFile}. Allow what it may do below.`;
  }catch(e){said.textContent='Could not add it: '+((e as Error).message||'try again.');}
 }));
 target.append(box,adder,said);
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
  // "Give new work to": the Agent work goes to when whoever posts it names none.
  const order=el('label','companion-settings-access-order'),target=document.createElement('select'),chosen=typeof listed?.orders?.defaultFor==='string'?listed.orders.defaultFor:'';
  target.className='companion-settings-select';target.setAttribute('aria-label','Give new work to');target.dataset.orderTarget='';
  target.append(Object.assign(document.createElement('option'),{value:'',textContent:'No Agent in particular'}));
  for(const agent of agents.filter(a=>!a.revokedAt))target.append(Object.assign(document.createElement('option'),{value:agent.id,textContent:agent.name}));
  target.value=chosen;
  target.onchange=async()=>{
   const id=target.value,named=agents.find(a=>a.id===id)?.name;target.disabled=true;said.textContent='';
   try{await call('agentAccess',{operation:'setOrderTarget',id});await draw();said.textContent=named?`New work now goes to ${named}.`:'New work no longer goes to one Agent.';}
   catch(e){target.value=chosen;target.disabled=false;said.textContent='Could not change that: '+((e as Error).message||'try again.');}
  };
  order.append(el('span','','Give new work to:'),target);box.append(order);
  const rows=el('div','companion-settings-rows');box.append(rows);
  for(const agent of agents){
   const row=el('div','companion-settings-row'),words=el('div');row.dataset.accessAgent=agent.id;
   words.append(el('strong','',agent.name),el('span','',accessLine(agent)));
   if(agent.endpointFile)words.append(el('span','companion-settings-quiet',`For a script. Its key is in ${agent.endpointFile}.`));
   const reported=agent.revokedAt?'':reportLine(agent);
   if(reported){const line=el('span','companion-settings-access-report',reported);line.dataset.liveness=agent.liveness??'offline';words.append(line);}
   // Standing GitHub writes are listed below with their Remove.
   for(const grant of agent.grants.filter(g=>!g.revokedAt&&!g.github))words.append(el('span','companion-settings-quiet',grantLine(grant)));
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
   const toggles=(granted:Record<string,boolean>|undefined,list:readonly (readonly [string,string,string,string])[],operation:'Asks'|'Board'|'GithubDrafts'|'Reports'|'Artifacts'|'ServiceDrafts',data:'asks'|'board'|'githubDrafts'|'reports'|'artifacts'|'serviceDrafts')=>{
    if(agent.revokedAt||!granted)return;
    const group=el('div','companion-settings-access-services');
    for(const [kind,title,on,off] of list){
     const label=el('label','companion-settings-access-service'),box=document.createElement('input');
     box.type='checkbox';box.checked=!!granted[kind];box.dataset[data]=kind;
     box.onchange=async()=>{
      const allowed=box.checked;box.disabled=true;said.textContent='';
      try{await call('agentAccess',{operation:(allowed?'grant':'ungrant')+operation,id:agent.id,...operation==='GithubDrafts'?{}:operation==='ServiceDrafts'?{provider:kind}:{kind}});await draw();said.textContent=`${agent.name} ${allowed?on:off}.`;}
      catch(e){box.checked=!allowed;box.disabled=false;said.textContent='Could not change that: '+((e as Error).message||'try again.');}
     };
     label.append(box,document.createTextNode(title));
     group.append(label);
    }
    words.append(group);
   };
   toggles(agent.asks,ASK_TOGGLES,'Asks','asks');
   toggles(agent.board,BOARD_TOGGLES,'Board','board');
   toggles(agent.reports,REPORT_TOGGLES,'Reports','reports');
   toggles(agent.artifacts,ARTIFACT_TOGGLES,'Artifacts','artifacts');
   toggles(agent.githubDrafts===undefined?undefined:{draft:agent.githubDrafts},DRAFT_TOGGLES,'GithubDrafts','githubDrafts');
   // "Can draft PostHog changes", "Can draft Notion changes": one for each such Service while it is connected.
   if(agent.serviceDrafts?.length)toggles(Object.fromEntries(agent.serviceDrafts.map(s=>[s.provider,s.granted])),
    agent.serviceDrafts.map(s=>[s.provider,`Can draft ${s.title} changes`,`can now draft ${s.title} changes for you to approve`,`can no longer draft ${s.title} changes`] as const),'ServiceDrafts','serviceDrafts');
   // "Can update Issues in <repo> without asking": each with Remove, and Allow for another repository.
   if(!agent.revokedAt&&agent.githubWrites){
    const group=el('div','companion-settings-access-writes');group.dataset.githubWrites=agent.id;
    for(const scope of agent.githubWrites.grants){
     const line=el('div','companion-settings-access-write');line.dataset.repo=scope.repo;
     line.append(el('span','',githubWritesLine(scope)),button('Remove','remove-github-writes',async()=>{
      said.textContent='';
      try{await call('agentAccess',{operation:'ungrantGithubWrites',id:agent.id,repo:scope.repo});await draw();said.textContent=`${agent.name} can no longer update ${scope.repo} without asking.`;}
      catch(e){said.textContent='Could not change that: '+((e as Error).message||'try again.');}
     }));
     group.append(line);
    }
    if(agent.githubWrites.add){
     const form=el('div','companion-settings-access-write'),repo=document.createElement('input'),choice=document.createElement('select'),prefix=document.createElement('input');
     repo.className='companion-settings-input';repo.placeholder='owner/repo';repo.setAttribute('aria-label','Repository');repo.autocomplete='off';repo.spellcheck=false;
     choice.className='companion-settings-select';choice.setAttribute('aria-label','What it may do');
     for(const [value,title] of WRITE_CHOICES)choice.append(Object.assign(document.createElement('option'),{value,textContent:title}));
     prefix.className='companion-settings-input';prefix.value='state:';prefix.setAttribute('aria-label','Labels starting with');prefix.autocomplete='off';prefix.spellcheck=false;
     choice.onchange=()=>{prefix.hidden=choice.value==='comment';};
     form.append(el('span','','Let it update Issues in a repository without asking you:'),repo,choice,prefix,button('Allow','allow-github-writes',async()=>{
      said.textContent='';
      const body={operation:'grantGithubWrites',id:agent.id,repo:repo.value.trim(),choice:choice.value,...choice.value==='comment'?{}:{labelPrefix:prefix.value}};
      try{await call('agentAccess',body);await draw();said.textContent=`${agent.name} can now update ${body.repo} without asking.`;}
      catch(e){said.textContent='Could not change that: '+((e as Error).message||'try again.');}
     }));
     group.append(form);
    }
    words.append(group);
   }
   // Its wake command: a program this computer runs only because the person typed it here, one word per line.
   if(!agent.revokedAt&&agent.wake){
    const group=el('div','companion-settings-access-wake'),command=document.createElement('textarea');group.dataset.wake=agent.id;
    command.className='companion-settings-input';command.rows=3;command.spellcheck=false;command.value=agent.wake.join('\n');command.placeholder='/Users/alex/bin/wake-agent\n{askId}';
    command.setAttribute('aria-label',`Wake command for ${agent.name}`);
    const send=async(words:string[])=>{
     said.textContent='';
     try{await call('agentAccess',{operation:'setWake',id:agent.id,command:words});await draw();
      said.textContent=words.length?`Worldlet will run this program on this computer when work is given to ${agent.name}.`:`${agent.name} will no longer be woken for new work.`;}
     catch(e){said.textContent='Could not change that: '+((e as Error).message||'try again.');}
    };
    group.append(el('span','','Wake it for new work'),
     el('span','companion-settings-quiet',`When work is given to ${agent.name}, Worldlet runs this program on this computer, at most once a minute. First line: the program's full path; then one argument per line. A line that is just {askId} becomes the work's ID. Nothing runs unless you save it here.`),
     command,button('Save','save-wake',()=>send(command.value.split('\n').map(line=>line.replace(/\r$/,'')).filter(line=>line.trim()))));
    if(agent.wake.length)group.append(button('Remove','remove-wake',()=>send([])));
    words.append(group);
   }
   row.append(words);
   if(!agent.revokedAt)row.append(button('Revoke','revoke-agent',()=>confirmRevoke(row,agent)));
   rows.append(row);
  }
 }
 await Promise.all([draw(),showRemoteAccess(remote,call,current)]);
}
