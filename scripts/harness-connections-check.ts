import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {HARNESS_SERVICES,commandLine,commandReason,commandWords,connectionId,dotenvNames,harnessService,hermesConnectionCommand,hermesConnections,hermesMcpPrefixes,isConnectionId,maskSecrets,
 openClawConnectionCommand,openClawConnections,openClawMcpPrefixes,readConnectionAdd,withLastUse} from '../core/agent/index.ts';
import {harnessConnections,hermesConnectionsService,openClawConnectionsService} from '../platform/electron/src/modules/agent-runtime/harness-connections.ts';
import type {HarnessEnvironment} from '../platform/electron/src/modules/agent-runtime/local-harness.ts';
import {createHarnessConnections} from '../platform/electron/src/modules/fox/harness-connections.ts';
import {AGENT} from '../platform/electron/src/host/services.ts';
import {connectionLine,connectionUseLine,showAgentConnections} from '../ui/companion/agent-connections.ts';
import {withTempDir} from './test-temp.ts';

// The Agent's connections in the World (core/agent/PORTABILITY.md#the-agents-connections-in-the-world): the declared
// `connections` service, Hermes Agent's mcp_servers and chat tokens and OpenClaw's mcp status and channels read without
// a secret, each server's last use matched from its own tool naming, the exact command of each change, the host
// services against fixture `hermes` and `openclaw` commands that behave like their own `mcp add/remove/unset` (their
// files changed only by them), the World's preview-then-confirm and Settings › Integrations.

// Declarations ------------------------------------------------------------------------------------------------------
assert.equal(harnessService('hermes','connections'),'files');assert.equal(harnessService('openclaw','connections'),'native');
assert.deepEqual(Object.keys(HARNESS_SERVICES).filter(id=>harnessService(id,'connections')).sort(),['hermes','openclaw'],'only Agents whose connections Worldlet can read declare them');

// Never a secret ----------------------------------------------------------------------------------------------------
assert.equal(maskSecrets('https://user:pw@mcp.example.com/mcp?api_key=abc123&x=1'),'https://•••@mcp.example.com/mcp?api_key=•••&x=•••');
assert.equal(maskSecrets('npx -y @modelcontextprotocol/server-filesystem /Users/kelvin/Documents'),'npx -y @modelcontextprotocol/server-filesystem /Users/kelvin/Documents','an ordinary command stays readable');
assert.equal(maskSecrets('server --token ghp_abcdefghijklmnop1234 GITHUB_TOKEN=xyz Authorization: Bearer sk-live'),'server --token ••• GITHUB_TOKEN=••• Authorization: Bearer •••');
assert.equal(maskSecrets('run a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8'),'run a1b2•••');
assert.deepEqual(dotenvNames('TELEGRAM_BOT_TOKEN=123:abc\nexport DISCORD_BOT_TOKEN="x"\nEMPTY=\n# NOTE=1\nSLACK_BOT_TOKEN=""\n'),['TELEGRAM_BOT_TOKEN','DISCORD_BOT_TOKEN'],'names with a value, never the values');

// Hermes Agent's mcp_servers and chat accounts ---------------------------------------------------------------------
const yaml=`model:\n  default: x\nmcp_servers:\n  github:\n    url: https://api.githubcopilot.com/mcp/\n    headers:\n      Authorization: Bearer \${MCP_GITHUB_API_KEY}\n  files:\n    command: npx\n    args:\n      - -y\n      - "@modelcontextprotocol/server-filesystem"\n    enabled: false\n  notion:\n    url: https://mcp.notion.com/mcp\n    auth: oauth\n  linear-app:\n    command: node\n    args: [server.js]\n    env:\n      LINEAR_API_KEY: lin_api_0123456789abcdef\nother: 1\n`;
const hermes=hermesConnections(yaml,['TELEGRAM_BOT_TOKEN','OPENROUTER_API_KEY'],'default',{main:true});
assert.deepEqual(hermes.map(c=>[c.kind,c.name,c.where,c.enabled,c.sign]),[['mcp','github','https://api.githubcopilot.com/mcp/',true,'token'],['mcp','files','npx -y @modelcontextprotocol/server-filesystem',false,'none'],
 ['mcp','notion','https://mcp.notion.com/mcp',true,'oauth'],['mcp','linear-app','node server.js',true,'token'],['account','Telegram','telegram',true,'token']],'a disabled server too; a model key is not a connection');
