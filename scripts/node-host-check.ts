// The Node host (platform/node): builds it, runs its contract check, boots it on a temporary library and stops it with
// SIGTERM. It must start with no window, write the browser link (room only), keep that link across a restart through
// its own vault storage, and stop cleanly. Its shim and vault storage are checked on their own first. Then the World
// in a browser on this computer (contracts/web-world.ts): on a library with one item, the link it writes opens the real
// World in headless Chromium (SwiftShader WebGL), and the server refuses another Host, another Origin, a missing token
// and the actions a browser's page may not ask for; the page hears what its window cannot do and hides or replaces it.
// The `worldlet` command line (status, link and its QR code, register) runs against the host over its control socket,
// with fake `claude` and `codex` commands. `--screenshot <file>` keeps a picture of that World.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {execFileSync,spawn,spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import qrcode from 'qrcode-generator';
import {withTempDir} from './test-temp.ts';
import {launchTestBrowser,pageErrors,waitForWorld} from './browser-test.ts';
import {WorldLedger} from '../platform/electron/src/store/ledger.ts';
import {WEB_DENIED_MESSAGE,WEB_PAGE_FEATURES,WEB_PAGE_UNAVAILABLE,WORLD_PROTOCOL,worldLinkToken,worldTokenProtocol,worldWebCsp} from '../contracts/web-world.ts';
import {nodeVaultStorage,VAULT_KEY_FILE} from '../platform/node/src/vault-storage.ts';
import {askControl,readControlRequest,CONTROL_SOCKET_LIMIT,controlSocketTooLong,serveControl} from '../platform/node/src/control.ts';
import {app,BrowserWindow,BaseWindow,DESKTOP_ONLY,dialog,Notification,shell} from '../platform/node/src/electron-shim.ts';

const root=fileURLToPath(new URL('../',import.meta.url));
const web=path.join(root,'dist/WorldletWeb');
const mode=(file:string)=>fs.statSync(file).mode&0o777;
const screenshot=process.argv.includes('--screenshot')?path.resolve(process.argv[process.argv.indexOf('--screenshot')+1]):'';

// 1. The shim: process facts answer, anything that needs a screen says so.
assert.equal(app.isPackaged,true);
assert.equal(await app.whenReady(),undefined);
await assert.rejects(dialog.showOpenDialog({}),new RegExp(DESKTOP_ONLY));
await assert.rejects(shell.openExternal('https://example.com'),new RegExp(DESKTOP_ONLY));
assert.equal(await shell.openPath('/'),DESKTOP_ONLY,'openPath answers an error string, as Electron does');
assert.throws(()=>new BrowserWindow({show:false}),new RegExp(DESKTOP_ONLY));
assert.deepEqual(BaseWindow.getAllWindows(),[]);
assert.equal(Notification.isSupported(),false);
console.log('PASS node host shim: windows throw, dialogs and shell opens need the desktop app');

// 2. Vault storage: AES-256-GCM under an owner-only key made once; another key or a changed byte reads nothing.
await withTempDir('worldlet-node-vault-',dir=>{
 const storage=nodeVaultStorage(dir);
 assert.throws(()=>storage.decryptString(Buffer.from('nothing')),'no key yet: nothing was sealed');
 const sealed=storage.encryptString('secret one');
 const key=path.join(dir,VAULT_KEY_FILE);
 assert.equal(fs.readFileSync(key).length,32);
 if(process.platform!=='win32')assert.equal(mode(key),0o600);
 assert.ok(!sealed.toString('latin1').includes('secret one'));
 assert.notDeepEqual(storage.encryptString('secret one'),sealed,'a fresh nonce every time');
 assert.equal(nodeVaultStorage(dir).decryptString(sealed),'secret one','a new process reads it with the same key');
 const changed=Buffer.from(sealed);changed[changed.length-1]^=1;
 assert.throws(()=>storage.decryptString(changed));
 const other=path.join(dir,'other');nodeVaultStorage(other).encryptString('x');
 assert.throws(()=>nodeVaultStorage(other).decryptString(sealed));
});
console.log('PASS node host vault storage: sealed under an owner-only key, unreadable with another key or once changed');

// Local-window selection is explicit and only valid for `link`.
assert.deepEqual(readControlRequest({command:'link',local:true}),{command:'link',local:true});
for(const request of [{command:'link',local:'true'},{command:'status',local:true}])assert.equal(readControlRequest(request),null);

