import {cpSync,existsSync,mkdirSync,mkdtempSync,readFileSync,writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';
import {git,lock} from './dev-workspace.ts';

// Package an already checked, self-contained candidate. Never sign with a
// developer certificate or install trust roots as a side effect of packaging.
const root=fileURLToPath(new URL('../',import.meta.url));
if(process.platform!=='win32')throw Error('MSIX packaging requires the Windows SDK.');
const test=process.argv.includes('--test'),payload=path.join(root,'dist/packages/Worldlet-win32-x64');
const identity=JSON.parse(readFileSync(path.join(payload,'build-identity.json'),'utf8'));
if(identity.sourceCommit!==git(root,'rev-parse','HEAD')||identity.platform!=='windows'||identity.architecture!=='x64'||identity.distributionChannel!=='microsoft-store')throw Error('Build a current Microsoft Store candidate first.');
if(!test&&(identity.sourceDirty||git(root,'status','--porcelain')))throw Error('Store submissions require committed clean source.');
const store=JSON.parse(readFileSync(path.join(root,'platform/electron/distribution/windows/store-identity.json'),'utf8'));
const name=test?'Worldlet.MSIXTest':store.name;
const publisher=test?'CN=Worldlet MSIX Test':store.publisher;
const display=test?'Worldlet MSIX Test':'Worldlet';
const publisherDisplay=test?'Worldlet Local Test':store.publisherDisplayName;
if(!name||!publisher||!publisherDisplay||! /^[A-Za-z0-9.-]{3,50}$/.test(name)||!publisher.startsWith('CN='))throw Error('Supply the exact identity, publisher and publisher display name from Partner Center.');
if(!/^\d+\.\d+\.\d+$/.test(identity.version)||!Number.isInteger(identity.build)||identity.build<1||identity.build>65535)throw Error('Invalid candidate version.');
// Store reserves the fourth component; the independent Windows counter orders updates.
const version=`${identity.version.split('.')[0]}.${identity.build}.0.0`;
for(const file of ['Worldlet.exe','resources/app.asar','resources/WorldletWeb/index.html','resources/WorldletWeb/shared-core.js','resources/GoogleOAuthClient.json','resources/HermesBootstrap/uv.exe','resources/agent-browser.exe'])if(!existsSync(path.join(payload,file)))throw Error('Incomplete candidate: '+file);
const sdk=process.env.WORLDLET_WINDOWS_SDK_BIN||'C:/Program Files (x86)/Windows Kits/10/bin/10.0.26100.0/x64';
const makeappx=path.join(sdk,'makeappx.exe');
if(!existsSync(makeappx))throw Error('Set WORLDLET_WINDOWS_SDK_BIN to the installed SDK x64 tools.');
const release=lock(path.join(root,'.local/windows-msix.lock'));
try{
 const output=path.join(root,'dist/windows-msix');mkdirSync(output,{recursive:true});
 const staging=mkdtempSync(path.join(output,test?'test-':'store-'));
 cpSync(payload,path.join(staging,'app'),{recursive:true});
 const assets=path.join(staging,'Assets');mkdirSync(assets);
 for(const size of [44,50,150])await sharp(path.join(root,'resources/styles/builtin/assets/brand/icon-512.png')).resize(size,size).png().toFile(path.join(assets,`Logo${size}.png`));
 const xml=(value:string)=>value.replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;').replaceAll('>','&gt;');
 writeFileSync(path.join(staging,'AppxManifest.xml'),`<?xml version="1.0" encoding="utf-8"?>
<Package xmlns="http://schemas.microsoft.com/appx/manifest/foundation/windows10" xmlns:uap="http://schemas.microsoft.com/appx/manifest/uap/windows10" xmlns:rescap="http://schemas.microsoft.com/appx/manifest/foundation/windows10/restrictedcapabilities" IgnorableNamespaces="uap rescap">
 <Identity Name="${xml(name)}" Publisher="${xml(publisher)}" Version="${version}" ProcessorArchitecture="x64" />
 <Properties><DisplayName>${display}</DisplayName><PublisherDisplayName>${xml(publisherDisplay)}</PublisherDisplayName><Logo>Assets\\Logo50.png</Logo></Properties>
 <Dependencies><TargetDeviceFamily Name="Windows.Desktop" MinVersion="10.0.17763.0" MaxVersionTested="10.0.26100.0" /></Dependencies>
 <Resources><Resource Language="en-us" /></Resources>
 <Applications><Application Id="Worldlet" Executable="app\\Worldlet.exe" EntryPoint="Windows.FullTrustApplication"><uap:VisualElements DisplayName="${display}" Description="Your personal AI world" Square150x150Logo="Assets\\Logo150.png" Square44x44Logo="Assets\\Logo44.png" BackgroundColor="transparent" /></Application></Applications>
 <Capabilities><rescap:Capability Name="runFullTrust" /><DeviceCapability Name="microphone" /></Capabilities>
</Package>
`);
 const file=staging+'.msix';
 const result=spawnSync(makeappx,['pack','/d',staging,'/p',file],{stdio:'inherit'});
 if(result.error)throw result.error;if(result.status!==0)throw Error('MSIX schema/package validation failed.');
 const sha256=createHash('sha256').update(readFileSync(file)).digest('hex');
 writeFileSync(file+'.sha256',`${sha256}  ${path.basename(file)}\n`);
 writeFileSync(file+'.json',JSON.stringify({...identity,packageName:name,packageVersion:version,testOnly:test,signed:false,sha256,staging},null,2)+'\n');
 console.log(`Built unsigned ${test?'local test':'Store submission candidate'} MSIX: ${file}`);
 console.log('Package validation is not installed-runtime acceptance or Store certification.');
}finally{release();}