assert.ok(!JSON.stringify(hermes).includes('lin_api')&&!JSON.stringify(hermes).includes('MCP_GITHUB_API_KEY'),'no value or token name of a header or env is listed');
assert.ok(hermes.every(c=>isConnectionId(c.id)));assert.notEqual(connectionId('hermes','mcp','work','github'),hermes[0].id,'another profile\'s server is another connection');
assert.deepEqual(hermesMcpPrefixes('linear-app'),['mcp__linear_app__','mcp_linear_app_']);
// OpenClaw's mcp status and channels -----------------------------------------------------------------------------
const status={path:'~/.openclaw/openclaw.json',servers:[{name:'docs',enabled:true,transport:'streamable-http',launch:'streamable-http https://mcp.example.com/mcp',auth:'oauth',authStatus:{state:'authorized'}},
 {name:'cal',enabled:true,transport:'streamable-http',launch:'streamable-http https://cal.example.com',auth:'oauth',authStatus:{state:'requires-authorization'}},{name:'memory',enabled:false,transport:'stdio',launch:'stdio npx -y @modelcontextprotocol/server-memory'}]};
const channels={chat:{telegram:{accounts:['default','work'],label:'Telegram',installed:true,origin:'configured'},discord:{accounts:[],label:'Discord',origin:'available'}}};
const claw=openClawConnections(status,channels);
assert.deepEqual(claw.map(c=>[c.kind,c.name,c.where,c.enabled,c.sign??null]),[['mcp','docs','https://mcp.example.com/mcp',true,'oauth'],['mcp','cal','https://cal.example.com',true,'needs-sign-in'],['mcp','memory','npx -y @modelcontextprotocol/server-memory',false,'none'],
 ['account','Telegram','telegram',true,null],['account','Telegram · work','telegram',true,null]],'a channel with no account is not a connection');
assert.deepEqual(openClawMcpPrefixes('my docs'),['my-docs__']);assert.deepEqual(openClawMcpPrefixes('2fa'),['mcp-2fa__']);

// What each was last used for --------------------------------------------------------------------------------------
{
 const used=withLastUse(hermes,[{tool:'mcp__github__search_issues',at:100,thread:'Discord · dev'},{tool:'mcp__github__get_pr',at:300,thread:'Trip'},{tool:'mcp_linear_app_list',at:50},{tool:'terminal',at:999},{channel:'telegram',at:400,thread:'Telegram · Kelvin'},{tool:'mcp__github__x',at:0}],hermesMcpPrefixes);
 assert.deepEqual(used.map(c=>c.lastUsed??null),[{at:300,tool:'get_pr',thread:'Trip'},null,null,{at:50,tool:'list'},{at:400,thread:'Telegram · Kelvin'}],'newest call, by its own naming (the older one too); other tools and empty times are not a use');
 const clawUsed=withLastUse(claw,[{tool:'docs__read_page',at:7,thread:'#dev'},{tool:'DOCS__search',at:9}],openClawMcpPrefixes);
 assert.deepEqual(clawUsed[0].lastUsed,{at:9,tool:'search'});
}

// Changes ---------------------------------------------------------------------------------------------------------
assert.deepEqual(commandWords(`npx -y "@scope/server one" ''`),['npx','-y','@scope/server one','']);assert.throws(()=>commandWords('npx "x'),/quote/);
assert.deepEqual(readConnectionAdd({name:'docs',url:' https://mcp.example.com/mcp '}),{name:'docs',url:'https://mcp.example.com/mcp'});
assert.deepEqual(readConnectionAdd({name:'memory',command:'npx -y @modelcontextprotocol/server-memory'}),{name:'memory',command:'npx',args:['-y','@modelcontextprotocol/server-memory']});
for(const bad of [{name:'x y',url:'https://a'},{name:'docs',url:'ftp://a'},{name:'docs',url:'https://a.com/mcp?token=abc'},{name:'docs',url:'https://u:p@a.com'},{name:'gh',command:'server --token ghp_abcdefghijklmnop1234'},{name:'gh',command:'  '},{name:'gh'}])
 assert.throws(()=>readConnectionAdd(bad),undefined,JSON.stringify(bad)+' is refused');
