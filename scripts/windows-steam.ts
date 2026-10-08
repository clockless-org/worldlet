import {existsSync,mkdirSync,mkdtempSync,readFileSync,readdirSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {git} from './dev-workspace.ts';

// Generate SteamPipe input only. No login, upload, branch activation or release.
const root=fileURLToPath(new URL('../',import.meta.url));
const [app,depot,...extra]=process.argv.slice(2);
if(extra.length||![app,depot].every(id=>/^[1-9]\d{0,9}$/.test(id??'')&&Number(id)<=4294967295)||app===depot||app==='480')
 throw Error('Usage: node scripts/windows-steam.ts <Worldlet App ID> <Windows Depot ID>. Use the actual distinct Steamworks IDs.');
const payload=path.join(root,'dist/packages/Worldlet-win32-x64');
const identity=JSON.parse(readFileSync(path.join(payload,'build-identity.json'),'utf8'));
if(identity.sourceCommit!==git(root,'rev-parse','HEAD')||identity.sourceDirty||git(root,'status','--porcelain')||identity.platform!=='windows'||identity.architecture!=='x64'||identity.distributionChannel!=='steam')
 throw Error('Build a clean current Windows candidate with WORLDLET_DISTRIBUTION_CHANNEL=steam first.');
for(const file of ['Worldlet.exe','resources/app.asar','resources/WorldletWeb/index.html','resources/GoogleOAuthClient.json','resources/HermesBootstrap/uv.exe','resources/agent-browser.exe'])
 if(!existsSync(path.join(payload,file)))throw Error('Incomplete candidate: '+file);
function inspect(directory:string){
 for(const entry of readdirSync(directory,{withFileTypes:true})){
  if(entry.isSymbolicLink())throw Error('Steam payload must not contain links.');
  if(/^(steam_appid\.txt|\.env(?:\..*)?|ssfn.*|loginusers\.vdf|config\.vdf)$/i.test(entry.name)||/\.(pfx|p12|key)$/i.test(entry.name))throw Error('Remove development credentials or Steam overrides from the candidate.');
  if(entry.isDirectory())inspect(path.join(directory,entry.name));
 }
}
inspect(payload);
const base=path.join(root,'dist/windows-steam');mkdirSync(base,{recursive:true});
const output=mkdtempSync(path.join(base,'candidate-'));
const quote=(value:string)=>{if(/["\r\n\0]/.test(value))throw Error('Invalid VDF value');return '"'+value.replaceAll('\\','/')+'"';};
writeFileSync(path.join(output,'depot.vdf'),`"DepotBuildConfig"
{
 "DepotID" "${depot}"
 "FileMapping" { "LocalPath" "*" "DepotPath" "." "recursive" "1" }
 "FileExclusion" "*.pdb"
}
`);
writeFileSync(path.join(output,'app.vdf'),`"AppBuild"
{
 "AppID" "${app}"
 "Desc" "Worldlet Windows ${identity.version} build ${identity.build} ${identity.sourceCommit}"
 "ContentRoot" ${quote(payload)}
 "BuildOutput" ${quote(path.join(output,'logs'))}
 "Preview" "1"
 "Depots" { "${depot}" "depot.vdf" }
}
`);
writeFileSync(path.join(output,'candidate.json'),JSON.stringify({...identity,appId:app,depotId:depot,preview:true,launchExecutable:'Worldlet.exe',workingDirectory:'.'},null,2)+'\n');
console.log(`SteamPipe preview configuration: ${path.join(output,'app.vdf')}`);
console.log('No build uploaded. Run with the official Steamworks ContentBuilder; Preview=1 checks without uploading. Keep this payload unchanged until the check/upload completes.');
