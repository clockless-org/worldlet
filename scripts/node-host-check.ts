// The Node host (platform/node): builds it, runs its contract check, boots it on a temporary library and stops it with
// SIGTERM. It must start with no window, write the browser link (room only), keep that link across a restart through
// its own vault storage, and stop cleanly. Its shim and vault storage are checked on their own first. Then the World
// in a browser on this computer (contracts/web-world.ts): on a library with one item, the link it writes opens the real
// World in headless Chromium (SwiftShader WebGL), and the server refuses another Host, another Origin, a missing token
// and the actions a browser's page may not ask for. `--screenshot <file>` keeps a picture of that World.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {execFileSync,spawn,spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {withTempDir} from './test-temp.ts';
import {launchTestBrowser,pageErrors,waitForWorld} from './browser-test.ts';
import {WorldLedger} from '../platform/electron/src/store/ledger.ts';
import {WEB_DENIED_MESSAGE,WORLD_PROTOCOL,worldLinkToken,worldTokenProtocol} from '../contracts/web-world.ts';
import {nodeVaultStorage,VAULT_KEY_FILE} from '../platform/node/src/vault-storage.ts';
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

// 3. The built host. Its program folder holds WorldletWeb, as an installed copy does.
if(!fs.existsSync(path.join(web,'applet-runtime.json')))execFileSync('npm',['run','build:native-ui'],{cwd:root,stdio:'inherit',shell:process.platform==='win32'});
await withTempDir('worldlet-node-host-',async temp=>{
 const program=path.join(temp,'program'),library=path.join(temp,'library');
 execFileSync(process.execPath,[path.join(root,'scripts/build-node-host.ts'),'--out',program],{cwd:root,stdio:'inherit'});
 fs.symlinkSync(web,path.join(program,'WorldletWeb'),process.platform==='win32'?'junction':'dir');
 const host=path.join(program,'worldlet.cjs');
 const env={...process.env,WORLDLET_PROFILE_ROOT:library,WORLDLET_PAIR_RELAY:'https://relay.example.com'};

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

 // Boots, writes the browser link, stops on SIGTERM.
 const boot=async()=>{
  const child=spawn(process.execPath,[host],{cwd:temp,env,stdio:['ignore','pipe','pipe']});
  let out='',err='';
  child.stdout.on('data',chunk=>{out+=chunk;});child.stderr.on('data',chunk=>{err+=chunk;});
  const exited=new Promise<number|null>(resolve=>child.on('exit',code=>resolve(code)));
  const deadline=Date.now()+30_000;
  while(!(/room link ready in /.test(out)&&/World ready at /.test(out))&&child.exitCode===null&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,100));
  assert.match(out,/worldlet: started /,'starts: '+err.slice(-400));
  assert.match(out,/worldlet: room link ready in .*room-link\.txt/,'says where the link is: '+err.slice(-400));
  assert.match(out,/worldlet: World ready at http:\/\/127\.0\.0\.1:\d+\/world\/ \(its link is in .*world-link\.txt\)/,'says where the World link is: '+err.slice(-400));
  assert.ok(!/#t=/.test(out),'never prints the World link, which carries its token');
  assert.ok(!/https:\/\/relay\.example\.com\/open\/#/.test(out),'never prints the link, which carries its secret');
  child.kill('SIGTERM');
  const code=await Promise.race([exited,new Promise<'hung'>(resolve=>setTimeout(()=>resolve('hung'),20_000))]);
  if(code==='hung')child.kill('SIGKILL');
  assert.equal(code,0,'stops cleanly on SIGTERM: '+err.slice(-400));
  assert.match(out,/worldlet: stopped/);
  return out;
 };
 const first=await boot();
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
 await boot();
 assert.equal(fs.readFileSync(file,'utf8').trim(),link,'a restart keeps the same link');
 assert.equal(fs.readFileSync(worldFile,'utf8').trim(),world,'and the same World link');
 console.log('PASS node host: boots with no window, writes the browser link and the World link, keeps them across a restart and stops on SIGTERM');

 // The World in a browser on this computer, on a library that finished setup and holds one item.
 const seeded=path.join(temp,'seeded'),title='Renew the library card';
 const ledger=new WorldLedger(seeded);
 ledger.saveConfiguration({version:1,workspaceId:'NODE-HOST-CHECK',revision:1,sources:[],knowledge:[],layout:null,codexPath:'',model:'',cloudConsent:true,lastJob:'',autoSync:false,
  connections:[{id:'c-gmail',provider:'gmail',label:'Gmail',syncStatus:'connected',connected:true}],
  onboarding:{unlockedApplets:['app-gmail'],version:1,presets:['home'],completed:true,introStep:9}});
 ledger.upsert([{kind:'task',provider:'gmail',status:'open',title,context:'Due Friday.',reason:'Due Friday.',summary:'The library wrote about the card.',attentionContentVersion:1,policyVersion:2,attentionReason:'due',
  sources:[{provider:'gmail',id:'library-mail',quote:'Your card expires Friday.'}],createdAt:1,updatedAt:2}],'node-host-check',true);
 ledger.close();
 const child=spawn(process.execPath,[host],{cwd:temp,env:{...env,WORLDLET_PROFILE_ROOT:seeded},stdio:['ignore','pipe','pipe']});
 let out='';child.stdout.on('data',chunk=>{out+=chunk;});child.stderr.on('data',chunk=>{out+=chunk;});
 const exited=new Promise<number|null>(resolve=>child.on('exit',code=>resolve(code)));
 try{
  const deadline=Date.now()+30_000;
  while(!/World ready at /.test(out)&&child.exitCode===null&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,100));
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
   const page=await context.newPage(),errors=pageErrors(page);
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
   const status=await page.evaluate(()=>(window as any).worldletWebHost.request({action:'phonePair',kind:'web',operation:'status'}));
   assert.ok(status&&typeof status.state==='string'&&!('link' in status),'a pairing status comes without its link');
   if(screenshot){fs.mkdirSync(path.dirname(screenshot),{recursive:true});await page.screenshot({path:screenshot});}
   assert.deepEqual(errors,[],'no page errors');
   // One World page at a time: a second tab takes over and the first says where the World is.
   const second=await context.newPage();
   await second.goto(link.href);
   await waitForWorld(second);
   await page.waitForFunction(()=>document.documentElement.dataset.worldClosed==='true',undefined,{timeout:30_000});
   assert.match(await page.locator('#nativeNotice').textContent()||'',/open in another browser tab/);
   await second.getByText(title).first().waitFor({timeout:30_000});
  }finally{await browser.close();}
  console.log('PASS node host World in a browser: the real World (pixi-webgl) with its item, one page at a time; another Host, Origin or token and denied actions are refused');
 }finally{
  child.kill('SIGTERM');
  const code=await Promise.race([exited,new Promise<'hung'>(resolve=>setTimeout(()=>resolve('hung'),20_000))]);
  if(code==='hung')child.kill('SIGKILL');
  assert.equal(code,0,'stops cleanly with a World page open: '+out.slice(-400));
  assert.ok(!out.includes(fs.readFileSync(path.join(seeded,'world-link.txt'),'utf8').trim().split('#t=')[1]),'stdout never holds the token');
 }
});
