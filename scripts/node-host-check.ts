// The Node host (platform/node): builds it, runs its contract check, boots it on a temporary library and stops it with
// SIGTERM. It must start with no window, write the browser link (room only), keep that link across a restart through
// its own vault storage, and stop cleanly. Its shim and vault storage are checked on their own first.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync,spawn,spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {withTempDir} from './test-temp.ts';
import {nodeVaultStorage,VAULT_KEY_FILE} from '../platform/node/src/vault-storage.ts';
import {app,BrowserWindow,BaseWindow,DESKTOP_ONLY,dialog,Notification,shell} from '../platform/node/src/electron-shim.ts';

const root=fileURLToPath(new URL('../',import.meta.url));
const web=path.join(root,'dist/WorldletWeb');
const mode=(file:string)=>fs.statSync(file).mode&0o777;

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
  while(!/room link ready in /.test(out)&&child.exitCode===null&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,100));
  assert.match(out,/worldlet: started /,'starts: '+err.slice(-400));
  assert.match(out,/worldlet: room link ready in .*room-link\.txt/,'says where the link is: '+err.slice(-400));
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
 await boot();
 assert.equal(fs.readFileSync(file,'utf8').trim(),link,'a restart keeps the same link');
 console.log('PASS node host: boots with no window, writes the browser link, keeps it across a restart and stops on SIGTERM');
});
