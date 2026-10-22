// Settings › Agents (issue #674): the list of Agents, your own first with Open for its page, which says what Fox runs on,
// the Agents on this computer and elsewhere, the provider, and the last reply's problem with its fix; then the Agent's
// own skills and routines (each change its own command, asked once more in plain words, the Task panel read again after a
// schedule change), what it may do without asking (with Revoke, asked once more) and, last, the accounts and tools that
// were the Accounts section, which old entry points now open. What each Agent remembers is in Settings › Context; what
// each Agent may do is on the list. There is no energy, charge or battery anywhere (owner request 2026-10-10).
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {pageErrors,worldUrl,waitForWorld,SETTINGS_BUTTON} from './browser-test.ts';
const browser=await chromium.launch({args:['--allow-file-access-from-files']});
try{
 const page=await browser.newPage({viewport:{width:1280,height:850},reducedMotion:'reduce'}),errors=pageErrors(page);
 await page.addInitScript(()=>{const w=window as any;w.calls=[];w.copied=[];Object.defineProperty(navigator,'clipboard',{value:{writeText:async(text:string)=>{w.copied.push(text);}}});w.source={source:'own',ready:true,name:'claude-sonnet',provider:'anthropic'};
  // Settings › Agents (agent/gate/GRANTS.md): one Agent with its default Grants and newest decisions.
  w.access=[{id:'hermes',name:'Hermes Agent',harness:'hermes',kind:'local',createdAt:'2026-10-01T09:00:00.000Z',lastSeenAt:'2026-10-14T18:30:00.000Z',
   grants:[{id:'hermes-channel-read',agentId:'hermes',targets:['items/query','history/query','companion/recall','meetings/decisions','gmail/draft','gmail/read','google-calendar/read','apple-notes/read','todoist/read','applet:mail/read'],access:'read',duration:'standing',grantedAt:'2026-10-01T09:00:00.000Z'},
    {id:'hermes-channel-link',agentId:'hermes',targets:['world/link'],access:'write',duration:'standing',grantedAt:'2026-10-01T09:00:00.000Z'},
    {id:'hermes-github-writes-example/app',agentId:'hermes',targets:['github-writes/run'],access:'write',duration:'standing',grantedAt:'2026-10-02T09:00:00.000Z',github:{repo:'example/app',writes:['issue.comment','labels.set'],labelPrefix:'state:'}}],
   audit:[{at:'2026-10-14T18:30:00.000Z',agentId:'hermes',target:'items',action:'update',decision:'denied',reason:'Only reading here.'},{at:'2026-10-14T18:29:30.000Z',agentId:'hermes',target:'github-writes',action:'write',decision:'allowed',grantId:'hermes-github-writes-example/app'},{at:'2026-10-14T18:29:00.000Z',agentId:'hermes',target:'items',action:'query',decision:'allowed',grantId:'hermes-channel-read'}],
   services:[{provider:'github',title:'GitHub',granted:false},{provider:'posthog',title:'PostHog',granted:true},{provider:'search-console',title:'Search Console',granted:false}],asks:{ask:false,work:true},board:{read:true,define:false},githubDrafts:false,serviceDrafts:[{provider:'posthog',title:'PostHog',granted:false}],
   githubWrites:{add:true,grants:[{repo:'example/app',writes:['issue.comment','labels.set'],labelPrefix:'state:'}]},
   artifacts:{save:false,read:true},reports:{report:true,list:false},wake:[],liveness:'stale',report:{status:'working',summary:'Building the installer',work:[{title:'Fix the build'}],runs:[],reportedAt:new Date(Date.now()-25*60_000).toISOString()}}];
  w.rules=[{id:'rule-00000000000000a1',allows:'npm test',agent:'default',kind:'command',main:true,grantedAt:Date.UTC(2026,9,8,12),thread:'In Fox’s main conversation',inWorld:true},{id:'rule-00000000000000a2',allows:'github › search_issues',agent:'default',kind:'tool',main:true,note:'Any arguments'}];
  w.jobs=[{id:'job-1',name:'Morning digest',kind:'prompt',paused:false,when:{cron:'0 8 * * *'},delivery:'telegram',last:{at:Date.UTC(2026,9,10,8),status:'ok'}},{id:'job-2',name:'Plant check',kind:'prompt',paused:true,when:{everySeconds:7200}}];
  w.skills=[{name:'seed-swap',description:'Organize seed swaps.',lastRanAt:Date.now()-3*86_400_000,enabled:true,removable:false},{name:'k8s',description:'Kubernetes help.',lastRanAt:null,enabled:false,removable:true}];
  w.current={harness:'hermes',title:'Hermes Agent'};
  const user=['Prefers Chinese.','Runs on Saturday mornings.','Lives in Lisbon.','Has two cats, Miso and Tofu.','Works on Worldlet.','Prefers short replies.'];
  w.memory=[...user.map((text,i)=>({id:'mem-00000000000000'+(10+i),kind:'user',text,where:'~/.hermes/memories/USER.md'})),{id:'mem-0000000000000020',kind:'memory',text:'The lease renewal is due in November.',where:'~/.hermes/memories/MEMORY.md'}];
  w.routinesHeard=0;addEventListener('worldlet:routines',()=>{w.routinesHeard++;});
  w.daily={plan:true,summary:true};
  w.asked=[];addEventListener('worldlet:fox-ask',(e:any)=>{w.asked.push(e.detail?.text);e.stopImmediatePropagation();},true);
  w.webkit={messageHandlers:{worldlet:{async postMessage(b){w.calls.push(b);
  // Each change is previewed (the Agent's exact command) and runs only with that confirmation.
  if(b.action==='harnessSchedule'&&b.operation==='preview'){const id=b.change==='create'?'new':b.job;(w.pending||={})[id]=b;return {command:'hermes cron '+b.change+' '+id,confirm:'c|'+b.change+'|'+id};}
  if(b.action==='harnessSchedule'&&b.operation==='change'){const [,change,id]=b.confirm.split('|');
   const when=(s:any)=>s.daily?{cron:s.daily.minute+' '+s.daily.hour+' * * *'}:{everySeconds:s.everyHours*3600};
   if(change==='reschedule')w.jobs=w.jobs.map(j=>j.id===id?{...j,when:when(w.pending[id].schedule)}:j);
   if(change==='create'){const p=w.pending.new.job;w.jobs=[...w.jobs,{id:'job-9',name:p.name,paused:false,when:when(p.schedule)}];}
   if(change==='pause')w.jobs=w.jobs.map(j=>j.id===id?{...j,paused:true}:j);if(change==='resume')w.jobs=w.jobs.map(j=>j.id===id?{...j,paused:false}:j);if(change==='remove')w.jobs=w.jobs.filter(j=>j.id!==id);return {ok:true};}
  // What each Agent remembers, read only; Claude Code here is another Agent, shown read-only with where to change it.
  if(b.action==='harnessMemory')return {current:w.current,harnesses:[{harness:'hermes',title:'Hermes Agent',inUse:w.current.harness==='hermes',entries:w.memory},{harness:'claude-code',title:'Claude Code',inUse:w.current.harness==='claude-code',entries:[{id:'mem-0000000000000030',kind:'memory',text:'Use pnpm, never npm.',where:'~/.claude/CLAUDE.md'}]}]};
  if(b.action==='foxPreferences')return {ok:true,dailyRoutines:{...w.daily}};
  if(b.action==='foxPreferenceChange'&&b.setting==='daily_routines'){w.daily={...w.daily,...b.value};return {ok:true,dailyRoutines:{...w.daily}};}
  if(b.action==='harnessSchedule')return {current:w.current,harnesses:[{harness:'hermes',title:'Hermes Agent',inUse:w.current.harness==='hermes',changes:true,creates:true,running:false,canStart:true,jobs:w.jobs}]};
  if(b.action==='harnessSkills'&&b.operation==='preview')return {command:'hermes config set skills.disabled ["'+b.skill+'"]',confirm:'s|'+b.change+'|'+b.skill};
  if(b.action==='harnessSkills'&&b.operation==='change'){const [,change,name]=b.confirm.split('|');
   w.skills=change==='remove'?w.skills.filter(s=>s.name!==name):w.skills.map(s=>s.name===name?{...s,enabled:change==='enable'}:s);return {ok:true};}
  if(b.action==='harnessSkills')return {current:w.current,harnesses:[{harness:'hermes',title:'Hermes Agent',inUse:w.current.harness==='hermes',changes:true,skills:w.skills},
   {harness:'claude-code',title:'Claude Code',inUse:false,changes:false,note:'Claude Code keeps these in the skills folder of its home (~/.claude/skills). Change them there.',skills:[{name:'release-notes',description:'Draft release notes.',lastRanAt:null}]}]};
  // "Can read <Service>": the page names only the Agent and the Service; the host decides the targets.
  if(b.action==='agentAccess'&&(b.operation==='grantService'||b.operation==='ungrantService')){w.access=w.access.map(a=>a.id===b.id?{...a,services:a.services.map(s=>s.provider===b.provider?{...s,granted:b.operation==='grantService'}:s)}:a);return {ok:true};}
  if(b.action==='agentAccess'&&(b.operation==='grantAsks'||b.operation==='ungrantAsks')){w.access=w.access.map(a=>a.id===b.id?{...a,asks:{...a.asks,[b.kind]:b.operation==='grantAsks'}}:a);return {ok:true};}
  if(b.action==='agentAccess'&&(b.operation==='grantBoard'||b.operation==='ungrantBoard')){w.access=w.access.map(a=>a.id===b.id?{...a,board:{...a.board,[b.kind]:b.operation==='grantBoard'}}:a);return {ok:true};}
  if(b.action==='agentAccess'&&(b.operation==='grantReports'||b.operation==='ungrantReports')){w.access=w.access.map(a=>a.id===b.id?{...a,reports:{...a.reports,[b.kind]:b.operation==='grantReports'}}:a);return {ok:true};}
  if(b.action==='agentAccess'&&(b.operation==='grantArtifacts'||b.operation==='ungrantArtifacts')){w.access=w.access.map(a=>a.id===b.id?{...a,artifacts:{...a.artifacts,[b.kind]:b.operation==='grantArtifacts'}}:a);return {ok:true};}
  if(b.action==='agentAccess'&&(b.operation==='grantServiceDrafts'||b.operation==='ungrantServiceDrafts')){w.access=w.access.map(a=>a.id===b.id?{...a,serviceDrafts:a.serviceDrafts.map(s=>s.provider===b.provider?{...s,granted:b.operation==='grantServiceDrafts'}:s)}:a);return {ok:true};}
  if(b.action==='agentAccess'&&(b.operation==='grantGithubDrafts'||b.operation==='ungrantGithubDrafts')){w.access=w.access.map(a=>a.id===b.id?{...a,githubDrafts:b.operation==='grantGithubDrafts'}:a);return {ok:true};}
  // "Can update Issues in <repo> without asking": the page sends the Agent, the repository and a choice; Core builds it.
  if(b.action==='agentAccess'&&b.operation==='grantGithubWrites'){if(!/^[\w-]+\/[\w.-]+$/.test(b.repo))throw new Error('Could not allow that. Name the repository as owner/repo.');
   const writes={comment:['issue.comment'],labels:['labels.set'],'comment-labels':['issue.comment','labels.set']}[b.choice];
   w.access=w.access.map(a=>a.id===b.id?{...a,githubWrites:{...a.githubWrites,grants:[...a.githubWrites.grants.filter(g=>g.repo!==b.repo),{repo:b.repo,writes,...b.labelPrefix?{labelPrefix:b.labelPrefix}:{}}]}}:a);return {ok:true};}
  if(b.action==='agentAccess'&&b.operation==='ungrantGithubWrites'){w.access=w.access.map(a=>a.id===b.id?{...a,githubWrites:{...a.githubWrites,grants:a.githubWrites.grants.filter(g=>g.repo!==b.repo)}}:a);return {ok:true};}
  // The GitHub App that writes approved GitHub drafts: the page sends its settings once and never gets them back.
  if(b.action==='githubApp'&&b.operation==='status')return {connected:!!w.githubApp};
  if(b.action==='githubApp'&&b.operation==='connect'){if(b.appId!=='1001')throw new Error('The GitHub App is not valid: enter its App ID, its installation ID and its private key (a .pem file\'s whole text).');w.githubApp=true;return {ok:true,connected:true};}
  if(b.action==='githubApp'&&b.operation==='disconnect'){w.githubApp=false;return {ok:true,connected:false};}
  // Search Console: the service account key goes to the host once, through connect; it never comes back.
  if(b.action==='connect'&&b.provider==='search-console'){if(b.token.includes('refused'))throw new Error('Google did not accept this service account key. Check that it is the whole JSON key of a service account that has not been deleted or disabled, then paste it again.');w.searchConsole=true;return {ok:true,connected:true};}
  if(b.action==='disconnectSource'&&b.provider==='search-console'){w.searchConsole=false;return {ok:true};}
  // HTTP JSON endpoints: connected through `connect` with the token once; listed without it.
  if(b.action==='httpJson'&&b.operation==='list')return {endpoints:w.endpoints??[]};
  if(b.action==='httpJson'&&b.operation==='remove'){w.endpoints=w.endpoints.filter(e=>e.name!==b.name);return {endpoints:w.endpoints};}
  if(b.action==='connect'&&b.provider==='http'){if(!b.settings.url.startsWith('https://'))throw new Error('Use the endpoint\'s base address, starting with https://.');w.endpoints=[...(w.endpoints??[]).filter(e=>e.name!==b.settings.name),{name:b.settings.name,url:b.settings.url,token:!!b.token}];return {ok:true,connected:true};}
  if(b.action==='disconnectSource'&&b.provider==='http'){w.endpoints=[];return {ok:true};}
  if(b.action==='agentAccess'&&b.operation==='revoke'){w.access=w.access.map(a=>a.id===b.id?{...a,services:[],asks:undefined,wake:undefined,board:undefined,githubDrafts:undefined,githubWrites:undefined,serviceDrafts:undefined,reports:undefined,artifacts:undefined,report:undefined,revokedAt:'2026-10-15T08:00:00.000Z',grants:a.grants.map(g=>({...g,revokedAt:'2026-10-15T08:00:00.000Z'}))}:a);return {ok:true};}
  // An Agent for a script: the page sends only the name; the host makes the Agent and its file.
  if(b.action==='agentAccess'&&b.operation==='addScript'){if(!String(b.name||'').trim())throw new Error('Give it a name of one line, at most 60 characters, with a letter or digit in it.');
   const file='/Users/alex/.worldlet/mcp/worldlet-mcp-endpoint.nightly-build.json';
   w.access=[...w.access,{id:'nightly-build',name:b.name,harness:'script',kind:'local',createdAt:'2026-10-15T09:00:00.000Z',grants:[],audit:[],services:[],asks:{ask:false,work:false},board:{read:false,define:false},reports:{report:false,list:false},liveness:'offline',endpointFile:file}];
   return {ok:true,id:'nightly-build',name:b.name,endpointFile:file};}
  // Orders (agent/gate/GRANTS.md#orders-and-waking-an-agent): the page sends the Agent, and a wake command as a list of
  // words; the host checks it (here, as the host does, the program's full path).
  if(b.action==='agentAccess'&&b.operation==='setOrderTarget'){w.orders=b.id?{defaultFor:b.id}:{};return {ok:true};}
  if(b.action==='agentAccess'&&b.operation==='setWake'){if(!Array.isArray(b.command))throw new Error('A wake command is a list of words: the program, then each of its arguments.');
   if(b.command.length&&!b.command[0].startsWith('/'))throw new Error('A wake command starts with the full path of a program, like /usr/local/bin/wake-agent.');
   w.access=w.access.map(a=>a.id===b.id?{...a,wake:[...b.command],audit:[{at:'2026-10-15T08:30:00.000Z',agentId:a.id,target:'asks',action:b.command.length?'set-wake':'clear-wake',decision:'allowed'},...a.audit]}:a);return {ok:true};}
  // Your World's address (agent/gate/WORLD-ADDRESS.md): the page sends a name, a share choice or an ID, nothing else.
  if(b.action==='worldAddress'){
   const a=w.address??={name:'3f9a0c213f9a0c213f9a0c213f9a0c21',reachable:true,remote:true,devices:[{id:'pk1',name:'Chrome on Mac',addedAt:'2026-10-18T12:00:00.000Z'}],visitors:[{id:'v1',name:'Sam',sees:['Board'],seenAt:'2026-10-18T13:00:00.000Z'}],shares:[{id:'share0AAAAAAAAAAAAAAA',title:'Board',open:true,people:0}]};
   const out=()=>({...a,...a.name?{address:'https://'+a.name+'.worldlet.ai',mcp:'https://'+a.name+'.worldlet.ai/mcp'}:{},shares:a.shares.map(s=>({...s,...a.name?{link:'https://'+a.name+'.worldlet.ai/s/'+s.id}:{}}))});
   if(b.operation==='share'){a.shares.push({id:'share'+a.shares.length+'AAAAAAAAAAAAAAA',title:'Board',open:b.open===true,people:0});return out();}
   if(b.operation==='unshare'){a.shares=a.shares.filter(s=>s.id!==b.id);return out();}
   if(b.operation==='remove'){a.devices=a.devices.filter(d=>d.id!==b.id);a.visitors=a.visitors.filter(v=>v.id!==b.id);return out();}
   return out();
  }
  if(b.action==='agentAccess')return {orders:w.orders??{},agents:w.access};
  if(b.action==='harnessApprovalRules'&&b.operation==='revoke'){w.rules=w.rules.filter(r=>r.id!==b.id);return {ok:true};}
  if(b.action==='harnessApprovalRules')return {harnesses:[{harness:'hermes',title:'Hermes Agent',inUse:true,revoke:'restart',note:'Hermes Agent reads these when it starts, so Worldlet restarts its own conversation with it.',rules:w.rules},
   {harness:'claude-code',title:'Claude Code',revoke:null,note:'Claude Code keeps these in its settings.json. Change them with /permissions in Claude Code; rules for one project stay in that project’s .claude folder.',rules:[{id:'rule-00000000000000b1',allows:'pnpm test',agent:'*',kind:'command'}]}]};
  if(b.action==='harnessConnections')return {harnesses:[{harness:'hermes',title:'Hermes Agent',inUse:true,changes:true,connections:[{id:'conn-00000000000000c1',kind:'mcp',name:'github',where:'https://tools.example.com/github/',enabled:true,sign:'token',agent:'default',main:true,removable:true}]},
   {harness:'claude-code',title:'Claude Code',changes:false,note:'Claude Code keeps these in its own settings. Change them in Claude Code itself.',connections:[{id:'conn-00000000000000d1',kind:'mcp',name:'linear',where:'https://tools.linear.example/sse',enabled:true,sign:'none',removable:false}]}]};
  if(b.action==='snapshot')return {workspaceId:'your-agent-fixture',revision:0,sources:[],knowledge:[],worldItems:[],connections:[{provider:'gmail',status:'connected',label:'alex@example.com'},...w.searchConsole?[{provider:'search-console',status:'connected',transport:'hermes',connector:'service'}]:[]],onboarding:{completed:true},sampleEnabled:false,cloudConsent:true};
  if(b.action==='modelStatus')return {available:true,cloudAllowed:true};
  if(b.action==='modelSource')return w.source;
  if(b.action==='modelHealth'&&w.gateway?.active)return {agent:'remote-openclaw',available:true,lastReply:null,location:{kind:'remote',computer:w.gateway.host,direct:true},model:{name:'OpenClaw at '+w.gateway.host,id:'',provider:'remote-openclaw',source:null,ready:true,configured:false}};
  if(b.action==='modelHealth')return w.remote?{agent:'remote',available:true,lastReply:null,location:{kind:'remote',computer:w.remote},model:{name:'Agent on '+w.remote,id:'',provider:'remote',source:null,ready:true,configured:false}}:{agent:'hermes',available:true,lastReply:w.lastReply??null,model:{name:w.source.name,id:'',provider:w.source.provider,source:w.source.localCodex?'local-codex':null,ready:w.source.ready,configured:w.source.source!=='none'}};
  if(b.action==='agentHarness'&&b.operation==='detect')return {agents:[{id:'codex',title:'Codex',configured:true,model:true,worldTools:true},{id:'claude-code',title:'Claude Code',configured:true,model:false,worldTools:true,memory:{name:null,user:false,longTerm:true,model:false}}],recommended:'codex',selected:w.remote||w.gateway?.active?null:w.agentInUse??null,remote:w.remote?{computer:w.remote,seenAt:Date.now()}:null,gateway:w.gateway??null,...w.brokenHermes?{brokenHermes:true}:{}};
  if(b.action==='agentHarness'&&b.operation==='install-hermes'){w.brokenHermes=false;return {ok:true,id:'hermes',title:'Hermes Agent'};}
  // A Gateway on another computer reached directly: the host answers with its address and host, never the token.
  if(b.action==='agentHarness'&&b.operation==='gateway'){if(!b.token&&!w.gateway)throw new Error('Type your Gateway’s address and token.');w.gateway={url:'https://mini.tail1.ts.net',host:'mini.tail1.ts.net',active:true};w.remote=null;return {ok:true,gateway:{host:'mini.tail1.ts.net'}};}
  if(b.action==='agentHarness'&&b.operation==='forget-gateway'){w.gateway=null;return {ok:true};}
  if(b.action==='agentHarness'&&b.operation==='pair'){w.remote='Mac mini';return {ok:true,remote:{computer:'Mac mini'}};}
  if(b.action==='agentHarness'&&b.operation==='select'){w.agentInUse=b.id;return {ok:true,id:b.id};}
  // The provider the Agent in use answers with (agent/gate/model-providers.ts): every one it supports, signed in or not.
  if(b.action==='agentHarness'&&b.operation==='providers')return w.agentInUse?{agent:'hermes',title:'Hermes Agent',chosen:w.provider??null,providers:[
   {id:'chatgpt',name:'ChatGPT',account:'Your ChatGPT plan',signedIn:true,signIn:true},{id:'anthropic',name:'Anthropic',account:'Your Claude plan or Anthropic API key',signedIn:false,signIn:true},
   {id:'opencode-go',name:'OpenCode Go',account:'Your OpenCode Go subscription',signedIn:true,signIn:true}]}:{agent:null,providers:[],chosen:null};
  if(b.action==='agentHarness'&&b.operation==='provider'){w.provider=b.id;return {ok:true,chosen:b.id};}
  if(b.action==='agentHarness'&&b.operation==='clear'){w.agentInUse=null;w.remote=null;if(w.gateway)w.gateway.active=false;return {ok:true};}
  return {ok:true};
 }}}};});
 await page.goto(worldUrl());await waitForWorld(page);
 assert.equal(await page.locator('.world-energy,.world-environment .energy-cell').count(),0,'no battery in the World');
 await page.waitForTimeout(500);assert.doesNotMatch(await page.locator('body').innerText(),/energy|Charge/i,'no energy or charge anywhere');
 await page.locator(SETTINGS_BUTTON).click();
 const settingsPage=page.locator('#companionInfo [data-section=Settings]');await settingsPage.waitFor();
 assert.equal(await settingsPage.locator('[data-setting=agents]').getAttribute('aria-current'),'true','Settings opens on Agents');
 assert.equal(await page.locator('#companionInfo [data-section=Energy]').count(),0,'no Energy page');
 const local=settingsPage.locator('.companion-settings-detail');
 // Your own Agent is first on the list; Manage shows its own page.
 await local.locator('[data-part=access] [data-access-agent]').first().waitFor();
 assert.equal(await local.locator('[data-part=access] [data-access-agent]').first().getAttribute('data-access-agent'),'hermes','your own Agent first');
 await local.locator('[data-access-agent=hermes]').getByRole('button',{name:'Manage',exact:true}).click();
 await local.locator('[data-view=own-agent]').waitFor();
 await local.getByText('Fox’s model is connected',{exact:true}).waitFor();
 assert.equal(await local.locator('details').count(),0,'nothing folded');
 // The Accounts section is part of this page now: Settings lists no section of its own for it.
 assert.equal(await settingsPage.locator('[data-setting=integrations]').count(),0,'no Accounts section');
 const permissions=local.locator('[data-part=permissions]'),mayPart=local.locator('[data-part=may]');
 // Four named parts in the owner's order (2026-10-11, 2026-10-21 and 2026-10-22, issue #674), each a heading and one plain line.
 assert.deepEqual(await local.locator('[data-part]').evaluateAll(parts=>parts.map(p=>(p as HTMLElement).dataset.part)),['model','routines','permissions','may'],'Status, Scheduled, Does without asking, What it may do');
 assert.deepEqual(await local.locator('[data-part] > .companion-settings-parthead').allTextContents(),['Status','Scheduled','Does without asking','What it may do']);
 for(const line of await local.locator('[data-part] > .companion-settings-partnote').allTextContents())assert.ok(line.length>20&&line.length<160&&!line.includes('\n'),'one plain line: '+line);
 assert.equal(await local.locator('[data-part] > .companion-settings-partnote').count(),4,'each part has its line');
 // Memory, in Context: what each Agent remembers, About you first, the first few with Show all; read only.
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('worldlet:companion-info',{detail:{tab:'Settings',setting:'memory'}})));
 await settingsPage.locator('[data-setting=context][aria-current=true]').waitFor();
 const memoryPart=local.locator('[data-part=memory]'),hermesMemory=memoryPart.locator('[data-harness=hermes]');
 await hermesMemory.getByText('About you · 6',{exact:true}).waitFor();
 assert.equal(await hermesMemory.locator('[data-memory=user] [data-entry]').count(),4,'the first few');
 await memoryPart.evaluate(e=>e.scrollIntoView({block:'start'}));
 await page.screenshot({path:process.env.WORLDLET_YOUR_AGENT_MEMORY_SCREEN||'/tmp/your-agent-memory.png'});
 await hermesMemory.getByRole('button',{name:'Show all 6',exact:true}).click();
 await hermesMemory.locator('[data-memory=user] [data-entry]').nth(5).getByText('Prefers short replies.',{exact:true}).waitFor();
 await hermesMemory.getByText('What it remembers · 1',{exact:true}).waitFor();
 assert.doesNotMatch(await hermesMemory.innerText(),/\.hermes|USER\.md/,'no file paths');
 assert.equal(await hermesMemory.getByRole('button',{name:'Ask it to forget',exact:true}).count(),7,'Ask it to forget on each entry of the Agent in use');
 const ccMemory=memoryPart.locator('[data-harness=claude-code]');
 await ccMemory.getByText('Use pnpm, never npm.',{exact:true}).waitFor();
 assert.equal(await ccMemory.getByRole('button',{name:'Ask it to forget'}).count(),0,'another Agent is asked in its own chat');
 await ccMemory.getByText('Worldlet only shows this. To have Claude Code forget something, ask it in its own chat.',{exact:true}).waitFor();
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('worldlet:companion-info',{detail:{tab:'Settings',setting:'model'}})));
 await local.locator('[data-view=own-agent]').waitFor();
 // Claude Code: its rules shown read-only, with where to change them.
 const ccRules=local.locator('[data-part=permissions] [data-harness=claude-code]');
 await ccRules.getByText('pnpm test',{exact:true}).waitFor();
 assert.equal(await ccRules.getByRole('button',{name:'Revoke'}).count(),0,'never revoked from Worldlet');
 await ccRules.getByText(/Change them with \/permissions in Claude Code/).waitFor();
 await local.locator('[data-part=routines]').getByText(/The same tasks are in the Task panel/).waitFor();
 await permissions.getByRole('heading',{name:'Does without asking',exact:true}).waitFor();
 const routinesPart=local.locator('[data-part=routines]');
 // Worldlet's own two default Routines come first: Today's prep at 7 AM and Wrap up today at 6 PM, paused and resumed
 // as Worldlet's own setting (no Agent command, nothing to confirm).
 const prep=routinesPart.locator('[data-harness=worldlet] [data-job="worldlet:plan"]'),wrap=routinesPart.locator('[data-harness=worldlet] [data-job="worldlet:summary"]');
 await prep.getByText(/^Every day at 7:00\sAM · What was done overnight, today’s schedule and reply drafts/).waitFor();
 await wrap.getByText(/^Every day at 6:00\sPM · What is still open and what to prepare for tomorrow, from today’s conversation/).waitFor();
 await routinesPart.getByText('Worldlet runs these by asking your Agent at that time; nothing is added to your Agent’s own scheduler.',{exact:true}).waitFor();
 await wrap.getByRole('button',{name:'Pause',exact:true}).click();
 await routinesPart.getByText('“Wrap up today” is paused.',{exact:true}).waitFor();
 await routinesPart.locator('[data-harness=worldlet] [data-job="worldlet:summary"]').getByText('Paused',{exact:true}).waitFor();
 assert.deepEqual(await page.evaluate(()=>(window as any).calls.filter(c=>c.action==='foxPreferenceChange').map(c=>[c.setting,c.value])),[['daily_routines',{summary:false}]],'only Worldlet’s own setting changes');
 await routinesPart.locator('[data-harness=worldlet] [data-job="worldlet:summary"]').getByRole('button',{name:'Resume',exact:true}).click();
 await routinesPart.getByText('“Wrap up today” runs every day again.',{exact:true}).waitFor();
 assert.equal(await page.evaluate(()=>(window as any).calls.filter(c=>c.action==='harnessSchedule'&&c.operation==='change').length),0,'no Agent command for Worldlet’s own routines');
 // Routines: plain time, where results go, the newest result, Paused; the scheduler's state and how to start it.
 const digest=routinesPart.locator('[data-job=job-1]');
 await digest.getByText(/^Every day at 8:00\sAM · Sends its results to Telegram, and here and on your phone$/).waitFor();
 await digest.getByText(/^Last run Oct 10: done$/).waitFor();
 await routinesPart.locator('[data-job=job-2]').getByText('Paused',{exact:true}).waitFor();
 await routinesPart.locator('[data-job=job-2]').getByText(/^Every 2 hours · /).waitFor();
 await routinesPart.getByText('Hermes Agent’s scheduler is not running, so these do not run now.',{exact:true}).waitFor();
 await routinesPart.locator('[data-action=start-scheduler]').waitFor();
 assert.doesNotMatch(await routinesPart.innerText(),/gateway install|Terminal/,'Start is a button, not a command');
 await digest.getByRole('button',{name:'Pause',exact:true}).click();
 await digest.getByText('Hermes Agent will pause “Morning digest”. It does not run until you resume it.',{exact:true}).waitFor();
 assert.equal(await page.evaluate(()=>(window as any).calls.filter(c=>c.action==='harnessSchedule'&&c.operation==='change').length),0,'Pause asks first');
 await routinesPart.scrollIntoViewIfNeeded();
 await page.screenshot({path:process.env.WORLDLET_YOUR_AGENT_SCREEN||'/tmp/your-agent-routines.png'});
 await digest.locator('[data-action=confirm-change]').click();
 await routinesPart.getByText('“Morning digest” is paused.',{exact:true}).waitFor();
 await routinesPart.locator('[data-job=job-1]').getByText('Paused',{exact:true}).waitFor();
 assert.equal(await page.evaluate(()=>(window as any).routinesHeard),1,'the Task panel’s Routines read again');
 // Cancel changes nothing; Remove says it cannot be undone.
 await routinesPart.locator('[data-job=job-2]').getByRole('button',{name:'Remove',exact:true}).click();
 await routinesPart.locator('[data-job=job-2]').getByText('Hermes Agent will remove “Plant check”. This can’t be undone; ask Fox to set it up again if you need it.',{exact:true}).waitFor();
 await routinesPart.locator('[data-job=job-2]').getByRole('button',{name:'Cancel',exact:true}).click();
 await routinesPart.getByText('Nothing was changed.',{exact:true}).waitFor();
 assert.deepEqual(await page.evaluate(()=>(window as any).calls.filter(c=>['harnessSchedule','harnessSkills'].includes(c.action)&&c.operation==='change').map(c=>c.confirm)),['c|pause|job-1'],'only what the person confirmed ran');
 // Change time and New routine (owner request 2026-10-11: more control): a small form, one more ask, the Agent's own command.
 await routinesPart.locator('[data-job=job-1]').getByRole('button',{name:'Change time',exact:true}).click();
 await routinesPart.locator('[data-job=job-1] [data-form=reschedule] input[type=time]').fill('09:30');
 await routinesPart.locator('[data-job=job-1] [data-action=save-time]').click();
 await routinesPart.locator('[data-job=job-1]').getByText(/^Hermes Agent will run “Morning digest” every day at 9:30\sAM from now on\.$/).waitFor();
 await routinesPart.locator('[data-job=job-1] [data-action=confirm-change]').click();
 await routinesPart.getByText(/^“Morning digest” now runs every day at 9:30\sAM\.$/).waitFor();
 await routinesPart.locator('[data-job=job-1]').getByText(/^Every day at 9:30\sAM · /).waitFor();
 await routinesPart.getByRole('button',{name:'New routine',exact:true}).click();
 const form=routinesPart.locator('[data-form=create]');
 await form.getByLabel('Routine name').fill('Plant water');await form.getByLabel('What it should do').fill('Remind me to water the plants.');
 await form.getByLabel('How often').selectOption('hours');await form.getByLabel('Hours').fill('3');
 await form.getByRole('button',{name:'Create',exact:true}).click();
 await routinesPart.getByText('Hermes Agent will set up “Plant water” and run it every 3 hours.',{exact:true}).waitFor();
 await routinesPart.locator('[data-add=hermes] [data-action=confirm-change]').click();
 await routinesPart.locator('[data-job=job-9]').getByText(/^Every 3 hours · /).waitFor();
 assert.deepEqual(await page.evaluate(()=>(window as any).calls.filter(c=>c.action==='harnessSchedule'&&c.operation==='preview'&&['reschedule','create'].includes(c.change)).map(c=>[c.change,c.schedule??c.job])),
  [['reschedule',{daily:{hour:9,minute:30}}],['create',{name:'Plant water',prompt:'Remind me to water the plants.',schedule:{everyHours:3}}]],'what the person chose is what the Agent is asked');
 assert.doesNotMatch(await routinesPart.innerText(),/\bcron\b|\bMCP\b|config\.yaml/i,'plain words; no commands');
 // The services are in Settings › Services: Google is a tile there (connectors-ui-check.ts covers the tiles).
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('worldlet:companion-info',{detail:{tab:'Settings',setting:'connectors'}})));
 await settingsPage.locator('[data-setting=connectors][aria-current=true]').waitFor();
 const google=settingsPage.locator('[data-connector=google]');
 await google.getByText('Connected as alex@example.com',{exact:true}).waitFor();
 await google.getByRole('button',{name:'Disconnect',exact:true}).waitFor();
 // Nothing asks for a key, an App or an address there (owner request 2026-10-22: no Advanced in Settings).
 assert.equal(await settingsPage.locator('[data-advanced], input[type=password]').count(),0,'no Advanced and no key field in Services');
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('worldlet:companion-info',{detail:{tab:'Settings',setting:'model'}})));
 await settingsPage.locator('[data-setting=agents][aria-current=true]').waitFor();
 await local.locator('[data-view=own-agent]').waitFor();
 const rule=permissions.locator('[data-rule=rule-00000000000000a1]');
 await rule.getByText('npm test',{exact:true}).waitFor();
 await rule.getByText(/^Allowed .*2026, in Fox’s main conversation\.$/).waitFor();
 await permissions.locator('[data-rule=rule-00000000000000a2]').getByText('Use the tool github › search_issues').waitFor();
 // Plain words: tools and things it may do, never MCP, allowlist or cron.
 assert.doesNotMatch(await permissions.innerText(),/\bMCP\b|allowlist|cron/i,'plain words only');
 // Revoke asks once more in the page, says what happens, and only then the Agent forgets it.
 await rule.getByRole('button',{name:'Revoke',exact:true}).click();
 await rule.getByText('Hermes Agent will ask you again before it does this. It takes effect the next time it starts; Worldlet restarts it for you.',{exact:true}).waitFor();
 assert.equal(await page.evaluate(()=>(window as any).calls.filter(c=>c.action==='harnessApprovalRules'&&c.operation==='revoke').length),0,'Revoke asks first');
 await permissions.scrollIntoViewIfNeeded();
 await page.screenshot({path:'/tmp/your-agent-permissions.png'});
 await rule.locator('[data-action=confirm-revoke]').click();
 await rule.waitFor({state:'detached'});
 await permissions.getByText(/^Hermes Agent will ask again before: npm test/).waitFor();
 assert.deepEqual(await page.evaluate(()=>(window as any).calls.filter(c=>c.action==='harnessApprovalRules'&&c.operation==='revoke').map(c=>[c.harness,c.id])),[['hermes','rule-00000000000000a1']]);
 // Agents' list: each Agent with its last use, what it may do in one line, what it last reported, Manage and Remove;
 // nothing folded and no switches on the list (owner request 2026-10-22).
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('worldlet:companion-info',{detail:{tab:'Settings',setting:'access'}})));
 const accessPart=local.locator('[data-part=access]'),hermesAccess=accessPart.locator('[data-access-agent=hermes]');
 await hermesAccess.getByText(/^Hermes Agent/).first().waitFor();
 await hermesAccess.getByText(/^On this computer\. Last used .*2026\.$/).waitFor();
 await hermesAccess.getByText('It may look at and change things in your World, read PostHog, take work, see your board, report its work, read what Agents saved and update Issues in example/app without asking.',{exact:true}).waitFor();
 await hermesAccess.getByText(/^Quiet: Building the installer · Fix the build · reported \d+ min ago\.$/).waitFor();
 assert.equal(await accessPart.locator('details,input,textarea,select').count(),0,'nothing folded and nothing to type');
 assert.doesNotMatch(await accessPart.innerText(),/\bMCP\b|token|endpoint/i,'plain words only');
 // Settings has no Advanced (owner request 2026-10-22): no "Add an Agent for a script", no "Give new work to", no wake command.
 assert.equal(await local.locator('details[data-part=advanced]').count(),0,'no Advanced');
 assert.equal(await local.locator('[data-script-agents],[data-wake],[data-github-writes]').count(),0,'no script Agents, wake commands or standing writes here');
 assert.equal(await local.getByRole('combobox',{name:'Give new work to',exact:true}).count(),0,'no work routing here');
 // Your World's address (agent/gate/WORLD-ADDRESS.md): one card with the address and Copy for Claude or ChatGPT, nothing
 // to choose (owner request 2026-10-22); who can open it is listed only when there is someone, each with its own way to
 // end it; only IDs go to the host.
 const addressRoot=local.locator('[data-part=world-address]'),addressPart=addressRoot.locator('[data-world-address]');
 await addressPart.locator('[data-world-address-link]').getByText('3f9a0c213f9a0c213f9a0c213f9a0c21.worldlet.ai',{exact:true}).waitFor();
 await addressPart.getByRole('button',{name:'Copy for Claude or ChatGPT',exact:true}).click();
 await addressRoot.getByText('Copied. Paste it in Claude or ChatGPT as a connector.',{exact:true}).waitFor();
 assert.deepEqual(await page.evaluate(()=>(window as any).copied),['https://3f9a0c213f9a0c213f9a0c213f9a0c21.worldlet.ai/mcp']);
 for(const gone of ['Choose a name','Give up this name'])assert.equal(await addressPart.getByRole('button',{name:gone,exact:true}).count(),0,gone+' is gone');
 const who=addressPart.locator('[data-world-address-who]');
 await who.getByText(/^Chrome on Mac · your browser · added /).waitFor();
 await who.getByText('Board · shared with anyone with the link',{exact:true}).waitFor();
 await who.getByText(/^Sam · sees Board · last looked /).waitFor();
 await who.locator('.companion-settings-row',{hasText:'Sam'}).getByRole('button',{name:'Remove',exact:true}).click();
 await addressRoot.getByText('Sam can no longer see anything here.',{exact:true}).waitFor();
 await who.getByRole('button',{name:'Sign out',exact:true}).click();
 await addressRoot.getByText('Chrome on Mac is signed out.',{exact:true}).waitFor();
 await who.getByRole('button',{name:'Stop sharing',exact:true}).click();
 await addressRoot.getByText('Board is no longer shared.',{exact:true}).waitFor();
 assert.equal(await addressPart.locator('[data-world-address-who]').count(),0,'nobody left to list');
 assert.deepEqual(await page.evaluate(()=>(window as any).calls.filter(c=>c.action==='worldAddress'&&c.operation!=='status')),
  [{action:'worldAddress',operation:'remove',id:'v1'},{action:'worldAddress',operation:'remove',id:'pk1'},{action:'worldAddress',operation:'unshare',id:'share0AAAAAAAAAAAAAAA'}],'only IDs');
 // What your own Agent may do: switches on its page, each sending only the Agent and which, never targets.
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('worldlet:companion-info',{detail:{tab:'Settings',setting:'model'}})));
 await local.locator('[data-view=own-agent]').waitFor();
 const isOn=async(name:string)=>(await mayPart.getByRole('switch',{name,exact:true}).getAttribute('aria-checked'))==='true';
 const flip=async(name:string,said:string)=>{await mayPart.getByRole('switch',{name,exact:true}).click();await mayPart.getByText(said,{exact:true}).waitFor();};
 await mayPart.getByRole('switch',{name:'Can read GitHub',exact:true}).waitFor();
 assert.equal(await isOn('Can read Search Console'),false);
 assert.deepEqual([await isOn('Can read GitHub'),await isOn('Can read PostHog')],[false,true]);
 await flip('Can read GitHub','Hermes Agent can now read GitHub.');
 await flip('Can read PostHog','Hermes Agent can no longer read PostHog.');
 assert.deepEqual([await isOn('Can read GitHub'),await isOn('Can read PostHog')],[true,false]);
 assert.deepEqual(await page.evaluate(()=>(window as any).calls.filter(c=>c.action==='agentAccess'&&/Service$/.test(c.operation))),
  [{action:'agentAccess',operation:'grantService',id:'hermes',provider:'github'},{action:'agentAccess',operation:'ungrantService',id:'hermes',provider:'posthog'}],'only the Agent and the Service, never targets');
 assert.deepEqual([await isOn('Can ask you'),await isOn('Can take work')],[false,true]);
 await flip('Can ask you','Hermes Agent can now ask you things in Attention.');
 await flip('Can take work','Hermes Agent can no longer take work.');
 assert.deepEqual(await page.evaluate(()=>(window as any).calls.filter(c=>c.action==='agentAccess'&&/Asks$/.test(c.operation))),
  [{action:'agentAccess',operation:'grantAsks',id:'hermes',kind:'ask'},{action:'agentAccess',operation:'ungrantAsks',id:'hermes',kind:'work'}],'only the Agent and which, never targets');
 assert.deepEqual([await isOn('Can see your board'),await isOn('Can set up your board')],[true,false]);
 await flip('Can set up your board','Hermes Agent can now set up your board.');
 await flip('Can see your board','Hermes Agent can no longer see your board.');
 assert.deepEqual(await page.evaluate(()=>(window as any).calls.filter(c=>c.action==='agentAccess'&&/Board$/.test(c.operation))),
  [{action:'agentAccess',operation:'grantBoard',id:'hermes',kind:'define'},{action:'agentAccess',operation:'ungrantBoard',id:'hermes',kind:'read'}],'only the Agent and which, never targets');
 assert.deepEqual([await isOn('Can save to your Journal'),await isOn('Can read Agents\' Journal artifacts')],[false,true]);
 await flip('Can save to your Journal','Hermes Agent can now save to your Journal.');
 await flip('Can read Agents\' Journal artifacts','Hermes Agent can no longer read what other Agents saved to your Journal.');
 assert.deepEqual(await page.evaluate(()=>(window as any).calls.filter(c=>c.action==='agentAccess'&&/Artifacts$/.test(c.operation))),
  [{action:'agentAccess',operation:'grantArtifacts',id:'hermes',kind:'save'},{action:'agentAccess',operation:'ungrantArtifacts',id:'hermes',kind:'read'}],'only the Agent and which, never targets');
 assert.equal(await isOn('Can draft GitHub changes'),false);
 await flip('Can draft GitHub changes','Hermes Agent can now draft GitHub changes for you to approve.');
 assert.deepEqual(await page.evaluate(()=>(window as any).calls.filter(c=>c.action==='agentAccess'&&/GithubDrafts$/.test(c.operation))),
  [{action:'agentAccess',operation:'grantGithubDrafts',id:'hermes'}],'only the Agent, never targets');
 assert.deepEqual([await isOn('Can report its work'),await isOn('Can see other Agents')],[true,false]);
 await flip('Can see other Agents','Hermes Agent can now see what your other Agents are doing.');
 assert.deepEqual(await page.evaluate(()=>(window as any).calls.filter(c=>c.action==='agentAccess'&&/Reports$/.test(c.operation))),
  [{action:'agentAccess',operation:'grantReports',id:'hermes',kind:'list'}],'only the Agent and which, never targets');
 // "Can draft PostHog changes" only for a connected Service; Notion is not connected here, so it has no switch.
 assert.equal(await mayPart.getByRole('switch',{name:'Can draft Notion changes',exact:true}).count(),0);
 assert.equal(await isOn('Can draft PostHog changes'),false);
 await flip('Can draft PostHog changes','Hermes Agent can now draft PostHog changes for you to approve.');
 assert.deepEqual(await page.evaluate(()=>(window as any).calls.filter(c=>c.action==='agentAccess'&&/ServiceDrafts$/.test(c.operation))),
  [{action:'agentAccess',operation:'grantServiceDrafts',id:'hermes',provider:'posthog'}],'only the Agent and the Service, never targets');
 assert.doesNotMatch(await mayPart.innerText(),/\bMCP\b|token|endpoint/i,'plain words only');
 // Remove on the list asks once more, then the Agent can no longer reach the World.
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('worldlet:companion-info',{detail:{tab:'Settings',setting:'access'}})));
 await hermesAccess.locator('[data-action=revoke-agent]').click();
 await hermesAccess.getByText(/^Hermes Agent will no longer reach your World's tools/).waitFor();
 assert.equal(await page.evaluate(()=>(window as any).calls.filter(c=>c.action==='agentAccess'&&c.operation==='revoke').length),0,'Revoke asks first');
 await accessPart.scrollIntoViewIfNeeded();
 await page.screenshot({path:'/tmp/your-agent-access.png'});
 await hermesAccess.locator('[data-action=confirm-revoke-agent]').click();
 await accessPart.getByText('Hermes Agent can no longer reach your World.',{exact:true}).waitFor();
 await hermesAccess.getByText(/^On this computer\. Revoked .*2026\.$/).waitFor();
 assert.equal(await hermesAccess.locator('[data-action=revoke-agent]').count(),0,'nothing left to remove');
 assert.deepEqual(await page.evaluate(()=>(window as any).calls.filter(c=>c.action==='agentAccess'&&c.operation==='revoke').map(c=>c.id)),['hermes']);
 // Revoked, it is no longer your Agent's row on the list: your Agent has a row of its own, with Manage.
 await accessPart.locator('[data-own-agent]').getByRole('button',{name:'Manage',exact:true}).click();
 await local.locator('[data-view=own-agent]').waitFor();
 await local.locator('[data-agent=claude-code]').getByRole('button',{name:'Use',exact:true}).click();
 await page.waitForFunction(()=>(window as any).calls.some(c=>c.action==='localAgent'&&c.operation==='adopt'&&c.id==='claude-code'));
 await local.getByText('Claude Code on this computer answers for Fox.').waitFor();
 await local.locator('[data-agent=codex]').getByRole('button',{name:'Use',exact:true}).click();
 await local.locator('[data-agent=codex]').getByRole('button',{name:'Stop using',exact:true}).waitFor();
 assert.equal(await page.evaluate(()=>(window as any).calls.filter(c=>c.action==='localAgent'&&c.id==='codex').length),0,'Codex is a model: nothing to adopt');
 await page.screenshot({path:'/tmp/your-agent-local.png'});
 await local.locator('[data-agent=codex]').getByRole('button',{name:'Stop using',exact:true}).click();
 await page.waitForFunction(()=>(window as any).calls.some(c=>c.action==='agentHarness'&&c.operation==='clear'));
 await local.locator('[data-agent=codex]').getByRole('button',{name:'Use',exact:true}).waitFor();
 // A Hermes Agent that is here but does not start (left half installed) is not offered to Use: Install again runs the
 // official installer, then chooses it (Windows Beta 4384, 2026-10-13).
 await page.evaluate(()=>{(window as any).brokenHermes=true;});
 await local.getByRole('button',{name:'Check connection',exact:true}).click();
 const broken=local.locator('[data-agent=hermes]');
 await broken.getByText('It is on this computer but does not start. Install again sets it up the official way.',{exact:true}).waitFor();
 assert.equal(await broken.getByRole('button',{name:'Use',exact:true}).count(),0,'not offered to Use');
 await broken.getByRole('button',{name:'Install again',exact:true}).click();
 await broken.waitFor({state:'detached'});
 assert.deepEqual(await page.evaluate(()=>(window as any).calls.filter(c=>c.action==='agentHarness'&&['install-hermes','select'].includes(c.operation)).slice(-2).map(c=>c.operation+(c.id?':'+c.id:''))),['install-hermes','select:hermes']);
 await page.evaluate(()=>{(window as any).agentInUse=null;});
 // An Agent on another computer (platform/web/README.md#another-computers-agent) is paired in Phone: its code pairs,
 // Phone says where Fox runs, and Stop using ends the pairing. Your Agent's page has no Gateway or other ways to connect.
 assert.equal(await local.locator('[data-agent=remote],[data-agent=gateway]').count(),0,'nothing else to connect here');
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('worldlet:companion-info',{detail:{tab:'Settings',setting:'phone'}})));
 const computers=settingsPage.locator('.companion-phone-computers');
 await computers.getByLabel('Code from Worldlet on your other computer').fill('worldlet://agent?v=1&s=AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8&n=Mac+mini');
 await computers.getByRole('button',{name:'Pair',exact:true}).click();
 await computers.getByText(/^Fox uses the Agent on Mac mini\./).waitFor();
 await page.screenshot({path:'/tmp/your-agent-remote.png'});
 await computers.getByRole('button',{name:'Stop using',exact:true}).click();
 await computers.getByRole('button',{name:'Pair',exact:true}).waitFor();
 assert.deepEqual(await page.evaluate(()=>(window as any).calls.filter(c=>c.action==='agentHarness'&&['pair','clear'].includes(c.operation)).map(c=>c.operation)),['clear','pair','clear']);
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('worldlet:companion-info',{detail:{tab:'Settings',setting:'model'}})));
 await local.locator('[data-view=own-agent]').waitFor();
 // The last reply's problem in plain words, with its fix (Kelvin's 2026-10-06 timeouts).
 await page.evaluate(()=>{(window as any).lastReply={ok:false,at:Date.now(),error:'Hermes timed out. You can try again.'};});
 await local.getByRole('button',{name:'Check connection',exact:true}).click();
 await local.getByText('Fox’s last reply did not finish',{exact:true}).waitFor();
 await local.getByText(/took too long to answer/).waitFor();
 await local.getByRole('button',{name:'Restart Fox',exact:true}).waitFor();
 await page.screenshot({path:'/tmp/your-agent-settings-problem.png'});
 await page.evaluate(()=>{(window as any).lastReply=null;});
 // Nothing on this computer charges the world: Fox says so when the panel closes.
 await page.evaluate(()=>{const w=window as any;w.source={source:'none',ready:false,name:'',provider:'openai-codex'};window.dispatchEvent(new Event('worldlet:model-changed'));});
 // No model connected (owner request 2026-10-05): Fox says so once and points to Settings, Model, where one is chosen.
 await page.keyboard.press('Escape');
 await page.getByText('I need an AI Agent to answer. Choose one and sign it in to a provider in Settings, under Agents.').waitFor();
 await page.getByRole('button',{name:'Choose an Agent',exact:true}).click();
 const settings=page.locator('#companionInfo [data-section=Settings]');await settings.waitFor();
 assert.equal(await settings.locator('[data-setting=agents]').getAttribute('aria-current'),'true','Settings opens on your Agent');
 await settings.locator('.companion-settings-detail [data-view=own-agent]').waitFor();
 const model=settings.locator('.companion-settings-detail');
 await model.getByText('No model connected',{exact:true}).waitFor();
 await model.locator('[data-agent=claude-code]').getByText('Answers for Fox on its own sign-in.',{exact:true}).waitFor();
 // Signing in happens in the Agent itself: with no provider list yet, Settings says so.
 assert.equal(await model.getByRole('button',{name:/Sign in to Codex|API key|Change model connection|Check available models/}).count(),0,'no Worldlet-side model setup');
 await model.getByRole('button',{name:'Sign in to a provider',exact:true}).click();
 await model.getByText('Sign in to a provider in your Agent itself, then choose Check connection.',{exact:true}).waitFor();
 await page.screenshot({path:'/tmp/your-agent-settings-model.png'});
 // An Agent on this computer can answer instead; choosing it there switches Fox and says what it runs on.
 await page.evaluate(()=>{(window as any).source={source:'own',ready:true,name:'Claude Code on this computer',provider:'claude-code'};});
 await model.locator('[data-agent=claude-code]').getByRole('button',{name:'Use',exact:true}).click();
 await model.locator('[data-agent=claude-code]').getByRole('button',{name:'Stop using',exact:true}).waitFor();
 await model.getByText('Claude Code on this computer answers for Fox.').waitFor();
 // While it works there is no provider to choose: the Agent answers with its own setting (owner request 2026-10-22).
 assert.equal(await model.locator('[data-provider]').count(),0,'no provider list while it works');
 assert.equal(await model.getByText(/gpt-|claude-|glm-|S\/M\/L/).count(),0,'no model names are shown');
 // Ask it to forget: one tap closes Settings and asks the Agent in Fox's conversation, in plain words.
 const settingsNow=page.locator('#companionInfo [data-section=Settings]');
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('worldlet:companion-info',{detail:{tab:'Settings',setting:'memory'}})));
 const forget=settingsNow.locator('[data-part=memory] [data-harness=hermes] [data-entry]').first();
 await forget.getByRole('button',{name:'Ask it to forget',exact:true}).click();
 await page.waitForFunction(()=>(window as any).asked.length>0);
 assert.deepEqual(await page.evaluate(()=>(window as any).asked),['Please forget this from Hermes Agent’s memory: “Prefers Chinese.”. Use Hermes Agent’s own memory to remove it, then tell me it is gone.']);
 assert.equal(await page.evaluate(()=>(window as any).calls.filter((c:any)=>/forget|memoryWrite|harnessMemory/.test(c.action)&&c.operation&&c.operation!=='list').length),0,'Worldlet never edits the Agent’s memory');
 // pi in use: it has no scheduler, so Routines says so in one line; its memory still shows.
 await page.evaluate(()=>{(window as any).current={harness:'pi',title:'pi'};window.dispatchEvent(new CustomEvent('worldlet:companion-info',{detail:{tab:'Settings',setting:'general'}}));});
 await settingsNow.locator('[data-setting=general][aria-current=true]').waitFor();
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('worldlet:companion-info',{detail:{tab:'Settings',setting:'model'}})));
 await settingsNow.locator('[data-part=routines]').getByText('pi has no routines of its own.',{exact:true}).waitFor();
 await page.evaluate(()=>{(window as any).current={harness:'hermes',title:'Hermes Agent'};});
 // Old entry points that open Accounts land on Connectors.
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('worldlet:companion-info',{detail:{tab:'Settings',setting:'integrations'}})));
 await settings.locator('[data-setting=connectors][aria-current=true]').waitFor();
 await settings.locator('.companion-settings-detail [data-connectors=page]').waitFor();
 await page.screenshot({path:'/tmp/your-agent-accounts.png'});
 assert.deepEqual(errors,[]);
 console.log('PASS Agents: no energy or battery anywhere; the list starts with your own Agent, whose page switches Agents on this computer and shows the last reply\'s problem with its fix, with no provider list while it works; with no model, Fox points to Settings, Model; four named parts (Status, Scheduled, Does without asking, What it may do) with one plain line each, nothing folded; Your data › Memory shows what each Agent remembers, read only, with one-tap Ask it to forget for the Agent in use; Claude Code’s rules read-only with where to change them; pi has no routines; routines change only after a plain-words ask, and a routine change refreshes the Task panel; Does without asking lists the Agent\'s standing rules in plain words and revokes one after asking again; the list of Agents shows each with its last use, what it may do in one line and what it reported, nothing folded, and revokes after asking; What it may do gives or takes back each Grant at once with a switch; the Agent on another computer pairs in Phone; the services are in Services, with no key, App or address to type, where old Accounts entry points land');
}finally{await browser.close();}