assert.deepEqual(hermesConnectionCommand({add:{name:'docs',url:'https://a'}}),{args:['mcp','add','docs','--url','https://a'],stdin:'n\n\n\n'},'no sign-in, then every tool');
assert.deepEqual(hermesConnectionCommand({add:{name:'m',command:'npx',args:['-y','pkg']}}).args,['mcp','add','m','--command','npx','--args','-y','pkg']);
assert.deepEqual(hermesConnectionCommand({remove:'conn-0'},'m'),{args:['mcp','remove','m'],stdin:'y\n'});
assert.deepEqual(openClawConnectionCommand({add:{name:'m',command:'npx',args:['-y','pkg']}}).args,['mcp','add','m','--command','npx','--arg','-y','--arg','pkg']);
assert.deepEqual(openClawConnectionCommand({add:{name:'d',url:'https://a'}}).args,['mcp','add','d','--url','https://a','--transport','streamable-http']);
assert.deepEqual(openClawConnectionCommand({remove:'conn-0'},'d').args,['mcp','unset','d']);
assert.equal(commandLine('hermes',['mcp','add','x','--args','a b']),'hermes mcp add x --args "a b"');
assert.equal(commandReason('\u001b[32m  Connecting\u001b[0m\n  ✗ Failed to connect: 401 for token=abc\n  Fix the issue\n'),'Failed to connect: 401 for token=•••');

