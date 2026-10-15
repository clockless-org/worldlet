// Settings › Agent: what Fox runs on, the Agents on this computer and elsewhere, the provider, and the last reply's
// problem with its fix; then the Agent's own skills and routines (each change its own command, asked once more
// in plain words, the Task panel read again after a schedule change), what it may do without asking (with Revoke, asked
// once more) and, last, the accounts and tools that were the Accounts section, which old entry points now open. There is no energy, charge or battery anywhere (owner request 2026-10-10).
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {pageErrors,worldUrl,waitForWorld,SETTINGS_BUTTON} from './browser-test.ts';
const browser=await chromium.launch({args:['--allow-file-access-from-files']});
try{
 const page=await browser.newPage({viewport:{width:1280,height:850},reducedMotion:'reduce'}),errors=pageErrors(page);
 await page.addInitScript(()=>{const w=window as any;w.calls=[];w.source={source:'own',ready:true,name:'claude-sonnet',provider:'anthropic'};
  // Settings › Agent › Access (core/agent/GRANTS.md): one Agent with its default Grants and newest decisions.
  w.access=[{id:'hermes',name:'Hermes Agent',harness:'hermes',kind:'local',createdAt:'2026-10-01T09:00:00.000Z',lastSeenAt:'2026-10-14T18:30:00.000Z',
   grants:[{id:'hermes-channel-read',agentId:'hermes',targets:['items/query','history/query','companion/recall','meetings/decisions','gmail/draft','gmail/read','google-calendar/read','apple-notes/read','todoist/read','applet:mail/read'],access:'read',duration:'standing',grantedAt:'2026-10-01T09:00:00.000Z'},
    {id:'hermes-channel-link',agentId:'hermes',targets:['world/link'],access:'write',duration:'standing',grantedAt:'2026-10-01T09:00:00.000Z'}],
   audit:[{at:'2026-10-14T18:30:00.000Z',agentId:'hermes',target:'items',action:'update',decision:'denied',reason:'Only reading here.'},{at:'2026-10-14T18:29:00.000Z',agentId:'hermes',target:'items',action:'query',decision:'allowed',grantId:'hermes-channel-read'}],
   services:[{provider:'github',title:'GitHub',granted:false},{provider:'posthog',title:'PostHog',granted:true}],asks:{ask:false,work:true},board:{read:true,define:false}}];
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
  if(b.action==='agentAccess'&&b.operation==='revoke'){w.access=w.access.map(a=>a.id===b.id?{...a,services:[],asks:undefined,board:undefined,revokedAt:'2026-10-15T08:00:00.000Z',grants:a.grants.map(g=>({...g,revokedAt:'2026-10-15T08:00:00.000Z'}))}:a);return {ok:true};}
  if(b.action==='agentAccess')return {agents:w.access};
  if(b.action==='harnessApprovalRules'&&b.operation==='revoke'){w.rules=w.rules.filter(r=>r.id!==b.id);return {ok:true};}
  if(b.action==='harnessApprovalRules')return {harnesses:[{harness:'hermes',title:'Hermes Agent',inUse:true,revoke:'restart',note:'Hermes Agent reads these when it starts, so Worldlet restarts its own conversation with it.',rules:w.rules},
   {harness:'claude-code',title:'Claude Code',revoke:null,note:'Claude Code keeps these in its settings.json. Change them with /permissions in Claude Code; rules for one project stay in that project’s .claude folder.',rules:[{id:'rule-00000000000000b1',allows:'pnpm test',agent:'*',kind:'command'}]}]};
  if(b.action==='harnessConnections')return {harnesses:[{harness:'hermes',title:'Hermes Agent',inUse:true,changes:true,connections:[{id:'conn-00000000000000c1',kind:'mcp',name:'github',where:'https://tools.example.com/github/',enabled:true,sign:'token',agent:'default',main:true,removable:true}]},
   {harness:'claude-code',title:'Claude Code',changes:false,note:'Claude Code keeps these in its own settings. Change them in Claude Code itself.',connections:[{id:'conn-00000000000000d1',kind:'mcp',name:'linear',where:'https://tools.linear.example/sse',enabled:true,sign:'none',removable:false}]}]};
  if(b.action==='snapshot')return {workspaceId:'your-agent-fixture',revision:0,sources:[],knowledge:[],worldItems:[],connections:[{provider:'gmail',status:'connected',label:'alex@example.com'}],onboarding:{completed:true},sampleEnabled:false,cloudConsent:true};
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
  // The provider the Agent in use answers with (core/agent/model-providers.ts): every one it supports, signed in or not.
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
 assert.equal(await settingsPage.locator('[data-setting=model]').getAttribute('aria-current'),'true','Settings opens on Agent');
 assert.equal(await page.locator('#companionInfo [data-section=Energy]').count(),0,'no Energy page');
 const local=settingsPage.locator('.companion-settings-detail');
 await local.getByText('Fox’s model is connected',{exact:true}).waitFor();
 // The Accounts section is part of this page now: Settings lists no section of its own for it.
 assert.equal(await settingsPage.locator('[data-setting=integrations]').count(),0,'no Accounts section');
 const permissions=local.locator('[data-part=permissions]'),accounts=local.locator('[data-part=accounts]');
 // Seven named sections in the owner's order (2026-10-11), each a heading and one plain line.
 assert.deepEqual(await local.locator('[data-part]').evaluateAll(parts=>parts.map(p=>(p as HTMLElement).dataset.part)),['model','memory','skills','routines','permissions','access','accounts'],'Model, Memory, Skills, Routines, Permissions, Access, then Accounts last');
 assert.deepEqual(await local.locator('[data-part] > .companion-settings-parthead').allTextContents(),['Model','Memory','Skills','Scheduled','Permissions','Access','Connections']);
 for(const line of await local.locator('[data-part] > .companion-settings-partnote').allTextContents())assert.ok(line.length>20&&line.length<160&&!line.includes('\n'),'one plain line: '+line);
 assert.equal(await local.locator('[data-part] > .companion-settings-partnote').count(),7,'each section has its line');
 // Memory: what each Agent remembers, About you first, the first few with Show all; read only.
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
 // Claude Code: its skills, rules and tools shown read-only, each with where to change them.
 const ccSkills=local.locator('[data-part=skills] [data-harness=claude-code]');
 await ccSkills.getByText('release-notes').waitFor();
 assert.equal(await ccSkills.getByRole('button').count(),0,'read only');
 await ccSkills.getByText('Claude Code keeps these in the skills folder of its home (~/.claude/skills). Change them there.',{exact:true}).waitFor();
 const ccRules=local.locator('[data-part=permissions] [data-harness=claude-code]');
 await ccRules.getByText('pnpm test',{exact:true}).waitFor();
 assert.equal(await ccRules.getByRole('button',{name:'Revoke'}).count(),0,'never revoked from Worldlet');
 await ccRules.getByText(/Change them with \/permissions in Claude Code/).waitFor();
 const ccTools=local.locator('[data-part=accounts] [data-harness=claude-code]');
 await ccTools.getByText('linear',{exact:true}).waitFor();
 assert.equal(await ccTools.getByRole('button').count(),0,'read only');
 await ccTools.getByText('Claude Code keeps these in its own settings. Change them in Claude Code itself.',{exact:true}).waitFor();
 await local.locator('[data-part=routines]').getByText(/the same Scheduled tasks as in the Task panel/).waitFor();
 await permissions.getByRole('heading',{name:'Permissions',exact:true}).waitFor();
 await accounts.getByRole('heading',{name:'Connections',exact:true}).waitFor();
 // Skills: the Agent's own, with when each last ran and an Off mark; Turn off asks first, then runs its own command.
 const skillsPart=local.locator('[data-part=skills]'),routinesPart=local.locator('[data-part=routines]');
 const seed=skillsPart.locator('[data-skill=seed-swap]');
 await seed.getByText('Ran 3 days ago',{exact:true}).waitFor();
 await skillsPart.locator('[data-skill=k8s]').getByText('Off',{exact:true}).waitFor();
 assert.equal(await seed.getByRole('button',{name:'Remove',exact:true}).count(),0,'no Remove where the Agent has no command for it');
 await seed.getByRole('button',{name:'Turn off',exact:true}).click();
 await seed.getByText('Hermes Agent will stop using “seed-swap” until you turn it on again. It stays in its skills.',{exact:true}).waitFor();
 assert.equal(await page.evaluate(()=>(window as any).calls.filter(c=>c.action==='harnessSkills'&&c.operation==='change').length),0,'Turn off asks first');
 assert.doesNotMatch(await seed.innerText(),/hermes config|skills\.disabled/,'the command itself is never shown');
 await seed.locator('[data-action=confirm-change]').click();
 await skillsPart.getByText('Hermes Agent no longer uses “seed-swap”. It takes effect in its next conversation.',{exact:true}).waitFor();
 await skillsPart.locator('[data-skill=seed-swap]').getByText('Off',{exact:true}).waitFor();
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
 assert.deepEqual(await page.evaluate(()=>(window as any).calls.filter(c=>['harnessSchedule','harnessSkills'].includes(c.action)&&c.operation==='change').map(c=>c.confirm)),['s|disable|seed-swap','c|pause|job-1'],'only what the person confirmed ran');
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
 assert.doesNotMatch(await skillsPart.locator('[data-harness=hermes]').innerText()+'\n'+await routinesPart.innerText(),/\bcron\b|\bMCP\b|config\.yaml/i,'plain words; no commands');
 await accounts.locator('[data-account=gmail]').getByText('alex@example.com',{exact:true}).waitFor();
 await accounts.locator('[data-account=gmail]').getByRole('button',{name:'Disconnect Google',exact:true}).waitFor();
 await accounts.locator('[data-connection=conn-00000000000000c1]').getByText(/^Tool( · |$)/).waitFor();
 const rule=permissions.locator('[data-rule=rule-00000000000000a1]');
 await rule.getByText('npm test',{exact:true}).waitFor();
 await rule.getByText(/^Allowed .*2026, in Fox’s main conversation\.$/).waitFor();
 await permissions.locator('[data-rule=rule-00000000000000a2]').getByText('Use the tool github › search_issues').waitFor();
 // Plain words: tools and things it may do, never MCP, allowlist or cron.
 assert.doesNotMatch(await permissions.innerText()+'\n'+await accounts.innerText(),/\bMCP\b|allowlist|cron/i,'plain words only');
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
 // Access: each Agent with its last use, its Grants in plain words, its newest decisions, and Revoke after asking.
 const accessPart=local.locator('[data-part=access]'),hermesAccess=accessPart.locator('[data-access-agent=hermes]');
 await hermesAccess.getByText('Hermes Agent',{exact:true}).waitFor();
 await hermesAccess.getByText(/^On this computer\. Last used .*2026\.$/).waitFor();
 await hermesAccess.getByText('Read: items, history, companion, meetings, gmail, google-calendar and 2 more.',{exact:true}).waitFor();
 await hermesAccess.getByText('Read and change: world (link).',{exact:true}).waitFor();
 assert.equal(await hermesAccess.locator('.companion-settings-access-audit li').count(),2);
 await hermesAccess.locator('.companion-settings-access-audit li').first().getByText(/items update · Refused$/).waitFor();
 assert.doesNotMatch(await accessPart.innerText(),/\bMCP\b|token|endpoint/i,'plain words only');
 // "Can read <Service>" for each connected Service: on and off at once, the page sending only the Agent and the Service.
 const github=hermesAccess.getByRole('checkbox',{name:'Can read GitHub',exact:true}),posthog=hermesAccess.getByRole('checkbox',{name:'Can read PostHog',exact:true});
 assert.deepEqual([await github.isChecked(),await posthog.isChecked()],[false,true]);
 await github.click();
 await accessPart.getByText('Hermes Agent can now read GitHub.',{exact:true}).waitFor();
 assert.equal(await github.isChecked(),true);
 await posthog.click();
 await accessPart.getByText('Hermes Agent can no longer read PostHog.',{exact:true}).waitFor();
 assert.equal(await posthog.isChecked(),false);
 assert.deepEqual(await page.evaluate(()=>(window as any).calls.filter(c=>c.action==='agentAccess'&&/Service$/.test(c.operation))),
  [{action:'agentAccess',operation:'grantService',id:'hermes',provider:'github'},{action:'agentAccess',operation:'ungrantService',id:'hermes',provider:'posthog'}],'only the Agent and the Service, never targets');
 // "Can ask you" and "Can take work" (Agent asks): the page sends only the Agent and which one, never targets.
 const asking=hermesAccess.getByRole('checkbox',{name:'Can ask you',exact:true}),working=hermesAccess.getByRole('checkbox',{name:'Can take work',exact:true});
 assert.deepEqual([await asking.isChecked(),await working.isChecked()],[false,true]);
 await asking.click();
 await accessPart.getByText('Hermes Agent can now ask you things in Attention.',{exact:true}).waitFor();
 await working.click();
 await accessPart.getByText('Hermes Agent can no longer take work.',{exact:true}).waitFor();
 assert.deepEqual([await asking.isChecked(),await working.isChecked()],[true,false]);
 assert.deepEqual(await page.evaluate(()=>(window as any).calls.filter(c=>c.action==='agentAccess'&&/Asks$/.test(c.operation))),
  [{action:'agentAccess',operation:'grantAsks',id:'hermes',kind:'ask'},{action:'agentAccess',operation:'ungrantAsks',id:'hermes',kind:'work'}],'only the Agent and which, never targets');
 // "Can see your board" and "Can set up your board" (core/board/README.md): the same way.
 const seeing=hermesAccess.getByRole('checkbox',{name:'Can see your board',exact:true}),defining=hermesAccess.getByRole('checkbox',{name:'Can set up your board',exact:true});
 assert.deepEqual([await seeing.isChecked(),await defining.isChecked()],[true,false]);
 await defining.click();
 await accessPart.getByText('Hermes Agent can now set up your board.',{exact:true}).waitFor();
 await seeing.click();
 await accessPart.getByText('Hermes Agent can no longer see your board.',{exact:true}).waitFor();
 assert.deepEqual([await seeing.isChecked(),await defining.isChecked()],[false,true]);
 assert.deepEqual(await page.evaluate(()=>(window as any).calls.filter(c=>c.action==='agentAccess'&&/Board$/.test(c.operation))),
  [{action:'agentAccess',operation:'grantBoard',id:'hermes',kind:'define'},{action:'agentAccess',operation:'ungrantBoard',id:'hermes',kind:'read'}],'only the Agent and which, never targets');
 await hermesAccess.getByRole('button',{name:'Revoke',exact:true}).click();
 await hermesAccess.getByText(/^Hermes Agent will no longer reach your World's tools/).waitFor();
 assert.equal(await page.evaluate(()=>(window as any).calls.filter(c=>c.action==='agentAccess'&&c.operation==='revoke').length),0,'Revoke asks first');
 await accessPart.scrollIntoViewIfNeeded();
 await page.screenshot({path:'/tmp/your-agent-access.png'});
 await hermesAccess.locator('[data-action=confirm-revoke-agent]').click();
 await accessPart.getByText('Hermes Agent can no longer reach your World.',{exact:true}).waitFor();
 await hermesAccess.getByText(/^On this computer\. Revoked .*2026\.$/).waitFor();
 assert.equal(await hermesAccess.getByRole('button',{name:'Revoke'}).count(),0,'nothing left to revoke');
 assert.equal(await hermesAccess.getByRole('checkbox').count(),0,'a revoked Agent has no Service to read');
 assert.deepEqual(await page.evaluate(()=>(window as any).calls.filter(c=>c.action==='agentAccess'&&c.operation==='revoke').map(c=>c.id)),['hermes']);
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
 // An Agent on another computer (core/phone/README.md#another-computers-agent): its code pairs, Settings says where Fox
 // runs, and Stop using ends the pairing.
 // Both are folded under Other ways to connect, few people need them (owner request 2026-10-10).
 await local.getByText('Other ways to connect',{exact:true}).click();
 const remote=local.locator('[data-agent=remote]');
 await remote.getByLabel('Code from Worldlet on your other computer').fill('worldlet://agent?v=1&s=AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8&n=Mac+mini');
 await remote.getByRole('button',{name:'Pair',exact:true}).click();
 await local.getByText('Fox uses your Agent on Mac mini',{exact:true}).waitFor();
 await remote.getByText('Agent on Mac mini · In use').waitFor();
 await page.screenshot({path:'/tmp/your-agent-remote.png'});
 await remote.getByRole('button',{name:'Stop using',exact:true}).click();
 await remote.getByRole('button',{name:'Pair',exact:true}).waitFor();
 assert.deepEqual(await page.evaluate(()=>(window as any).calls.filter(c=>c.action==='agentHarness'&&['pair','clear'].includes(c.operation)).map(c=>c.operation)),['clear','pair','clear']);
 // An OpenClaw Gateway on another computer, reached directly (core/phone/README.md#an-agent-gateway-on-another-computer):
 // its address and token connect, Settings says it is reached directly, Stop using keeps it to Use again without the
 // token, and Forget removes it.
 const gateway=local.locator('[data-agent=gateway]');
 await gateway.getByLabel('Gateway address').fill('https://mini.tail1.ts.net');
 await gateway.getByLabel('Gateway token').fill('claw-secret');
 assert.equal(await gateway.getByLabel('Gateway token').getAttribute('type'),'password','the token is not shown as it is typed');
 await gateway.getByRole('button',{name:'Connect',exact:true}).click();
 await gateway.getByText('OpenClaw at mini.tail1.ts.net · In use').waitFor();
 await local.getByText('Fox uses your Agent on mini.tail1.ts.net',{exact:true}).waitFor();
 await local.getByText(/reached directly at its address/).waitFor();
 await gateway.getByRole('button',{name:'Stop using',exact:true}).click();
 await gateway.getByRole('button',{name:'Use',exact:true}).waitFor();
 assert.equal(await gateway.getByLabel('Gateway address').inputValue(),'https://mini.tail1.ts.net');
 assert.equal(await gateway.getByLabel('Gateway token').inputValue(),'','the saved token never comes back to the page');
 await gateway.getByRole('button',{name:'Use',exact:true}).click();
 await gateway.getByText('OpenClaw at mini.tail1.ts.net · In use').waitFor();
 await gateway.getByRole('button',{name:'Forget',exact:true}).click();
 await gateway.getByRole('button',{name:'Connect',exact:true}).waitFor();
 assert.deepEqual(await page.evaluate(()=>(window as any).calls.filter(c=>c.action==='agentHarness'&&['gateway','clear','forget-gateway'].includes(c.operation)).slice(-4).map(c=>[c.operation,c.token??null])),[['gateway','claw-secret'],['clear',null],['gateway',''],['forget-gateway',null]]);
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
 await page.getByText('I need an AI Agent to answer. Choose one and sign it in to a provider in Settings, under Agent.').waitFor();
 await page.getByRole('button',{name:'Choose an Agent',exact:true}).click();
 const settings=page.locator('#companionInfo [data-section=Settings]');await settings.waitFor();
 assert.equal(await settings.locator('[data-setting=model]').getAttribute('aria-current'),'true','Settings opens on Model');
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
 // Only a provider is chosen, never a model (owner decisions 2026-10-10); one not signed in yet signs in in the Agent.
 await model.locator('[data-provider=own]').getByText('Hermes Agent’s own setting · In use',{exact:true}).waitFor();
 const anthropic=model.locator('[data-provider=anthropic]');
 await anthropic.getByText('Not signed in to it in Hermes Agent yet.',{exact:true}).waitFor();
 assert.equal(await anthropic.getByRole('button',{name:'Use',exact:true}).count(),0,'a provider not signed in cannot be used yet');
 await anthropic.getByRole('button',{name:'Sign in',exact:true}).click();
 await model.getByText('Hermes Agent opens in Terminal to sign in to Anthropic. When it is done, choose Check connection.',{exact:true}).waitFor();
 assert.ok(await page.evaluate(()=>(window as any).calls.some(c=>c.action==='agentHarness'&&c.operation==='provider-sign-in'&&c.id==='anthropic')));
 await model.locator('[data-provider=opencode-go]').getByRole('button',{name:'Use',exact:true}).click();
 await model.locator('[data-provider=opencode-go]').getByText('OpenCode Go · In use',{exact:true}).waitFor();
 await model.getByText('Fox now answers with OpenCode Go.',{exact:true}).waitFor();
 assert.equal(await model.getByText(/gpt-|claude-|glm-|S\/M\/L/).count(),0,'no model names are shown');
 await model.locator('[data-provider=own]').scrollIntoViewIfNeeded();await model.locator('[data-provider=opencode-go]').evaluate(e=>e.scrollIntoView({block:'end'}));
 await page.screenshot({path:'/tmp/your-agent-providers.png'});
 await model.locator('[data-provider=own]').getByRole('button',{name:'Use',exact:true}).click();
 await model.locator('[data-provider=own]').getByText('Hermes Agent’s own setting · In use',{exact:true}).waitFor();
 // Ask it to forget: one tap closes Settings and asks the Agent in Fox's conversation, in plain words.
 const settingsNow=page.locator('#companionInfo [data-section=Settings]');
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('worldlet:companion-info',{detail:{tab:'Settings',setting:'model'}})));
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
 // Old entry points that open Accounts land on Agent, at Accounts.
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('worldlet:companion-info',{detail:{tab:'Settings',setting:'integrations'}})));
 await settings.locator('[data-setting=model][aria-current=true]').waitFor();
 await settings.locator('.companion-settings-detail [data-part=accounts]').waitFor();
 await page.waitForFunction(()=>{const part=document.querySelector('#companionInfo .companion-settings-detail [data-part=accounts]'),pane=document.querySelector('#companionInfo .companion-settings-detail');if(!part||!pane)return false;const a=part.getBoundingClientRect(),b=pane.getBoundingClientRect();return a.top>=b.top-1&&a.top<b.bottom-40&&pane.scrollTop>0;});
 await page.screenshot({path:'/tmp/your-agent-accounts.png'});
 assert.deepEqual(errors,[]);
 console.log('PASS Agent: no energy or battery anywhere; Settings, Model switches Agents and shows the last reply\'s problem with its fix and chooses the Agent\'s provider, signed in or not; with no model, Fox points to Settings, Model; seven named sections (Model, Memory, Skills, Routines, Permissions, Access, Connections) with one plain line each; Memory shows what each Agent remembers, read only, with one-tap Ask it to forget for the Agent in use; Claude Code’s skills, rules and tools read-only with where to change them; pi has no routines; the Agent\'s skills and routines change only after a plain-words ask, and a routine change refreshes the Task panel; Permissions lists the Agent\'s standing rules in plain words and revokes one after asking again; Access lists each Agent with its last use, Grants and newest decisions, gives or takes back each connected Service\'s read Grant at once and revokes it after asking; Accounts is the page\'s last part and old Accounts entry points land on it');
}finally{await browser.close();}
