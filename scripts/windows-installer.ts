import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync,lstatSync,mkdirSync,readFileSync,readdirSync,realpathSync,rmSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {lock,git} from './dev-workspace.ts';

const root=fileURLToPath(new URL('../',import.meta.url));
if(process.platform!=='win32')throw Error('Build Windows installers on Windows.');
const value=(name:string)=>{const at=process.argv.indexOf(name);return at<0?undefined:process.argv[at+1];};
const testId=value('--test-id');
if(testId&&!/^[a-f0-9]{12}$/.test(testId))throw Error('Installer test IDs must be 12 lowercase hex characters.');
const payload=realpathSync(value('--payload')||path.join(root,'dist/packages/Worldlet-win32-x64'));
const identity=JSON.parse(readFileSync(path.join(payload,'build-identity.json'),'utf8'));
if(identity.platform!=='windows'||identity.architecture!=='x64'||!/^\d+\.\d+\.\d+$/.test(identity.version)||!Number.isInteger(identity.build)||identity.build<1||identity.build>65535)throw Error('Expected a Windows x64 package identity.');
for(const file of ['Worldlet.exe','Worldlet.ico','resources/app.asar','resources/WorldletWeb/index.html','resources/HermesBootstrap/uv.exe','resources/agent-browser.exe'])if(!existsSync(path.join(payload,file)))throw Error('Incomplete Windows package: '+file);
const compiler=process.env.WORLDLET_MAKENSIS||path.join(root,'.local/tools/nsis-3.12/makensis.exe');
const run=(exe:string,args:string[])=>{const result=spawnSync(exe,args,{cwd:root,stdio:'inherit'});if(result.error)throw result.error;if(result.status!==0)throw Error(`${path.basename(exe)} failed (${result.status}).`);};
const version=spawnSync(compiler,['/VERSION'],{encoding:'utf8'});
if(version.error)throw Error('Install NSIS 3.12 locally or set WORLDLET_MAKENSIS to its makensis.exe.');
if(version.status!==0||version.stdout.trim()!=='v3.12')throw Error('Windows installer builds require NSIS 3.12.');
const release=lock(path.join(root,'.local/windows-installer.lock'));
try{
 const outputDir=path.join(root,'dist/windows-installers');mkdirSync(outputDir,{recursive:true});
 const suffix=testId?`-test-${testId}`:'-unsigned';
 const output=path.join(outputDir,`Worldlet-${identity.version}-${identity.build}-windows-x64${suffix}.exe`);
 if(existsSync(output))throw Error('Refusing to overwrite an existing installer: '+output);
 const product=testId?`Worldlet Installer Test ${testId}`:'Worldlet';
 const appId='app.worldlet.windows'+(testId?'.test.'+testId:'');
 const files:string[]=[],directories:string[]=[];
 function walk(relative=''){
  for(const entry of readdirSync(path.join(payload,relative),{withFileTypes:true})){
   const name=path.join(relative,entry.name),stat=lstatSync(path.join(payload,name));
   if(stat.isSymbolicLink())throw Error('Installer payload cannot contain links: '+name);
   if(entry.isDirectory()){directories.push(name);walk(name);}
   else if(entry.isFile())files.push(name);
   else throw Error('Unexpected package entry: '+name);
  }
 }
 walk();files.sort();directories.sort((a,b)=>a.split(path.sep).length-b.split(path.sep).length||a.localeCompare(b));
 const escape=(text:string)=>text.replaceAll('$','$$').replaceAll('"','$\\"');
 const quoted=(text:string)=>'"'+escape(text)+'"';
 const generated=path.join(outputDir,`installer-${testId||'unsigned'}.nsh`);
 // The real installer is built first and wrapped by launcher.nsi, which restarts outside an old app's process tree
 // before anything else (#1804); the published file is the launcher.
 const inner=output.replace(/\.exe$/,'.setup.exe');
 const defines=(out:string)=>Object.entries({PRODUCT:product,IDENTITY:appId,OUTPUT:out,PAYLOAD:payload,APP_VERSION:identity.version,BUILD:String(identity.build),FILE_VERSION:`${identity.version}.${identity.build}`}).map(([key,val])=>`!define ${key} ${quoted(val)}`);
 const lines=defines(inner);
 lines.push('!macro CheckInstalledDirectories','!insertmacro CheckDirectory "$INSTDIR\\app"',...directories.map(dir=>`!insertmacro CheckDirectory "$INSTDIR\\app\\${escape(dir)}"`),'!macroend');
 lines.push('!macro CheckStagedDirectories',...[...directories,...files].map(name=>`!insertmacro CheckDirectory "$Stage\\${escape(name)}"`),'!macroend');
 lines.push('!macro MovePayload','CreateDirectory "$INSTDIR\\app"',...directories.map(dir=>`CreateDirectory "$INSTDIR\\app\\${escape(dir)}"`));
 for(const file of files)lines.push(`Delete "$INSTDIR\\app\\${escape(file)}"`,`ClearErrors`,`Rename "$Stage\\${escape(file)}" "$INSTDIR\\app\\${escape(file)}"`,'${If} ${Errors}','!insertmacro Fail "Worldlet could not finish copying its program files. Reopen setup to retry."','${EndIf}');
 lines.push(...[...directories].reverse().map(dir=>`RMDir "$Stage\\${escape(dir)}"`),'RMDir "$Stage"','!macroend');
 lines.push('!macro DeletePayload',...files.map(file=>`Delete "$INSTDIR\\app\\${escape(file)}"`),...[...directories].reverse().map(dir=>`RMDir "$INSTDIR\\app\\${escape(dir)}"`),'RMDir "$INSTDIR\\app"','!macroend');
 writeFileSync(generated,'\uFEFF'+lines.join('\n')+'\n');
 run(compiler,['/NOCONFIG','/V2',`/DGENERATED=${generated}`,path.join(root,'platform/electron/distribution/windows/installer.nsi')]);
 const launcher=path.join(outputDir,`launcher-${testId||'unsigned'}.nsh`);
 writeFileSync(launcher,'\uFEFF'+[...defines(output),`!define INNER ${quoted(inner)}`].join('\n')+'\n');
 try{run(compiler,['/NOCONFIG','/V2',`/DGENERATED=${launcher}`,path.join(root,'platform/electron/distribution/windows/launcher.nsi')]);}
 finally{rmSync(inner,{force:true});}
 const sha256=createHash('sha256').update(readFileSync(output)).digest('hex');
 writeFileSync(output+'.sha256',`${sha256}  ${path.basename(output)}\n`);
 writeFileSync(output+'.json',JSON.stringify({...identity,product,appId,installer:path.basename(output),sha256,signed:false,files:files.length,installerSourceCommit:git(root,'rev-parse','HEAD'),installerSourceDirty:!!git(root,'status','--porcelain')},null,2)+'\n');
 console.log('Built unsigned Windows installer: '+output);
}finally{release();}
