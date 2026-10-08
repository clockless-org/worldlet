// Engine identity probe (#1089): what a page and its server see from Worldlet's website session
// (Electron, `websiteSession` in platform/electron/src/modules/browser/surface.ts) and from any
// other Chromium engine given with --engine, such as the former CEF host's `cefsimple` or a stock
// Chromium. Each engine opens one loopback page that reports its own facts back over HTTP: no
// DevTools, no automation, no account and no external network. Prints the facts and the ones
// that differ from the website session. Results: platform/browser/INTEGRATION.md#google-sign-in-refusal.
//   node scripts/browser-engine-probe.ts [--engine <binary>]... [-- <switches for every engine>]
// Engines and Electron refuse to run as root without `--no-sandbox`; pass it after `--` only in a
// disposable container.
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {build} from 'esbuild';

const root=fileURLToPath(new URL('../',import.meta.url));
const electron=createRequire(import.meta.url)('electron') as unknown as string;
const argv=process.argv.slice(2),split=argv.indexOf('--');
const own=split<0?argv:argv.slice(0,split),extra=split<0?[]:argv.slice(split+1);
const engines=own.flatMap((arg,index)=>arg==='--engine'&&own[index+1]?[path.resolve(own[index+1])]:[]);

// Runs in the page. Only facts a site can read without a permission prompt.
const PROBE=`(async()=>{
 const wait=(value,ms=3000)=>Promise.race([Promise.resolve(value),new Promise(resolve=>setTimeout(()=>resolve('timeout'),ms))]);
 const safe=async run=>{try{return await wait(run());}catch(error){return 'error: '+error.name;}};
 const permission=name=>safe(async()=>(await navigator.permissions.query({name})).state);
 const chrome=window.chrome;
 return {
  userAgent:navigator.userAgent,webdriver:navigator.webdriver,languages:navigator.languages,
  brands:navigator.userAgentData?.brands??null,platform:navigator.userAgentData?.platform??null,
  windowChrome:chrome?Object.keys(chrome).sort():null,
  chromeMembers:{app:typeof chrome?.app,csi:typeof chrome?.csi,loadTimes:typeof chrome?.loadTimes,runtime:typeof chrome?.runtime},
  plugins:navigator.plugins.length,pdfViewerEnabled:navigator.pdfViewerEnabled,
  platformAuthenticator:await safe(()=>PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()),
  conditionalMediation:await safe(()=>PublicKeyCredential.isConditionalMediationAvailable()),
  notification:typeof Notification==='function'?Notification.permission:null,
  permissions:{notifications:await permission('notifications'),geolocation:await permission('geolocation'),storageAccess:await permission('storage-access')},
  apis:{identityCredential:typeof window.IdentityCredential,paymentRequest:typeof window.PaymentRequest,requestStorageAccess:typeof document.requestStorageAccess},
 };
})()`;

const server=http.createServer();
const pending=new Map<string,(value:unknown)=>void>();
server.on('request',(request,response)=>{
 const url=new URL(request.url??'/','http://localhost'),id=url.searchParams.get('id')??'';
 if(url.pathname==='/result'&&request.method==='POST'){
  let body='';request.on('data',chunk=>{body+=chunk;});
  request.on('end',()=>{response.end();try{pending.get(id)?.(JSON.parse(body));}catch{}});
  return;
 }
 if(url.pathname==='/page'){
  // The page's own request headers come back with the result.
  const headers=Object.fromEntries(Object.entries(request.headers).filter(([name])=>name==='user-agent'||name==='accept-language'||name.startsWith('sec-ch-')));
  response.setHeader('Content-Type','text/html');response.setHeader('Cache-Control','no-store');
  response.end(`<!doctype html><title>Engine probe</title><script>${PROBE}.then(facts=>({...facts,requestHeaders:${JSON.stringify(headers)}}),error=>({error:String(error)})).then(result=>fetch('/result?id=${encodeURIComponent(id)}',{method:'POST',body:JSON.stringify(result)}));</script>`);
  return;
 }
 response.writeHead(404).end();
});
await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=`http://localhost:${(server.address() as {port:number}).port}/page`;
const scratch=mkdtempSync(path.join(os.tmpdir(),'worldlet-engine-probe-'));

const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
function run(id:string,command:string,args:(url:string)=>string[]):Promise<unknown> {
 return new Promise(resolve=>{
  const child=spawn(command,args(`${base}?id=${encodeURIComponent(id)}`),{cwd:root,stdio:['ignore','ignore','pipe'],env});
  let log='';child.stderr.on('data',chunk=>{log=(log+chunk).slice(-2000);});
  const timer=setTimeout(()=>finish({error:'no report within 60 s',log}),60000);
  const finish=(value:unknown)=>{clearTimeout(timer);pending.delete(id);child.kill();resolve(value);};
  pending.set(id,finish);
  child.on('exit',code=>{if(pending.has(id))finish({error:`exited with ${code} before reporting`,log});});
 });
}

// Electron: the real website session in a sandboxed view, as page.ts creates it, in a disposable profile.
await build({entryPoints:[path.join(root,'platform/electron/src/modules/browser/surface.ts')],outfile:path.join(scratch,'surface.mjs'),bundle:true,platform:'node',format:'esm',target:'node24',external:['electron'],logLevel:'error',
 banner:{js:"import {createRequire as __createRequire} from 'node:module';const require=__createRequire(import.meta.url);"}});
writeFileSync(path.join(scratch,'main.mjs'),`import {app,BaseWindow,WebContentsView} from 'electron';
import {websiteSession} from './surface.mjs';
app.setPath('userData',${JSON.stringify(path.join(scratch,'electron-profile'))});
app.whenReady().then(()=>{
 const window=new BaseWindow({width:1200,height:800,show:true});
 const view=new WebContentsView({webPreferences:{session:websiteSession('personal',()=>{}),contextIsolation:true,sandbox:true,nodeIntegration:false,webSecurity:true}});
 window.contentView.addChildView(view);view.setBounds({x:0,y:0,width:1200,height:800});
 void view.webContents.loadURL(process.argv.at(-1));
});`);
const results:Record<string,unknown>={};
results['electron-website-session']=await run('electron',electron,url=>[...extra,path.join(scratch,'main.mjs'),url]);
for(const [index,engine] of engines.entries()){
 const profile=path.join(scratch,'engine-'+index);
 results[engine]=await run('engine-'+index,engine,url=>['--no-first-run',`--user-data-dir=${profile}`,`--root-cache-path=${profile}`,...extra,`--url=${url}`,url]);
}
server.close();rmSync(scratch,{recursive:true,force:true});

const reference=results['electron-website-session'] as Record<string,unknown>;
const differences=Object.fromEntries(engines.map(engine=>{
 const other=results[engine] as Record<string,unknown>;
 const keys=[...new Set([...Object.keys(reference??{}),...Object.keys(other??{})])];
 return [engine,keys.filter(key=>JSON.stringify(reference?.[key])!==JSON.stringify(other?.[key]))];
}));
console.log(JSON.stringify({results,differences},null,1));
