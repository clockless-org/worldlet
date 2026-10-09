// Browser check: kept website pages are released under memory pressure (#1024). Injected memory
// readings release the oldest kept page first, one per reading, never the visible or the
// picture-in-picture page, and diagnostics get the reason without the page. The real sampler
// reads Electron's process and system memory. Runs in an Electron main process:
// npm run test:electron -- modules/browser
// It also feeds Google's sign-in refusal page (#1089) as the visible page's URL: the panel reports
// the refusal instead of the page and the browser action opens YouTube, never Google's page.
// Engine identity (#1089): a real website session on a loopback page sends the user agent and
// UA client hint headers that its own JavaScript reports, and a page that starts navigating to an
// account sign-in host loses its DevTools session until it leaves.
import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import {app,BaseWindow,session} from 'electron';
import {PAGE_MEMORY,chromiumBrands,chromiumUserAgent,clientHintHeaders,signInRejectedMessage,withClientHints} from '../../../../../core/browser/index.ts';
import {HOMES,signInPage} from './rules.ts';
import {BrowserDevice} from './device.ts';
import {PageView} from './page.ts';
import {presentEngine} from './surface.ts';
import type {Host} from '../../host/types.ts';

const recorded:{message:string;operation:string}[]=[],emitted:any[]=[];
const host={
 profile:{channel:'dev',worktree:'',root:'',title:'Worldlet Check',webRoot:path.resolve('dist/WorldletWeb'),resources:process.cwd(),smoke:false},
 store:{sampleEnabled:()=>false,writable:false},
 page:{call:async(name:string,event:unknown)=>{if(name==='worldletBrowser')emitted.push(event);},event:()=>{},documentEvent:()=>{},ready:()=>false},
 window:()=>null,worldView:()=>null,
 diagnostics:{record:(error:unknown,operation='host')=>{recorded.push({message:(error as Error).message,operation});},log:()=>{}}
} as unknown as Host;
const closed:string[]=[];
const page=(name:string)=>({name,close:()=>{closed.push(name);}});
const kept=(name:string)=>({view:page(name),platform:'web',requestedURL:new URL('https://example.com/'+name+'?private=1')});
const device=new BrowserDevice(host,{binary:()=>'',python:()=>'',script:''} as any);
// Fake pages in the device's own fields: no window or renderer is needed for the release order.
const state=device as any;
const ample={freeMB:8192,totalMB:16384,appMB:900},low={freeMB:300,totalMB:16384,appMB:900},heavy={freeMB:8192,totalMB:16384,appMB:PAGE_MEMORY.maxAppMB+100};
try{
 assert(app.isReady(),'runs in an Electron main process');
 const reading=device.sampleMemory();
 assert(reading&&reading.totalMB>0&&reading.freeMB>=0&&reading.freeMB<=reading.totalMB&&reading.appMB>0,'Electron memory reading: '+JSON.stringify(reading));
 console.log('PASS the sampler reads free system memory and the app footprint from Electron');

 state.browser=page('visible');
 state.pipPage={...kept('pip'),key:'personal:youtube',applet:'youtube',press:null};
 state.parked.set('personal:x',kept('oldest'));state.parked.set('personal:netflix',kept('newer'));
 assert.equal(device.relieveMemory(ample),null);assert.equal(device.relieveMemory(null),null);
 assert.deepEqual(closed,[],'no pressure, no release');
 assert.equal(device.relieveMemory(low),'lowMemory');
 assert.deepEqual(closed,['oldest'],'the oldest kept page goes first, one per reading');
 assert.equal(device.relieveMemory(heavy),'appFootprint');
 assert.deepEqual(closed,['oldest','newer']);assert.equal(state.parked.size,0);
 assert.equal(device.relieveMemory(low),null,'nothing left to release');
 assert.deepEqual(closed,['oldest','newer'],'the visible and picture-in-picture pages stay');
 // Even listed among kept pages, the visible and picture-in-picture pages are not released.
 state.parked.set('personal:youtube',{...state.pipPage});state.parked.set('personal:browser',{view:state.browser,platform:'web',requestedURL:null});state.parked.set('personal:tiktok',kept('kept'));
 assert.equal(device.relieveMemory(low),'lowMemory');
 assert.deepEqual(closed,['oldest','newer','kept']);assert.equal(device.relieveMemory(low),null);
 console.log('PASS memory pressure releases the oldest kept page first and never the visible or picture-in-picture page');

 assert.deepEqual(recorded.map(row=>row.operation),['keptPageRelease','keptPageRelease','keptPageRelease']);
 assert.deepEqual(recorded.map(row=>row.message),['Kept page released under memory pressure (lowMemory).','Kept page released under memory pressure (appFootprint).','Kept page released under memory pressure (lowMemory).']);
 console.log('PASS diagnostics record the release reason without the page');

 // While a page is kept the sampler runs on its own timer; stopping clears it.
 state.parked.clear();state.parked.set('personal:x',kept('watched'));state.watchMemory();
 assert(state.memoryTimer,'a kept page starts the memory sampler');
 state.browser=null;state.pipPage=null;device.stop();
 assert.equal(state.memoryTimer,null,'stop ends the sampler');assert.equal(closed.at(-1),'watched');
 console.log(`PASS the sampler runs every ${PAGE_MEMORY.sampleMs/1000} s only while pages are kept`);

 const rejected='https://accounts.google.com/v3/signin/rejected?continue=https%3A%2F%2Fwww.youtube.com%2F&flowName=GlifWebSignIn';
 state.platform='youtube';state.pageIssue=null;recorded.length=0;emitted.length=0;
 state.browser={url:rejected,title:'Sign in - Google Accounts',isLoading:false,canGoBack:true,canGoForward:false,close(){}};
 device.status();device.status();
 assert.deepEqual(emitted,Array(2).fill({phase:'error',platform:'youtube',message:signInRejectedMessage('youtube'),externalSignIn:true,signIn:'google'}),'the refusal replaces the page event');
 assert.deepEqual(recorded,[{message:'google-sign-in-rejected',operation:'browser'}],'recorded once, without the URL');
 assert.equal(state.externalDestination('youtube'),HOMES.youtube,'the browser action opens YouTube, not Google’s page');
 state.pageIssue=null;emitted.length=0;state.browser.url='https://accounts.google.com/v3/signin/identifier?continue=https%3A%2F%2Fwww.youtube.com%2F';
 device.status();assert.equal(emitted[0]?.phase,'page','the sign-in steps themselves stay ordinary pages');
 // Navigating away clears the refusal (onNavigation); a second refusal is reported again.
 state.browser.url=rejected;state.pageIssue=null;emitted.length=0;device.status();
 assert.equal(emitted[0]?.signIn,'google','a later refusal is reported again');
 assert.equal(recorded.length,2,'each refusal is recorded once');
 state.browser.url=HOMES.youtube;state.pageIssue=null;emitted.length=0;device.status();
 assert.equal(emitted[0]?.phase,'page','after the refusal YouTube is an ordinary page again');
 state.browser=null;
 console.log('PASS Google’s refusal page becomes an explained error with a system-browser action to YouTube');
 // The panel's Home button opens a site-locked Applet's own home page (owner report 2026-10-08:
 // YouTube's Home said 'Use a valid page URL for this Applet.'); other sites stay refused.
 const loads:string[]=[];
 state.browser={url:'https://www.youtube.com/watch?v=x',title:'',isLoading:false,hidden:false,canGoBack:true,canGoForward:false,load(url:string){loads.push(url);},close(){}};
 state.platform='youtube';state.requestedURL=null;
 assert.deepEqual(await device.command('open',{url:HOMES.youtube},false),{ok:true});
 assert.deepEqual(loads,[HOMES.youtube],'YouTube Home loads youtube.com');
 await assert.rejects(device.command('open',{url:'https://example.com/'},false),/valid page URL/,'YouTube does not open another site');
 state.platform='tiktok';assert.deepEqual(await device.command('open',{url:HOMES.tiktok},false),{ok:true});
 state.platform='x';await assert.rejects(device.command('open',{url:'https://x.com/home?ref=1'},false),/valid page URL/,'X keeps its plain-page rule');
 state.browser=null;
 console.log('PASS Home opens a site-locked Applet’s own home page, never another site');

 assert.deepEqual(chromiumBrands('152.0.7977.130'),[{brand:'Not?A_Brand',version:'24'},{brand:'Chromium',version:'152'}]);
 assert.deepEqual(chromiumBrands('153.0.1.2').map(item=>item.brand),['Chromium','Not_A Brand'],'odd majors put Chromium first');
 assert.deepEqual(chromiumBrands('x'),[]);
 assert.equal(chromiumUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Worldlet/2026.1001.1071 Chrome/152.0.7977.130 Electron/44.5.1 Safari/537.36'),'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36');
 assert.deepEqual(clientHintHeaders({chromium:'152.0.7977.130',os:'win32'}),{'sec-ch-ua':'"Not?A_Brand";v="24", "Chromium";v="152"','sec-ch-ua-mobile':'?0','sec-ch-ua-platform':'"Windows"'});
 assert.equal(withClientHints('http://example.com/',{},{chromium:'152',os:'darwin'}),null,'never to insecure origins');
 assert.equal(withClientHints('https://example.com/',{'Sec-CH-UA':'x','Sec-CH-UA-Mobile':'?0','Sec-CH-UA-Platform':'"macOS"'},{chromium:'152',os:'darwin'}),null,'headers the engine sent stay');
 assert.equal(signInPage('https://accounts.google.com/v3/signin/identifier'),true);assert.equal(signInPage('https://www.youtube.com/'),false);
 console.log('PASS the engine identity rules: Chromium brands, reduced user agent, secure origins only');

 // The real engine on a loopback page (no account, no network).
 const requests:Record<string,string|string[]|undefined>[]=[];
 const server=http.createServer((request,response)=>{
  if(request.url==='/favicon.ico'){response.writeHead(404).end();return;}
  requests.push(request.headers);response.setHeader('Content-Type','text/html');response.end('<title>check</title>');
 });
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 const window=new BaseWindow({show:false,width:400,height:300});
 try{
  const port=(server.address() as {port:number}).port,local=`http://localhost:${port}/`;
  const website=session.fromPartition('website-identity-check-'+process.pid);
  const original=website.getUserAgent();presentEngine(website);
  const view=new PageView(window.contentView,website,path.resolve('dist/WorldletWeb'),false,'about:blank');
  const contents=view.contents!;
  await contents.loadURL(local);
  const seen=await contents.executeJavaScript('({ua:navigator.userAgent,brands:navigator.userAgentData.brands,mobile:navigator.userAgentData.mobile,platform:navigator.userAgentData.platform})');
  const sent=requests.at(-1)!;
  assert.equal(seen.ua,chromiumUserAgent(original));assert.doesNotMatch(seen.ua,/Electron|Worldlet/i);assert.match(seen.ua,/ Chrome\/\d+\.0\.0\.0 /);
  assert.equal(sent['user-agent'],seen.ua,'the request and the page report one user agent');
  assert.deepEqual(seen.brands,chromiumBrands(process.versions.chrome),'the rule reproduces the engine’s own brands');
  assert.equal(sent['sec-ch-ua'],seen.brands.map((item:{brand:string;version:string})=>`"${item.brand}";v="${item.version}"`).join(', '),'Sec-CH-UA matches navigator.userAgentData.brands');
  assert.equal(sent['sec-ch-ua-mobile'],seen.mobile?'?1':'?0');
  assert.equal(sent['sec-ch-ua-platform'],JSON.stringify(seen.platform));
  console.log('PASS a website session sends the user agent and UA client hints its pages report: '+sent['sec-ch-ua']);

  // A passkey request (passkey-watch.js, owner report 2026-10-08: LinkedIn) is reported once, so the host reopens the
  // page on the engine; a password-only page reports nothing, and the request itself goes on unchanged.
  // The passkey requests carry an aborted signal: on Windows a live one reaches the Windows Security passkey prompt,
  // which stays open and keeps Electron from exiting (RC 3d579250); the watch reports before the request goes on.
  let passkeys=0;view.onPasskey=()=>{passkeys++;};
  await contents.loadURL(local+'passkey');
  assert.equal(await contents.executeJavaScript('window.__worldletPasskeyWatch===true'),true,'the watch is in the page before its own scripts');
  await contents.executeJavaScript("navigator.credentials.get({password:true}).catch(()=>{});true");
  await new Promise(resolve=>setTimeout(resolve,300));
  assert.equal(passkeys,0,'a request without a passkey is not one');
  await contents.executeJavaScript("navigator.credentials.get({publicKey:{challenge:new Uint8Array(16),timeout:2000},mediation:'conditional',signal:AbortSignal.abort()}).catch(()=>{});true");
  for(let i=0;i<100&&!passkeys;i++)await new Promise(resolve=>setTimeout(resolve,50));
  assert.equal(passkeys,1,'a passkey request is reported');
  await contents.executeJavaScript("navigator.credentials.get({publicKey:{challenge:new Uint8Array(16),timeout:2000},signal:AbortSignal.abort()}).catch(()=>{});true");
  await new Promise(resolve=>setTimeout(resolve,300));
  assert.equal(passkeys,1,'once per page');
  view.onPasskey=()=>{};
  console.log('PASS a passkey request on Electron\'s views is reported once, before the page\'s own scripts could hide it');

  assert.deepEqual(await view.cdp('Runtime.evaluate',{expression:'1+1',returnByValue:true}),{result:{type:'number',value:2,description:'2'}});
  assert.equal(contents.debugger.isAttached(),true);
  contents.emit('did-start-navigation',{url:'https://accounts.google.com/v3/signin/identifier?continue=https%3A%2F%2Fwww.youtube.com%2F',isMainFrame:true,isSameDocument:false,frame:null});
  assert.equal(contents.debugger.isAttached(),false,'DevTools detaches as a sign-in page starts');
  assert.equal(view.isShielded,true);
  await assert.rejects(view.cdp('Runtime.evaluate',{expression:'1'}),{name:'AbortError'},'no inspection on the sign-in page');
  contents.emit('did-start-navigation',{url:'https://accounts.google.com/frame',isMainFrame:false,isSameDocument:false,frame:null});
  assert.equal(view.isShielded,true,'a subframe does not lift it');
  await contents.loadURL(local+'again');
  assert.equal(view.isShielded,false,'the next ordinary page is inspected again');
  assert.equal((await view.cdp('Runtime.evaluate',{expression:'2+2',returnByValue:true})).result?.value,4);
  console.log('PASS account sign-in pages get no DevTools session; the next page does');
  view.close();
 }finally{window.destroy();server.close();}
}catch(error){console.error('FAIL browser:',error);process.exitCode=1;}