// The control socket refuses a path the system would cut short (macOS binds at most 103 bytes, Linux 107) instead of
// binding a shorter one it cannot remove on close, which left the next start with the address in use.
await withTempDir('worldlet-node-control-',async dir=>{
 let deep=dir;while(Buffer.byteLength(path.join(deep,'control.sock'))<=CONTROL_SOCKET_LIMIT)deep=path.join(deep,'library-folder-with-a-long-name');
 fs.mkdirSync(deep,{recursive:true});
 const file=path.join(deep,'control.sock');
 assert.equal(controlSocketTooLong(file,4096),'');
 // Windows names its control pipe, which has no such limit.
 if(process.platform==='win32')assert.equal(controlSocketTooLong(file),'');
 if(process.platform!=='win32'){
  assert.match(controlSocketTooLong(file),/library path is too long for a control socket/);
  await assert.rejects(serveControl(file,async()=>({lines:[]})),/library path is too long for a control socket/,'the host says why it has no control socket');
  assert.ok(!fs.existsSync(file),'and binds nothing');
  await assert.rejects(askControl(file,{command:'status'}),/library path is too long/,'the command line says the same');
  const short=path.join(dir,'control.sock'),server=await serveControl(short,async()=>({lines:['ok']}));
  assert.deepEqual(await askControl(short,{command:'status'}),{lines:['ok']},'a path that fits works');
  await new Promise(resolve=>server.close(resolve));
  assert.ok(!fs.existsSync(short),'and is removed on close');
 }
},process.platform==='win32'?os.tmpdir():'/tmp');
console.log('PASS node host control socket: a library path too long for a unix socket is refused with its reason, not cut short');