// Hosts: fixture `hermes` and `openclaw` commands ------------------------------------------------------------------
if(process.platform==='win32'){console.log('SKIP connection fixtures on Windows (shell fixtures); shared rules PASS');process.exit(0);}
class Node {
 children:Node[]=[];className='';type='';disabled=false;dataset:Record<string,string>={};attributes:Record<string,string>={};onclick:any=null;isConnected=true;value='';placeholder='';spellcheck=false;autocomplete='';private own='';
 get textContent():string {return this.own+this.children.map(c=>c.textContent).join('');}
 set textContent(value:string){this.own=String(value);this.children=[];}
 append(...nodes:Node[]){this.children.push(...nodes);}replaceChildren(...nodes:Node[]){this.children=nodes;this.own='';}remove(){this.isConnected=false;}
 setAttribute(name:string,value:string){this.attributes[name]=value;}
 all(test:(n:Node)=>boolean):Node[] {return [...(test(this)?[this]:[]),...this.children.filter(c=>c.isConnected).flatMap(c=>c.all(test))];}
}
await withTempDir('worldlet-connections-',async temp=>{
 const scratch=fs.realpathSync(temp),home=path.join(scratch,'home'),bin=path.join(scratch,'bin');fs.mkdirSync(bin,{recursive:true});
 const script=(name:string,source:string)=>{const file=path.join(scratch,name+'.cjs');fs.writeFileSync(file,source);fs.writeFileSync(path.join(bin,name),`#!/bin/sh\nexec "${process.execPath}" "${file}" "$@"\n`);fs.chmodSync(path.join(bin,name),0o755);return path.join(bin,name);};
 const calls=path.join(scratch,'calls.jsonl'),called=()=>fs.existsSync(calls)?fs.readFileSync(calls,'utf8').trim().split('\n').map(l=>JSON.parse(l)):[];
 // Hermes Agent: `mcp add` asks (sign-in? then, after connecting, enable all tools?) and `mcp remove` asks to confirm,
 // reading answers from stdin and always exiting 0, as hermes_cli/mcp_config.py does; its own writes keep config.yaml.
 const hermesHome=path.join(home,'.hermes'),work=path.join(hermesHome,'profiles','work');fs.mkdirSync(work,{recursive:true});
 fs.writeFileSync(path.join(hermesHome,'config.yaml'),yaml);fs.writeFileSync(path.join(hermesHome,'.env'),'TELEGRAM_BOT_TOKEN=123:secret\nMCP_GITHUB_API_KEY=ghp_abcdefghijklmnop1234\n');
 fs.writeFileSync(path.join(work,'config.yaml'),'mcp_servers:\n  jira:\n    url: https://jira.example.com/mcp\n');
 const db=new DatabaseSync(path.join(hermesHome,'state.db'));
 db.exec(`CREATE TABLE sessions(id TEXT PRIMARY KEY,source TEXT NOT NULL,display_name TEXT,parent_session_id TEXT,started_at REAL NOT NULL,title TEXT);
  CREATE TABLE messages(id INTEGER PRIMARY KEY AUTOINCREMENT,session_id TEXT NOT NULL,role TEXT NOT NULL,content TEXT,tool_call_id TEXT,tool_calls TEXT,tool_name TEXT,timestamp REAL NOT NULL);`);
 db.prepare('INSERT INTO sessions VALUES(?,?,?,?,?,?)').run('d1','discord','#dev',null,1759900000,'Release notes');db.prepare('INSERT INTO sessions VALUES(?,?,?,?,?,?)').run('t1','telegram','Kelvin',null,1759910000,null);
 const row=db.prepare('INSERT INTO messages(session_id,role,content,tool_name,timestamp) VALUES(?,?,?,?,?)');
 row.run('d1','tool','{"items":[]}','mcp__github__search_issues',1759900100);row.run('d1','tool','{}','terminal',1759900200);row.run('t1','user','hi',null,1759910000);
 db.close();
 const hermesCommand=script('hermes',String.raw`const fs=require('fs'),path=require('path');
const args=process.argv.slice(2),file=path.join(process.env.HERMES_HOME,'config.yaml');
const answers=fs.readFileSync(0,'utf8').split('\n');let at=0;const ask=q=>{process.stdout.write('  '+q+' ');return (answers[at++]??'').trim().toLowerCase();};
fs.appendFileSync(${JSON.stringify(calls)},JSON.stringify({hermes:args,home:process.env.HERMES_HOME})+'\n');
const text=fs.readFileSync(file,'utf8'),start=text.indexOf('mcp_servers:\n');
let block='',rest=text;if(start>=0){const after=text.slice(start+13),end=after.search(/^\S/m);block=end<0?after:after.slice(0,end);rest=text.slice(0,start)+(end<0?'':after.slice(end));}
const entries=block.split(/^(?=  \S)/m).filter(Boolean),names=entries.map(e=>e.trim().split(':')[0]);
const save=list=>fs.writeFileSync(file,rest+(list.length?'mcp_servers:\n'+list.join(''):''));
if(args[0]==='mcp'&&args[1]==='add'){
 const name=args[2],url=args.includes('--url')?args[args.indexOf('--url')+1]:null,command=args.includes('--command')?args[args.indexOf('--command')+1]:null,rest=args.includes('--args')?args.slice(args.indexOf('--args')+1):[];
 if(url&&!['n','no'].includes(ask('Does this server require authentication? [Y/n]:')))return console.log('  API key / Bearer token:');
 if((url||command).includes('down')){console.log('  \u001b[31m✗ Failed to connect: Connection refused\u001b[0m');if(['y','yes'].includes(ask('Save config anyway (you can test later)? [y/N]:')))save([...entries,'  '+name+':\n    enabled: false\n']);return;}
 if(['n','no'].includes(ask('Enable all 3 tools? [Y/n/select]:')))return console.log('  Cancelled — server not saved.');
 save([...entries,'  '+name+':\n'+(url?'    url: '+url+'\n':'    command: '+command+'\n'+(rest.length?'    args:\n'+rest.map(a=>'      - "'+a+'"\n').join(''):''))+'    enabled: true\n']);
 console.log('  ✓ Saved');
}else if(args[0]==='mcp'&&args[1]==='remove'){
 const i=names.indexOf(args[2]);if(i<0)return console.log('  ✗ Server not found in config.');
 if(['n','no'].includes(ask('Remove server? [Y/n]:')))return console.log('  Cancelled.');
 save(entries.filter((_,j)=>j!==i));console.log('  ✓ Removed');
}else process.exit(2);
`);
 const env:HarnessEnvironment={platform:'linux',env:{PATH:'/usr/bin:/bin',HOME:home},home,systemDirectories:[]};
 const hermesInstall={id:'hermes' as const,title:'Hermes Agent',command:hermesCommand,prefix:[],configured:true};
 const service=hermesConnectionsService(hermesInstall,env);
 const listed=await service.list();
 assert.deepEqual(listed.map(c=>[c.agent,c.name,c.lastUsed?.tool??null,c.lastUsed?.thread??null]),[['default','github','search_issues','Discord · Release notes'],['default','files',null,null],['default','notion',null,null],['default','linear-app',null,null],['default','Telegram',null,'Telegram · Kelvin'],['work','jira',null,null]],
  'every profile; last uses from its state.db tool rows and sessions');
 assert.equal(listed[0].lastUsed!.at,1759900100_000);
 assert.ok(!JSON.stringify(listed).includes('secret')&&!JSON.stringify(listed).includes('ghp_'),'no .env value is ever listed');
 assert.equal(called().length,0,'listing only reads');
 const memory={add:{name:'memory',command:'npx',args:['-y','@modelcontextprotocol/server-memory']}};
 assert.equal(await service.preview!(memory),'hermes mcp add memory --command npx --args -y @modelcontextprotocol/server-memory');
 assert.equal(called().length,0,'a preview runs nothing');
 await service.change!(memory);
 assert.deepEqual(called().at(-1),{hermes:['mcp','add','memory','--command','npx','--args','-y','@modelcontextprotocol/server-memory'],home:fs.realpathSync(hermesHome)},'its own add, in the main home');
 assert.ok((await service.list()).some(c=>c.name==='memory'&&c.enabled));
 await service.change!({add:{name:'docs',url:'https://docs.example.com/mcp'}});
 assert.equal((await service.list()).find(c=>c.name==='docs')?.where,'https://docs.example.com/mcp','an address, with no sign-in answered');
 await assert.rejects(service.change!({add:{name:'broken',url:'https://down.example.com/mcp'}}),/Hermes Agent did not add it: Failed to connect: Connection refused/,'one it cannot connect to is not saved, and it says why');
 assert.ok(!(await service.list()).some(c=>c.name==='broken'));
 await assert.rejects(service.preview!({add:{name:'github',url:'https://x.example.com'}}),/already has a server named github/);
 const jira=(await service.list()).find(c=>c.name==='jira')!;
 assert.equal(await service.preview!({remove:jira.id}),'hermes mcp remove jira (in its “work” profile)');
 await service.change!({remove:jira.id});
 assert.deepEqual(called().at(-1),{hermes:['mcp','remove','jira'],home:fs.realpathSync(work)},'removed in that profile\'s home');
 assert.ok(!(await service.list()).some(c=>c.name==='jira'));
 await assert.rejects(service.change!({remove:jira.id}),/no longer has this server/);
 assert.ok(harnessConnections(hermesInstall,env));assert.equal(harnessConnections({...hermesInstall,id:'codex'},env),null,'a Harness that declares none has none');

 // OpenClaw: `mcp status --json`, `channels list --json`, `mcp add` (connects first, exits 1 when it cannot or the name
 // is taken) and `mcp unset`, its own store; tool results in its per-agent transcripts.
 const store=path.join(scratch,'claw-mcp.json');fs.writeFileSync(store,JSON.stringify({docs:{url:'https://mcp.example.com/mcp',transport:'streamable-http',auth:'oauth'}}));
 const clawCommand=script('openclaw',String.raw`const fs=require('fs');const args=process.argv.slice(2),store=${JSON.stringify(store)};
fs.appendFileSync(${JSON.stringify(calls)},JSON.stringify({openclaw:args})+'\n');
const servers=JSON.parse(fs.readFileSync(store,'utf8')),fail=m=>{console.error(m);process.exit(1);};
const value=flag=>args.includes(flag)?args[args.indexOf(flag)+1]:undefined;
if(args.join(' ')==='mcp status --json'){console.log('[plugins] loaded');console.log(JSON.stringify({path:'~/.openclaw/openclaw.json',servers:Object.entries(servers).map(([name,s])=>({name,configured:true,enabled:s.enabled!==false,transport:s.url?'streamable-http':'stdio',launch:s.url?'streamable-http '+s.url:'stdio '+[s.command,...(s.args||[])].join(' '),...s.auth?{auth:s.auth,authStatus:{state:'authorized'}}:{}}))}));}
else if(args.join(' ')==='channels list --json')console.log(JSON.stringify({chat:{discord:{accounts:['default'],label:'Discord',installed:true,origin:'configured'}}}));
else if(args[0]==='mcp'&&args[1]==='add'){
 const name=args[2];if(servers[name])fail('MCP server "'+name+'" already exists.');
 const url=value('--url'),command=value('--command'),list=[];args.forEach((a,i)=>{if(a==='--arg')list.push(args[i+1]);});
 if((url||command).includes('down'))fail('MCP probe failed for "'+name+'": connect ECONNREFUSED');
 servers[name]=url?{url,transport:value('--transport')}:{command,args:list};fs.writeFileSync(store,JSON.stringify(servers));console.log('Saved MCP server "'+name+'".');
}else if(args[0]==='mcp'&&args[1]==='unset'){if(!servers[args[2]])fail('Unknown MCP server');delete servers[args[2]];fs.writeFileSync(store,JSON.stringify(servers));}
else process.exit(2);
`);
 fs.mkdirSync(path.join(home,'.openclaw','agents','main','agent'),{recursive:true});fs.writeFileSync(path.join(home,'.openclaw','openclaw.json'),'{agents: {entries: {main: {default: true}}}}');
 const clawDb=new DatabaseSync(path.join(home,'.openclaw','agents','main','agent','openclaw-agent.sqlite'));
 clawDb.exec(`CREATE TABLE session_nodes(session_key TEXT PRIMARY KEY,current_session_id TEXT,entry_json TEXT,label TEXT,display_name TEXT,created_via TEXT,updated_at INTEGER);
  CREATE TABLE transcript_events(session_id TEXT,seq INTEGER,event_json TEXT,created_at INTEGER,event_zstd BLOB,PRIMARY KEY(session_id,seq));`);
 clawDb.prepare('INSERT INTO session_nodes VALUES(?,?,?,?,?,?,0)').run('agent:main:discord:channel:555','s1',JSON.stringify({subject:'#diet-and-health',channel:'discord'}),null,null,'channel');
 const ev=clawDb.prepare('INSERT INTO transcript_events VALUES(?,?,?,?,NULL)');
 ev.run('s1',1,JSON.stringify({type:'message',timestamp:'2026-10-08T10:00:00Z',message:{role:'user',content:[{type:'text',text:'What is new in the docs?'}]}}),0);
 ev.run('s1',2,JSON.stringify({type:'message',timestamp:'2026-10-08T10:00:05Z',message:{role:'toolResult',toolCallId:'c1',toolName:'docs__search',content:[{type:'text',text:'secret result'}]}}),0);
 clawDb.close();
 const clawInstall={id:'openclaw' as const,title:'OpenClaw',command:clawCommand,prefix:[],configured:true};
 const clawService=openClawConnectionsService(clawInstall,env);
 const clawListed=await clawService.list();
 assert.deepEqual(clawListed.map(c=>[c.kind,c.name,c.sign??null,c.lastUsed?.tool??null,c.lastUsed?.thread??null]),[['mcp','docs','oauth','search','Discord · #diet-and-health'],['account','Discord',null,null,'Discord · #diet-and-health']],'its servers and accounts, each with its last use');
 assert.equal(clawListed[0].lastUsed!.at,Date.parse('2026-10-08T10:00:05Z'));
 assert.ok(!JSON.stringify(clawListed).includes('secret result'),'what a tool returned is never kept');
 assert.equal(await clawService.preview!(memory),'openclaw mcp add memory --command npx --arg -y --arg @modelcontextprotocol/server-memory');
 await clawService.change!(memory);
 assert.deepEqual(JSON.parse(fs.readFileSync(store,'utf8')).memory,{command:'npx',args:['-y','@modelcontextprotocol/server-memory']},'saved by its own add');
 await assert.rejects(clawService.change!({add:{name:'broken',url:'https://down.example.com'}}),/OpenClaw did not add it: MCP probe failed for "broken": connect ECONNREFUSED/);
 const docs=(await clawService.list()).find(c=>c.name==='docs')!;
 await clawService.change!({remove:docs.id});
 assert.ok(called().some(c=>c.openclaw?.join(' ')==='mcp unset docs'),'removed with its own unset');
 assert.deepEqual(Object.keys(JSON.parse(fs.readFileSync(store,'utf8'))),['memory']);
 await assert.rejects(clawService.preview!({remove:docs.id}),/no longer has this server/);

 // The World: a change runs only with the confirmation its preview gave, once; never in the practice world.
 const changes:any[]=[];
 const agentService:any={harness:{id:'hermes',title:'Hermes Agent'},harnessConnections:()=>[{harness:'hermes',title:'Hermes Agent',connections:{list:()=>service.list(),preview:(c:any)=>service.preview!(c),change:async(c:any)=>{changes.push(c);await service.change!(c);}}},
  {harness:'openclaw',title:'OpenClaw',connections:{list:async()=>{throw Error('OpenClaw did not list its MCP servers: not set up');}}}]};
 const host:any={store:{writable:true,sampleEnabled:()=>false},optional:(name:string)=>name===AGENT?agentService:undefined};
 const world=createHarnessConnections(host);
 const shown:any=await world.list();
 assert.deepEqual(shown.harnesses.map((h:any)=>[h.harness,h.changes,h.inUse,h.connections.length,h.error??null]),[['hermes',true,true,7,null],['openclaw',false,false,0,'OpenClaw did not list its MCP servers: not set up']],'one Agent failing to list does not hide the others');
 await assert.rejects(world.change('made-up'),/Confirm the change again/);
 const asked:any=await world.preview('hermes',{add:{name:'fetch',command:'uvx mcp-server-fetch'}});
 assert.equal(asked.command,'hermes mcp add fetch --command uvx --args mcp-server-fetch');assert.equal(changes.length,0,'nothing runs before the person confirms');
 assert.deepEqual(await world.change(asked.confirm),{ok:true,command:asked.command});
 assert.deepEqual(changes,[{add:{name:'fetch',command:'uvx',args:['mcp-server-fetch']}}],'exactly what was previewed');
 await assert.rejects(world.change(asked.confirm),/Confirm the change again/,'a confirmation runs once');
 await assert.rejects(world.preview('hermes',{add:{name:'gh',url:'https://a.com/mcp?token=abc'}}),/Leave tokens out/);
 await assert.rejects(world.preview('openclaw',{remove:docs.id}),/can be changed only in OpenClaw itself/);
 await assert.rejects(world.preview('hermes',{remove:'not-an-id'}),/no longer there/);
 host.store.sampleEnabled=()=>true;await assert.rejects(world.preview('hermes',{remove:docs.id}),/your own world/);host.store.sampleEnabled=()=>false;

 // Settings › Integrations: a row per connection with its last use; Remove and Add each show the command and run it on Confirm.
 (globalThis as any).document={createElement:()=>new Node()};
 const requests:any[]=[];
 let answer:any={harnesses:[{harness:'hermes',title:'Hermes Agent',inUse:true,changes:true,connections:[{id:listed[0].id,kind:'mcp',name:'github',where:'https://api.githubcopilot.com/mcp/',enabled:true,sign:'token',agent:'default',main:true,removable:true,lastUsed:{at:Date.UTC(2026,9,8,12),tool:'search_issues',thread:'Discord · Release notes'}},
  {id:listed[4].id,kind:'account',name:'Telegram',where:'telegram',enabled:true,sign:'token',agent:'default',main:true}]},{harness:'other',title:'Other Agent',changes:false,connections:[{id:'conn-0000000000000000',kind:'mcp',name:'x',where:'y',enabled:false,removable:true}]}]};
 const call=async(action:string,args:any)=>{requests.push([action,args]);if(args.operation==='preview')return {command:args.remove?'hermes mcp remove github':'hermes mcp add fetch --url https://f.example.com',confirm:'c-1'};
  if(args.operation==='change'){answer={harnesses:[{...answer.harnesses[0],connections:answer.harnesses[0].connections.slice(1)}]};return {ok:true};}return answer;};
 const target=new Node();
 await showAgentConnections(target as any,call,()=>true);
 const rows=target.all(n=>!!n.dataset.connection);
 assert.deepEqual(rows.map(r=>r.dataset.connection),[listed[0].id,listed[4].id,'conn-0000000000000000']);
 assert.match(rows[0].textContent,/github.*MCP server · https:\/\/api\.githubcopilot\.com\/mcp\/ · uses a token kept in your Agent.*Last used .*2026 for search_issues in “Discord · Release notes”\./);
 assert.match(rows[1].textContent,/Chat account · uses a token kept in your Agent/);assert.equal(rows[1].all(n=>n.dataset.action==='remove-connection').length,0,'an account is listed, not removed');
 assert.equal(rows[2].all(n=>n.dataset.action==='remove-connection').length,0,'no Remove where the Agent cannot be changed from here');
 assert.match(target.textContent,/Change these in Other Agent itself\./);
 await rows[0].all(n=>n.dataset.action==='remove-connection')[0].onclick();
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(requests.filter(([,a])=>a.operation==='change').length,0,'Remove only shows the command');
 assert.match(rows[0].textContent,/Hermes Agent will run:hermes mcp remove github/);
 rows[0].all(n=>n.dataset.action==='confirm-connection')[0].onclick();
 await new Promise(resolve=>setTimeout(resolve,10));
 assert.deepEqual(requests.filter(([,a])=>a.operation!=='list'),[['harnessConnections',{operation:'preview',harness:'hermes',remove:listed[0].id}],['harnessConnections',{operation:'change',confirm:'c-1'}]]);
 assert.deepEqual(target.all(n=>!!n.dataset.connection).map(r=>r.dataset.connection),[listed[4].id],'the list is read again after a change');
 assert.match(target.textContent,/github was removed from Hermes Agent\./);
 const form=target.all(n=>n.dataset.add==='hermes')[0],[nameInput,whereInput]=form.all(n=>n.className==='companion-settings-input');
 nameInput.value='fetch';whereInput.value='https://f.example.com';
 form.all(n=>n.dataset.action==='add-connection')[0].onclick();await new Promise(resolve=>setTimeout(resolve,10));
 assert.deepEqual(requests.at(-1),['harnessConnections',{operation:'preview',harness:'hermes',add:{name:'fetch',url:'https://f.example.com'}}]);
 form.all(n=>n.dataset.action==='cancel-connection')[0].onclick();
 assert.match(target.textContent,/Nothing was changed\./);assert.equal(requests.filter(([,a])=>a.operation==='change').length,1,'Cancel runs nothing');
 assert.equal(connectionUseLine({id:'c',kind:'mcp',name:'x',where:'',enabled:true}),'Not used in your Agent’s history yet.');
 assert.equal(connectionLine({id:'c',kind:'mcp',name:'x',where:'node s.js',enabled:false,agent:'work',sign:'needs-sign-in'}),'MCP server · node s.js · needs sign-in in your Agent · profile “work” · turned off');
 delete (globalThis as any).document;
});
console.log('PASS Agent connections: declared per Harness, Hermes Agent and OpenClaw MCP servers and chat accounts listed with no secret and their last use from the Agent\'s own history, added and removed only through fixture `hermes mcp add/remove` and `openclaw mcp add/unset` after a confirmed preview, Settings › Integrations');