// 3. The built host. Its program folder holds WorldletWeb, as an installed copy does.
if(!fs.existsSync(path.join(web,'applet-runtime.json')))execFileSync('npm',['run','build:native-ui'],{cwd:root,stdio:'inherit',shell:process.platform==='win32'});
// The control socket is bound in the library, so on POSIX the library sits under /tmp: macOS's own temp folder is too
// deep for a unix socket path (control.ts CONTROL_SOCKET_LIMIT).
const shortTemp=process.platform==='win32'?os.tmpdir():'/tmp';
await withTempDir('wl-',async temp=>{
 const program=path.join(temp,'program'),library=path.join(temp,'library');
 execFileSync(process.execPath,[path.join(root,'scripts/build-node-host.ts'),'--out',program],{cwd:root,stdio:'inherit'});
 fs.symlinkSync(web,path.join(program,'WorldletWeb'),process.platform==='win32'?'junction':'dir');
 const host=path.join(program,'worldlet.cjs');
 const env={...process.env,WORLDLET_PROFILE_ROOT:library,WORLDLET_PAIR_RELAY:'https://relay.example.com'};
 const sleep=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
 /** Starts the built host and waits (30 s at most) until its output (stdout and stderr) shows `ready`. `stop` ends it
  * with SIGTERM, or with the stop message over IPC (`ipc`: the only clean stop on Windows, where SIGTERM ends a process
  * at once without running its handler), and returns its exit code. */
 const runHost=async(hostEnv:NodeJS.ProcessEnv,ready:(out:string)=>boolean,ipc=false)=>{
  const child=spawn(process.execPath,[host],{cwd:temp,env:hostEnv,stdio:['ignore','pipe','pipe',...ipc?['ipc' as const]:[]]});
  let out='';child.stdout.on('data',chunk=>{out+=chunk;});child.stderr.on('data',chunk=>{out+=chunk;});
  const exited=new Promise<number|null>(resolve=>child.on('exit',code=>resolve(code)));
  const deadline=Date.now()+30_000;
  while(!ready(out)&&child.exitCode===null&&Date.now()<deadline)await sleep(100);
  return {output:()=>out,async stop(){
   if(ipc)child.send({type:'worldlet:stop'});else child.kill('SIGTERM');
   const code=await Promise.race([exited,sleep(20_000).then(()=>'hung' as const)]);
   if(code==='hung')child.kill('SIGKILL');
   return code;
  }};
 };

 // The contract check: what this host implements, on a temporary library it removes again.
 const contract=spawnSync(process.execPath,[host,'--host-contract-check'],{cwd:temp,env,encoding:'utf8',timeout:60_000});
 assert.equal(contract.status,0,contract.stderr);
 const report=JSON.parse(contract.stdout.split('\n').find(line=>line.startsWith('{'))!);
 for(const action of ['phonePair','phonePublish','agentChat','agentHarness','onboarding','snapshot','calendarEvents','artifacts','ongoing'])assert.ok(report.actions.includes(action),'registers '+action);
 for(const action of ['browserShow','appUpdate','desktopCompanionState'])assert.ok(!report.actions.includes(action),'no window action '+action);
 for(const service of ['agent','fox','phone','sources','vault','worldTools'])assert.ok(report.services.includes(service),'provides '+service);
 assert.ok(!report.services.includes('rtcPage'),'no direct lines: browser links run through the room');
 assert.ok(!fs.existsSync(library),'the contract check never opens the named library');
 assert.ok(!fs.existsSync(path.join(os.tmpdir(),'worldlet-contract-'+contract.pid)),'its temporary library is removed');
 console.log(`PASS node host contract: ${report.actions.length} actions, services ${report.services.join(',')}`);

 // Boots, writes the browser link and stops cleanly: on SIGTERM (POSIX), or on the stop message over its IPC channel,
 // which is how it is stopped on Windows, where SIGTERM ends a process at once without running its handler.
 const boot=async(stop:'signal'|'message')=>{
  const running=await runHost(env,out=>/room link ready in /.test(out)&&/World ready at /.test(out),stop==='message'),out=running.output();
  assert.match(out,/worldlet: started /,'starts: '+out.slice(-400));
  assert.match(out,/worldlet: room link ready in .*room-link\.txt/,'says where the link is: '+out.slice(-400));
  assert.match(out,/worldlet: World ready at http:\/\/127\.0\.0\.1:\d+\/world\/ \(its link is in .*world-link\.txt\)/,'says where the World link is: '+out.slice(-400));
  assert.ok(!/#t=/.test(out),'never prints the World link, which carries its token');
  assert.ok(!/https:\/\/relay\.example\.com\/open\/#/.test(out),'never prints the link, which carries its secret');
  const code=await running.stop(),all=running.output();
  assert.equal(code,0,(stop==='signal'?'stops cleanly on SIGTERM: ':'stops cleanly on the stop message: ')+all.slice(-400));
  assert.match(all,/worldlet: stopped/);
  return all;
 };
 // POSIX proves both stops; Windows has only the message (its SIGTERM is TerminateProcess).
 const first=await boot(process.platform==='win32'?'message':'signal');
 const file=path.join(library,'room-link.txt'),link=fs.readFileSync(file,'utf8').trim();
 assert.match(link,/^https:\/\/relay\.example\.com\/open\/#/,'the file holds the link');
 assert.ok(!first.includes(link.slice(link.indexOf('#')+1)),'and stdout does not');
 if(process.platform!=='win32'){
  assert.equal(mode(file),0o600,'the link is owner-only');
  assert.equal(mode(path.join(library,VAULT_KEY_FILE)),0o600,'the vault key is owner-only');
 }
 assert.ok(!fs.readFileSync(path.join(library,'vault.json'),'utf8').includes(link.slice(link.indexOf('#')+1)),'the vault holds the pairing sealed');
 const worldFile=path.join(library,'world-link.txt'),world=fs.readFileSync(worldFile,'utf8').trim();
 assert.match(world,/^http:\/\/127\.0\.0\.1:\d+\/world\/#t=[A-Za-z0-9_-]{43}$/,'the World link: this computer, a 32-byte token in the fragment');
 if(process.platform!=='win32')assert.equal(mode(worldFile),0o600,'the World link is owner-only');
 assert.ok(!fs.readFileSync(path.join(library,'vault.json'),'utf8').includes(worldLinkToken(new URL(world).hash)),'the vault holds the token sealed');
 await boot('message');
 assert.equal(fs.readFileSync(file,'utf8').trim(),link,'a restart keeps the same link');
 assert.equal(fs.readFileSync(worldFile,'utf8').trim(),world,'and the same World link');
 console.log('PASS node host: boots with no window, writes the browser link and the World link, keeps them across a restart and stops cleanly on SIGTERM (POSIX) and on the stop message over IPC (every platform, the only clean stop on Windows)');

 // The `worldlet` command line over the control socket, and the fixed MCP home (control.ts, mcp-home.ts): fake
 // `claude` and `codex` commands record how they were asked to register Worldlet's server. POSIX only (a unix socket
 // and shell fixtures).
 if(process.platform!=='win32'){
  const home=path.join(temp,'home'),fake=path.join(temp,'fake'),argvLog=path.join(temp,'argv.log'),mcp=path.join(temp,'worldlet-home','mcp');
  fs.mkdirSync(home);fs.mkdirSync(fake);
  // As install.sh lays it out: Agents are registered with current/node/bin/node, which outlives this build's own folder.
  const node=path.join(temp,'worldlet-home','current','node','bin','node');
  fs.mkdirSync(path.dirname(node),{recursive:true});fs.symlinkSync(process.execPath,node);
  for(const name of ['claude','codex'])fs.writeFileSync(path.join(fake,name),`#!/bin/sh\nprintf '%s\\n' "${name} $*" >> '${argvLog}'\n[ "$2" = remove ] && exit 1\nexit 0\n`,{mode:0o755});
  const cliEnv:NodeJS.ProcessEnv={...env,HOME:home,WORLDLET_HOME:path.join(temp,'worldlet-home'),PATH:fake+path.delimiter+process.env.PATH};
  delete cliEnv.CLAUDE_CONFIG_DIR;delete cliEnv.CODEX_HOME;
  const cli=(...args:string[])=>spawnSync(process.execPath,[host,...args],{cwd:temp,env:cliEnv,encoding:'utf8',timeout:120_000});
  const socket=path.join(library,'control.sock'),link=fs.readFileSync(path.join(library,'room-link.txt'),'utf8').trim(),secret=link.slice(link.indexOf('#')+1);
  const idle=cli('status');
  assert.equal(idle.status,3,'no service: its own exit code');
  assert.match(idle.stderr,/Worldlet is not running on this computer/);
  const start=async()=>{
   const running=await runHost(cliEnv,out=>/World ready at /.test(out)&&fs.existsSync(socket));
   assert.ok(fs.existsSync(socket),'the control socket is in the library: '+running.output().slice(-400));
   return {output:running.output,stop:async()=>assert.equal(await running.stop(),0,'stops cleanly: '+running.output().slice(-400))};
  };
  let running=await start();
  const localLink=fs.readFileSync(path.join(library,'world-link.txt'),'utf8').trim(),localSecret=new URL(localLink).hash;
  try{
   assert.equal(mode(socket),0o600,'the control socket is owner-only');
   const status=cli('status');
   assert.equal(status.status,0,status.stderr);
   assert.match(status.stdout,/^Worldlet .* is running with the library at /);
   assert.match(status.stdout,/Setup: The person has not finished setup yet/,'says setup is not done');
   assert.match(status.stdout,/registered in no Agent yet/);
   assert.ok(!status.stdout.includes(secret)&&!status.stdout.includes(localSecret),'status never prints either link');
   assert.match(status.stdout,/worldlet link --local/,'unfinished setup points to the owner window');
   // One host per library: a second start, or a mistyped command, does not start another one beside it.
   const second=cli();
   assert.equal(second.status,1,'a second host does not start: '+second.stdout.slice(-400));
   assert.match(second.stderr,/Another Worldlet is running on this library/);
   const typo=cli('lnik');
   assert.equal(typo.status,2,'an unknown command is not a host');
   assert.match(typo.stderr,/^Usage: worldlet <command>/);
   const help=cli('--help');
   assert.equal(help.status,0,'help is no error');
   assert.match(help.stdout,/^Usage: worldlet <command>/);
   const printed=cli('link');
   assert.equal(printed.status,0,printed.stderr);
   assert.equal(printed.stdout.trim(),link,'link prints the browser link, the same one the library keeps');
   const local=cli('link','--local');
   assert.equal(local.status,0,local.stderr);
   assert.equal(local.stdout.trim(),localLink,'owner CLI returns the existing local window link');
   assert.equal(new URL(localLink).hostname,'127.0.0.1');
   assert.equal(cli('link','--loacl').status,2,'a mistyped local option must not return the remote link');
   assert.equal(cli('status','--local').status,2,'local selection is for link only');
   const bootstrap=await launchTestBrowser();
   try{
    const page=await bootstrap.newPage();
    await page.goto(local.stdout.trim());await waitForWorld(page);
    assert.deepEqual(await page.evaluate(()=>(window as any).worldletWebHost.request({action:'agentAccess',operation:'list'})),{agents:[]},'before setup, the local window can inspect owner access without granting it');
    assert.match(await page.evaluate(()=>(window as any).worldletWebHost.request({action:'serviceSync',operation:'list'}).then(()=>'',(error:Error)=>error.message)),/own writable World/,'unconsented setup cannot access collection');
    assert.equal(new URL(page.url()).hash,'','the local window removes its token from the address');
    assert.match(cli('status').stdout,/Setup: The person has not finished setup yet/,'opening the owner window does not supply consent');
   }finally{await bootstrap.close();}
   // `link --qr` adds the link's QR code (qr.ts): read back from its half blocks, it is the code of that link, light
   // modules drawn white on black.
   const coded=cli('link','--qr');
   assert.equal(coded.status,0,coded.stderr);
   const [first,blank,...drawn]=coded.stdout.replace(/\n$/,'').split('\n');
   assert.equal(first,link);assert.equal(blank,'');
   assert.ok(drawn.every(line=>line.startsWith('\u001b[37;40m')&&line.endsWith('\u001b[0m')),'white on black, reset after each line');
   const rows=drawn.flatMap(line=>{const cells=[...line.slice(8,-4)];return [cells.map(cell=>cell==='█'||cell==='▀'),cells.map(cell=>cell==='█'||cell==='▄')];});
   const qr=qrcode(0,'L');qr.addData(link,'Byte');qr.make();
   const size=qr.getModuleCount();
   for(let row=0;row<size;row++)for(let column=0;column<size;column++)assert.equal(rows[row+2][column+2],!qr.isDark(row,column),`QR module ${row},${column}`);
   assert.equal(cli('register').status,2,'register needs --agent');
   const hermes=cli('register','--agent','hermes');
   assert.equal(hermes.status,1);assert.match(hermes.stderr,/worldlet setup --agent hermes/);
   // Opening setup may probe the fake CLIs for discovery, but must not register either without a command.
   const registrations=()=>fs.existsSync(argvLog)?fs.readFileSync(argvLog,'utf8').trim().split('\n').filter(line=>/ mcp (add|remove) /.test(line)):[];
   assert.deepEqual(registrations(),[],'opening the owner window registered no Agent');
   for(const agent of ['claude-code','codex']){
    const registered=cli('register','--agent',agent);
    assert.equal(registered.status,0,registered.stderr);
    assert.match(registered.stdout,/MCP server "worldlet" is registered/);
   }
   const endpoint=(agent:string)=>path.join(mcp,`worldlet-mcp-endpoint.${agent}.json`),shim=path.join(mcp,'worldlet-mcp-standing.cjs'),tools=path.join(mcp,'worldlet-mcp-tools.json');
   const added=(agent:string)=>`--env ELECTRON_RUN_AS_NODE=1 --env WORLDLET_MCP_ENDPOINT_FILE=${endpoint(agent)} --env WORLDLET_MCP_TOOLS_FILE=${tools} -- ${node} ${shim}`;
   assert.deepEqual(registrations(),[
    'claude mcp remove --scope user worldlet',`claude mcp add --scope user worldlet ${added('claude-code')}`,
    'codex mcp remove worldlet',`codex mcp add worldlet ${added('codex')}`],'each Agent registers the fixed home with its own command');
   for(const agent of ['claude-code','codex'])assert.equal(mode(endpoint(agent)),0o600,'the endpoint file is owner-only');
   const skill=fs.readFileSync(path.join(root,'harness/skills/worldlet/SKILL.md'),'utf8');
   assert.equal(fs.readFileSync(path.join(home,'.claude/skills/worldlet/SKILL.md'),'utf8'),skill,'the skill is in Claude Code\'s skills folder');
   assert.equal(fs.readFileSync(path.join(home,'.codex/skills/worldlet/SKILL.md'),'utf8'),skill,'and in Codex\'s');
   assert.match(cli('status').stdout,/registered in claude-code, codex\./);
   // The registered server, as Claude Code starts it: it lists the World tools, and a World tool answers that setup is not
   // done (the channel guard is unchanged), so the link is not handed out through it.
   const asked=spawnSync(process.execPath,[shim],{env:{...cliEnv,WORLDLET_MCP_ENDPOINT_FILE:endpoint('claude-code'),WORLDLET_MCP_TOOLS_FILE:tools},encoding:'utf8',timeout:30_000,
    input:[{jsonrpc:'2.0',id:1,method:'initialize',params:{}},{jsonrpc:'2.0',id:2,method:'tools/list'},{jsonrpc:'2.0',id:3,method:'tools/call',params:{name:'call_world_tool',arguments:{target:'world',action:'link',arguments:'{}'}}}].map(m=>JSON.stringify(m)).join('\n')+'\n'});
   const replies=asked.stdout.trim().split('\n').map(line=>JSON.parse(line));
   assert.deepEqual(replies.find(r=>r.id===2).result.tools.map((t:{name:string})=>t.name),['describe_world_tools','call_world_tool']);
   const call=replies.find(r=>r.id===3).result;
   assert.ok(!call.content[0].text.includes(secret),'the MCP server does not hand out the link before setup');
   assert.match(call.content[0].text,/not finished setting up|not ready/i,'World tools wait for setup: '+call.content[0].text);
  }finally{await running.stop();}
  assert.ok(!running.output().includes(secret)&&!running.output().includes(localSecret),'the service log never holds either link');
  assert.ok(!fs.existsSync(socket),'the socket goes when the service stops');
  assert.ok(!fs.existsSync(path.join(mcp,'worldlet-mcp-endpoint.codex.json')),'and the endpoint files, so the server says Worldlet is not open');
  // A restart writes the same files again, with no new registration.
  const before=fs.readFileSync(argvLog,'utf8');
  running=await start();
  try{
   const deadline=Date.now()+10_000;
   while(!fs.existsSync(path.join(mcp,'worldlet-mcp-endpoint.codex.json'))&&Date.now()<deadline)await sleep(100);
   for(const agent of ['claude-code','codex'])assert.equal(mode(path.join(mcp,`worldlet-mcp-endpoint.${agent}.json`)),0o600,'the same endpoint file again, owner-only');
   assert.equal(fs.readFileSync(argvLog,'utf8'),before,'no Agent registers again');
   assert.equal(cli('link','--local').stdout.trim(),localLink,'restart keeps the local owner window link');
  }finally{await running.stop();}
  console.log('PASS node host command line: status, link (and its QR code) and register over an owner-only control socket; one host per library, help and a mistyped command start none; Claude Code and Codex register the fixed MCP home with their own commands and get the skill; endpoint files owner-only and the same across a restart; the link never in the service log');
 }

 // The World in a browser on this computer, on a library that finished setup and holds one item.
 const seeded=path.join(temp,'seeded'),title='Renew the library card';
 const ledger=new WorldLedger(seeded);
 ledger.saveConfiguration({version:1,workspaceId:'NODE-HOST-CHECK',revision:1,sources:[],knowledge:[],layout:null,codexPath:'',model:'',cloudConsent:true,lastJob:'',autoSync:false,
  connections:[{id:'c-gmail',provider:'gmail',label:'Gmail',syncStatus:'connected',connected:true}],
  onboarding:{unlockedApplets:['app-gmail','app-browser','app-youtube'],version:1,presets:['home'],completed:true,introStep:9}});
 ledger.upsert([{kind:'task',provider:'gmail',status:'open',title,context:'Due Friday.',reason:'Due Friday.',summary:'The library wrote about the card.',attentionContentVersion:1,policyVersion:2,attentionReason:'due',
  sources:[{provider:'gmail',id:'library-mail',quote:'Your card expires Friday.'}],createdAt:1,updatedAt:2}],'node-host-check',true);
 ledger.close();
 const child=await runHost({...env,WORLDLET_PROFILE_ROOT:seeded},out=>/World ready at /.test(out),process.platform==='win32');
 try{
  const link=new URL(fs.readFileSync(path.join(seeded,'world-link.txt'),'utf8').trim()),token=worldLinkToken(link.hash),port=Number(link.port);
  // Raw requests, with the headers a browser would not let a page choose.
  const ask=(pathname:string,headers:Record<string,string>)=>new Promise<number>((resolve,reject)=>{
   const request=http.request({host:'127.0.0.1',port,path:pathname,headers},response=>{response.resume();resolve(response.statusCode||0);});
   request.on('upgrade',(response,socket)=>{socket.destroy();resolve(response.statusCode||0);});
   request.on('error',reject);request.end();
  });
  const upgrade=(headers:Record<string,string>)=>ask('/world/socket',{Connection:'Upgrade',Upgrade:'websocket','Sec-WebSocket-Version':'13','Sec-WebSocket-Key':'dGhlIHNhbXBsZSBub25jZQ==',...headers});
  const here=`127.0.0.1:${port}`,origin=`http://${here}`,protocols=`${WORLD_PROTOCOL}, ${worldTokenProtocol(token)}`;
  assert.equal(await ask('/world/',{Host:here}),200,'the World page is served');
  // Its policy is the web variant, as a header, and the app window's meta tag is gone (contracts/web-world.ts).
  const served=await new Promise<{headers:http.IncomingHttpHeaders;body:string}>((resolve,reject)=>http.get({host:'127.0.0.1',port,path:'/world/',headers:{Host:here}},response=>{
   let body='';response.setEncoding('utf8');response.on('data',chunk=>{body+=chunk;});response.on('end',()=>resolve({headers:response.headers,body}));}).on('error',reject));
  assert.equal(served.headers['content-security-policy'],worldWebCsp(origin),'the World page carries the web policy');
  assert.match(String(served.headers['content-security-policy']),new RegExp(`connect-src 'self' ws://${here.replace(/\./g,'\\.')}/world/socket;`),'it connects only to its own origin and socket');
  assert.ok(!/http-equiv="Content-Security-Policy"/i.test(served.body)&&served.body.includes('world-startup.js'),'without the window\'s meta policy');
  assert.equal(Number(served.headers['content-length']),Buffer.byteLength(served.body));
  assert.equal(await ask('/world/',{Host:`worldlet.example.com:${port}`}),421,'a request for another name is refused');
  assert.equal(await ask('/world/%2e%2e/%2e%2e/vault.json',{Host:here}),404,'nothing outside the interface build');
  assert.equal(await ask('/world/local-tools/sessions.py',{Host:here}),404,'only what the page loads');
  assert.equal(await upgrade({Host:here,Origin:origin,'Sec-WebSocket-Protocol':protocols}),101,'the socket opens with the token');
  assert.equal(await upgrade({Host:`worldlet.example.com:${port}`,Origin:origin,'Sec-WebSocket-Protocol':protocols}),421,'the socket refuses another Host');
  assert.equal(await upgrade({Host:here,Origin:'https://worldlet.example.com','Sec-WebSocket-Protocol':protocols}),403,'the socket refuses another Origin');
  assert.equal(await upgrade({Host:here,'Sec-WebSocket-Protocol':protocols}),403,'and a missing Origin');
  assert.equal(await upgrade({Host:here,Origin:origin,'Sec-WebSocket-Protocol':WORLD_PROTOCOL}),401,'the socket refuses a missing token');
  assert.equal(await upgrade({Host:here,Origin:origin,'Sec-WebSocket-Protocol':`${WORLD_PROTOCOL}, ${worldTokenProtocol('A'.repeat(43))}`}),401,'and another token');

  const browser=await launchTestBrowser();
  try{
   const context=await browser.newContext({viewport:{width:1440,height:900}});
   const page=await context.newPage(),errors=pageErrors(page),policy:string[]=[];
   // Anything the page's policy blocked, from the console and from the document's own violation events.
   page.on('console',message=>{if(/Content Security Policy|Content-Security-Policy/i.test(message.text()))policy.push(message.text());});
   await page.addInitScript(()=>document.addEventListener('securitypolicyviolation',event=>console.error(`Content Security Policy: ${event.violatedDirective} ${event.blockedURI}`)));
   await page.goto(link.href);
   await waitForWorld(page);
   await page.waitForFunction(()=>(document.querySelector('#notionWorld') as HTMLElement&{sceneMetrics?:{renderer?:string}})?.sceneMetrics?.renderer==='pixi-webgl',undefined,{timeout:120_000});
   await page.getByText(title).first().waitFor({timeout:30_000});
   assert.equal(new URL(page.url()).hash,'','the token leaves the address once the page has it');
   // The host refuses what a browser's World page may not ask for, before the router sees it.
   const refused=(body:Record<string,unknown>)=>page.evaluate(body=>(window as any).worldletWebHost.request(body).then(()=>'',(error:Error)=>error.message),body);
   assert.equal(await refused({action:'dataBackup',operation:'restore',id:'x'}),WEB_DENIED_MESSAGE,'restore is refused');
   assert.equal(await refused({action:'phonePair',kind:'phone',operation:'start'}),WEB_DENIED_MESSAGE,'pairing is refused');
   assert.equal(await refused({action:'deleteSourceData',provider:'gmail'}),WEB_DENIED_MESSAGE,'local data deletion is refused');
   // And what the page's window cannot do, though the page hides it: the native browser, YouTube, sound, the
   // microphone and the desktop Companion, each with the reason Fox's tools give.
   assert.equal(await refused({action:'browserShow',url:'https://example.com/'}),WEB_PAGE_UNAVAILABLE.websitePages,'a native website view is refused');
   assert.equal(await refused({action:'browserCommand',operation:'navigate',args:{url:'https://example.com/'},agent:true}),WEB_PAGE_UNAVAILABLE.websitePages,'and driving one');
   assert.equal(await refused({action:'speechStart',language:'en'}),WEB_PAGE_UNAVAILABLE.voice,'the microphone is refused');
   assert.equal(await refused({action:'analyticsConfig'}),WEB_DENIED_MESSAGE,'the page gets no web capture, so it posts nothing to /ingest');
   assert.deepEqual(await page.evaluate(()=>(window as any).worldletWebHost.request({action:'serviceSync',operation:'list'})),{jobs:[]},'the built Node host installs collection without creating jobs');
   const status=await page.evaluate(()=>(window as any).worldletWebHost.request({action:'phonePair',kind:'web',operation:'status'}));
   assert.ok(status&&typeof status.state==='string'&&!('link' in status),'a pairing status comes without its link');
   // What the page's window cannot do arrives in the handshake (web-page-features-check.ts): no YouTube in the World, no
   // World sound, no microphone, no room for window buttons, and websites open in a new tab instead of a native view.
   assert.deepEqual(await page.evaluate(()=>(window as any).worldletWebHost.features),{...WEB_PAGE_FEATURES},'the page hears what its window cannot do');
   const layout=await page.evaluate(()=>{const has=(document.querySelector('#notionWorld') as any).appletLayout.has;return {browser:has('app-browser'),youtube:has('app-youtube')};});
   assert.deepEqual(layout,{browser:true,youtube:false},'YouTube is left out of the World; the Browser stays');
   assert.equal(await page.locator('.world-audio').count(),0,'no World sound control');
   assert.equal(await page.locator('.companion-speech-button[hidden][data-voice=off]').count(),1,'no microphone beside Fox');
   assert.equal(await page.locator('.companion-speech-button').first().isVisible(),false);
   assert.equal(await page.evaluate(()=>document.documentElement.hasAttribute('data-leading-window-controls')),false,'no room kept for window buttons');
   await page.evaluate(()=>{(window as any).shows=0;const request=(window as any).worldletWebHost.request;(window as any).worldletWebHost.request=(body:{action?:string})=>{if(body?.action==='browserShow')(window as any).shows++;return request(body);};location.hash='object=app-browser';});
   const newTab=page.locator('.browser-new-tab-link');
   await newTab.waitFor({timeout:30_000});
   assert.equal(await newTab.getAttribute('target'),'_blank','the Browser offers its page in a new tab');
   assert.equal(await newTab.getAttribute('href'),'https://www.google.com/');
   await context.route('https://www.google.com/**',route=>route.fulfill({contentType:'text/html',body:'<title>Home</title>'}));
   const [tab]=await Promise.all([context.waitForEvent('page'),newTab.click()]);
   await tab.waitForLoadState();
   assert.equal(tab.url(),'https://www.google.com/','and opens it there');
   await tab.close();
   assert.equal(await page.evaluate(()=>(window as any).shows),0,'no native page is asked for');
   await page.evaluate(()=>{location.hash='';});
   if(screenshot){fs.mkdirSync(path.dirname(screenshot),{recursive:true});await page.screenshot({path:screenshot});}
   assert.deepEqual(errors,[],'no page errors');
   assert.deepEqual(policy,[],'nothing the page loads breaks its policy');
   // The policy is in force: the page cannot reach another origin, and the check sees the attempt.
   assert.equal(await page.evaluate(()=>fetch('https://example.com/').then(()=>'reached',()=>'blocked')),'blocked','another origin is out of reach');
   await page.waitForTimeout(200);
   assert.ok(policy.some(line=>line.includes('connect-src')),'and the attempt is seen: '+policy.join(' | '));
   // One World page at a time: a second tab takes over and the first says where the World is.
   const second=await context.newPage();
   await second.goto(link.href);
   await waitForWorld(second);
   await page.waitForFunction(()=>document.documentElement.dataset.worldClosed==='true',undefined,{timeout:30_000});
   assert.match(await page.locator('#nativeNotice').textContent()||'',/open in another browser tab/);
   await second.getByText(title).first().waitFor({timeout:30_000});
  }finally{await browser.close();}
  console.log('PASS node host World in a browser: the real World (pixi-webgl) with its item under the web policy with no violation, one page at a time; another Host, Origin or token, denied actions and what the page\'s window cannot do are refused; the page hears what its window cannot do, leaves out YouTube, sound, the microphone and window buttons, and opens the Browser\'s page in a new tab');
 }finally{
  assert.equal(await child.stop(),0,'stops cleanly with a World page open: '+child.output().slice(-400));
  assert.ok(!child.output().includes(fs.readFileSync(path.join(seeded,'world-link.txt'),'utf8').trim().split('#t=')[1]),'stdout never holds the token');
 }
},shortTemp);
