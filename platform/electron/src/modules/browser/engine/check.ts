// Website engine check (#1170): the CEF engine renders a page into the panel and takes the person's
// input, on a disposable profile with the development rehearsal site (no network, no account).
// npm run test:electron -- modules/browser/engine
// - the engine's own URL rules agree with contracts/fixtures/parity (public pages, http:// upgrades, popups);
// - a page's frames reach the surface through shared GPU surfaces, on Linux shared-memory frames
//   (pixels read back from the view);
// - typing, an input-method composition and a click reach the page, and one Backspace or arrow acts once;
// - a popup stacks over its opener with the focus and Back closes it; in a Browser tab's page a link for a new tab opens the next tab; a cross-site navigation keeps the focus
//   (else the page takes keys without a caret);
// - a link the rules keep out (an app link, a window to a non-public address) is reported, not silent;
// - Fox's DevTools relay refuses browser-wide commands;
// - WebAuthn answers in the page, and whether phone passkeys are offered here is reported (#1177);
// - shown smaller (task picture in picture, #1175) the page keeps its size and reports presses, Fox's
//   driver still clicks its elements at the page's own coordinates, and frame rates follow
//   pageFrameRate (full in the panel, lower in the window, low but not zero out of sight);
// - Worldlet's own CEF build plays H.264/AAC; the standard build reports it cannot (#1174);
// - with the World window away for the desktop Companion, the panel moves Fox's page into a window
//   of its own beside the Companion and back, still working, and its press and close are reported;
// - a meeting site gets the camera and microphone once the person and the OS allow them; other sites do not;
// - several pages at once (#1176): two pages render and take input each on its own, two Fox drivers
//   run at once on separate pages, and one page plays sound at a time.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {BaseWindow,WebContentsView,screen,session} from 'electron';
import {httpsUpgrade,opensAsTab,popupAllowed,publicPage} from '../rules.ts';
import {TASK_PICTURE_IN_PICTURE,desktopTaskPictureInPicturePlacement,pageFrameRate,taskPictureInPictureAspect} from '../../../../../../core/browser/index.ts';
import {BrowserDevice} from '../device.ts';
import {Cancelled} from '../page.ts';
import type {Host} from '../../../host/types.ts';
import {CefPageView,displayRefresh} from './page.ts';
import {cookieBridge} from '../cookie-bridge.ts';
import {engineInfo,locateEngine,WebEngine} from './process.ts';
import type {Profile} from '../../../profile.ts';

const root=process.cwd();
const profile:Profile={channel:'dev',worktree:'',root:process.env.WORLDLET_CHECK_ROOT||fs.mkdtempSync(path.join(root,'.local/engine-check-')),title:'Worldlet Check',webRoot:path.resolve('dist/WorldletWeb'),resources:root,smoke:false};
process.env.WORLDLET_WEB_SURFACE_PRELOAD=path.resolve('dist/electron/web-surface-preload.cjs');
process.env.WORLDLET_PROFILE_ROOT=profile.root;
// Chromium's fake camera and microphone for the call step (7b).
process.env.WORLDLET_WEB_FAKE_MEDIA='1';
const wait=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
async function until<T>(label:string,read:()=>T|Promise<T>,timeout=15000):Promise<T> {
 const end=Date.now()+timeout;
 for(;;){const value=await read();if(value)return value;if(Date.now()>end)throw Error('timed out: '+label);await wait(50);}
}

const files=locateEngine(profile);
if(!files){
 // CEF is pinned for macOS, Windows and Linux x64 (platform/web-engine/cef.json).
 const pinned=['darwin','win32'].includes(process.platform)||(process.platform==='linux'&&process.arch==='x64');
 assert(!pinned||process.env.WORLDLET_SKIP_WEB_ENGINE,'the website engine is built for this host (scripts/build-web-engine.ts)');
 console.log('PASS the website engine is not built for '+process.platform+'-'+process.arch);
}else{
 const engine=new WebEngine(profile,files);
 // Shown: the panel's pixels are read back from a painting window.
 const window=new BaseWindow({width:900,height:700,show:true});
 let page:CefPageView|null=null;
 try{
  // 1. Rules: the engine answers navigations and popups itself, as rules.ts does.
  const fixture=JSON.parse(fs.readFileSync('contracts/fixtures/parity/browser-public-page.json','utf8'));
  const popups=JSON.parse(fs.readFileSync('contracts/fixtures/parity/browser-popup.json','utf8'));
  const urls=[...fixture.allowed,...fixture.refused];
  const upgrades=Object.keys(fixture.upgraded);
  const tabs=JSON.parse(fs.readFileSync('contracts/fixtures/parity/browser-tab.json','utf8'));
  const answers=await engine.policy(urls,popups.cases,upgrades,tabs.cases);
  urls.forEach((url:string,index:number)=>{
   const expected=fixture.allowed.includes(url);
   assert.equal(answers.public[index],expected,'engine public page '+url);
   assert.equal(publicPage(url),expected,'rules.ts public page '+url);
  });
  // An http:// page on a public host opens at its https:// address (Xiaohongshu's sign-in returns to http://).
  upgrades.forEach((url,index)=>{
   assert.equal(answers.upgrade[index]||null,fixture.upgraded[url],'engine https upgrade '+url);
   assert.equal(httpsUpgrade(url),fixture.upgraded[url],'rules.ts https upgrade '+url);
  });
  popups.cases.forEach((entry:any,index:number)=>{
   assert.equal(answers.popup[index],entry.allowed,'engine popup '+JSON.stringify(entry));
   assert.equal(popupAllowed(entry.gesture,entry.open,entry.url),entry.allowed,'rules.ts popup '+JSON.stringify(entry));
  });
  tabs.cases.forEach((entry:any,index:number)=>{
   assert.equal(answers.tab[index],entry.opens,'engine new tab '+JSON.stringify(entry));
   assert.equal(opensAsTab(entry.gesture,entry.tab,entry.url),entry.opens,'rules.ts new tab '+JSON.stringify(entry));
  });
  console.log(`PASS the engine's URL, https upgrade and popup and new-tab rules match the parity fixtures (${urls.length} addresses, ${upgrades.length} upgrades, ${popups.cases.length} popups, ${tabs.cases.length} new tabs) on CEF ${engine.version?.cef}`);

  // 1b. One sign-in across both engines (owner report 2026-10-08, cookie-bridge.ts): a cookie either storage sets,
  // changes or deletes reaches the other; a just-started engine and Electron's storage each gain what they lack.
  {
   const electron=session.fromPartition('persist:website-practice'),now=Math.round(Date.now()/1000);
   const inElectron=async(name:string)=>(await electron.cookies.get({name}))[0]??null;
   const inEngine=async(name:string)=>(await engine.cookies('practice'))?.find(cookie=>cookie.name===name)??null;
   engine.setCookies('practice',[{url:'https://demo.worldlet.test/',name:'engine_sign_in',value:'e1',domain:'',path:'/',secure:true,httpOnly:true,sameSite:'lax',expires:now+3600}],[]);
   const listed=await until('the engine lists the cookie it was given',()=>inEngine('engine_sign_in'));
   assert.deepEqual([listed.domain,listed.path,listed.secure,listed.httpOnly,listed.sameSite,Math.round(listed.expires)],['demo.worldlet.test','/',true,true,'lax',now+3600]);
   await electron.cookies.set({url:'https://demo.worldlet.test/',name:'electron_sign_in',value:'v1',secure:true,httpOnly:true,expirationDate:now+3600});
   const bridge=cookieBridge('practice',engine);
   await bridge.beforeEnginePage(()=>false);
   await until('the engine gains Electron\'s cookie',async()=>(await inEngine('electron_sign_in'))?.value==='v1');
   await until('Electron gains the engine\'s cookie',async()=>(await inElectron('engine_sign_in'))?.value==='e1');
   assert.equal((await inElectron('engine_sign_in'))?.httpOnly,true,'the engine\'s HttpOnly cookie stays HttpOnly in Electron');
   await electron.cookies.set({url:'https://demo.worldlet.test/',name:'electron_sign_in',value:'v2',secure:true,httpOnly:true,expirationDate:now+3600});
   await until('a change in Electron reaches the engine',async()=>(await inEngine('electron_sign_in'))?.value==='v2');
   engine.setCookies('practice',[{url:'https://demo.worldlet.test/',name:'engine_sign_in',value:'e2',domain:'',path:'/',secure:true,httpOnly:true,sameSite:'lax',expires:now+3600}],[]);
   await until('a change in the engine reaches Electron',async()=>{await bridge.pull();return (await inElectron('engine_sign_in'))?.value==='e2';});
   engine.setCookies('practice',[],[{url:'https://demo.worldlet.test/',name:'engine_sign_in'}]);
   await until('a sign-out in the engine reaches Electron',async()=>{await bridge.pull();return !(await inElectron('engine_sign_in'));});
   await electron.cookies.remove('https://demo.worldlet.test/','electron_sign_in');
   await until('a sign-out in Electron reaches the engine',async()=>!(await inEngine('electron_sign_in')));
   console.log('PASS one sign-in across both engines: cookies set, changed and deleted on either side reach the other');
  }

  // 2. A page renders into the panel.
  let loads=0;
  page=new CefPageView({engine,parent:window.contentView,window:()=>window,scope:'practice',webRoot:profile.webRoot,demo:true,url:'https://demo.worldlet.test/brightsmile',preload:process.env.WORLDLET_WEB_SURFACE_PRELOAD!,onDownload:()=>{}});
  page.onLoaded=()=>{loads++;};
  page.setFrame({x:40,y:30,width:800,height:600});page.setHidden(false);
  await until('the rehearsal page loads',()=>loads>0&&!page!.isLoading&&page!.url==='https://demo.worldlet.test/brightsmile',30000);
  // The page starts blank until its document scripts are installed; Back never returns there.
  await until('the first page has nothing to go Back to',()=>!page!.canGoBack,5000);
  assert.equal(page.url,'https://demo.worldlet.test/brightsmile');
  // The test page: blue, with a field and a button that opens a popup; clicks are counted.
  const testPage=`document.documentElement.innerHTML='<head></head><body style="margin:0;background:rgb(0,128,255)"><input id=field style="position:absolute;left:100px;top:100px;width:300px;height:40px"><button id=open style="position:absolute;left:100px;top:200px;width:200px;height:60px">Open</button></body>';
window.clicks=0;document.addEventListener('click',()=>{window.clicks++;});
document.getElementById('open').addEventListener('click',()=>{window.open('about:blank','_blank');});`;
  const facts=await page.evaluate(testPage+`
return {chrome:Object.keys(window.chrome||{}),width:innerWidth,height:innerHeight,ua:navigator.userAgent};`,{},{isolated:false});
  assert.deepEqual(facts.chrome,['loadTimes','csi','app'],'Chrome\'s own layer is present: '+JSON.stringify(facts.chrome));
  assert.deepEqual([facts.width,facts.height],[800,600],'the page has the panel\'s size');
  assert.match(facts.ua,/Chrome\/\d+\.0\.0\.0 Safari\/537\.36$/,'the engine keeps Chromium\'s own user agent');
  // Phone passkeys (hybrid: scan the QR code, then Bluetooth) need no Apple entitlement (#1177). Chromium
  // offers them only where Bluetooth is on and allowed, which a check host need not have, so it is reported.
  // On macOS asking for the capabilities opens Bluetooth, whose permission prompt would wait on the host.
  const webauthn:{secure:boolean,api:boolean,caps:Record<string,boolean>|null}=await page.evaluate(`const api=typeof window.PublicKeyCredential==='function';
return Promise.resolve(${process.platform==='darwin'?'null':'api&&PublicKeyCredential.getClientCapabilities?.()'}).then(caps=>({secure:isSecureContext,api,caps:caps||null}));`,{},{isolated:false});
  assert.ok(webauthn.secure&&webauthn.api,'WebAuthn is available in the page');
  if(process.platform!=='darwin')assert.equal(typeof webauthn.caps?.hybridTransport,'boolean','the engine reports its WebAuthn capabilities');
  console.log('PASS WebAuthn is available'+(webauthn.caps?'; phone passkeys '+(webauthn.caps.hybridTransport?'offered':'not offered here (Bluetooth off or absent)')+', platform passkeys '+(webauthn.caps.passkeyPlatformAuthenticator?'offered':'not offered'):''));
  const surface=(page as any).surface;
  // A rejected capture (Windows UnknownVizError while the view has no compositor frame yet, RC b10523a0, #1218) is
  // retried until the wait ends, then reported with the pixel.
  let captureError='';
  const pixel=async()=>{
   const image=await surface.contents.capturePage().catch((error:Error)=>{captureError=error.message;return null;});
   if(!image)return null;const size=image.getSize();if(!size.width)return null;
   const bitmap=image.toBitmap();const i=(Math.floor(size.height/2)*size.width+Math.floor(size.width/2))*4;return [bitmap[i+2],bitmap[i+1],bitmap[i]];
  };
  let seen:number[]|null=null;
  const color=await until('the page\'s pixels reach the panel',async()=>{const value=seen=await pixel();return value&&Math.abs(value[0]-0)<8&&Math.abs(value[1]-128)<8&&Math.abs(value[2]-255)<8?value:null;})
   .catch(error=>{throw Error(error.message+' (panel pixel '+JSON.stringify(seen)+', surface '+JSON.stringify(surface.lastError)+(captureError?', capture '+JSON.stringify(captureError):'')+')');});
  console.log('PASS the page renders through '+(process.platform==='linux'?'shared-memory frames':'shared GPU surfaces')+' into the panel ('+color.join(',')+'), with Chrome\'s own layer and the panel\'s size');

  // 3. Input reaches the page.
  await page.evaluate("document.getElementById('field').focus();return true;",{},{isolated:false});
  surface.send({t:'focus'});
  await wait(200);
  for(const keyCode of ['H','i'])for(const type of ['keyDown','char','keyUp'] as const)surface.contents.sendInputEvent({type,keyCode,modifiers:keyCode==='H'?['shift']:[]});
  await until('typed keys reach the field',async()=>await page!.evaluate("return document.getElementById('field').value;",{},{isolated:false})==='Hi');
  // The surface reports blur when its window loses the system's focus (another app's window may take it
  // during a run), and a page without focus rightly drops a composition: focus it again first.
  {const view=page as any;view.engine.send({t:'focus',id:view.top.id,focus:true});}await wait(150);
  await surface.contents.executeJavaScript("(()=>{const input=document.getElementById('input');input.dispatchEvent(new CompositionEvent('compositionstart',{data:''}));input.dispatchEvent(new CompositionEvent('compositionupdate',{data:'ni'}));input.dispatchEvent(new CompositionEvent('compositionend',{data:'你'}));})()");
  let last='';
  const typed=await until('typed text reaches the field',async()=>{const value=await page!.evaluate("return document.getElementById('field').value;",{},{isolated:false});last=value;return value==='Hi你'?value:null;}).catch(async error=>{throw Error(error.message+' (field '+JSON.stringify(last)+', surface focus '+await surface.contents.executeJavaScript('document.activeElement?.id+":"+document.hasFocus()')+')');});
  // One Backspace deletes one character and one arrow moves one place: on macOS CEF read a key up
  // without a character as another key press, so Backspace deleted two.
  const fieldValue=()=>page!.evaluate("return document.getElementById('field').value;",{},{isolated:false}) as Promise<string>;
  const press=(keyCode:string)=>{for(const type of ['keyDown','keyUp'] as const)surface.contents.sendInputEvent({type,keyCode});};
  press('Backspace');await wait(300);
  await until('one Backspace deletes one character',async()=>{last=await fieldValue();return last==='Hi'?last:null;}).catch(error=>{throw Error(error.message+' (field '+JSON.stringify(last)+')');});
  press('Left');
  for(const type of ['keyDown','char','keyUp'] as const)surface.contents.sendInputEvent({type,keyCode:'X',modifiers:['shift']});
  await until('one arrow moves the caret one place',async()=>{last=await fieldValue();return last==='HXi'?last:null;}).catch(error=>{throw Error(error.message+' (field '+JSON.stringify(last)+')');});
  const point=(x:number,y:number)=>({x:Math.round(x),y:Math.round(y)});
  const click=(x:number,y:number)=>{for(const type of ['mouseDown','mouseUp'] as const)surface.contents.sendInputEvent({type,...point(x,y),button:'left',clickCount:1});};
  click(700,500);
  await until('a click reaches the page',async()=>await page!.evaluate('return window.clicks;',{},{isolated:false})>=1);
  console.log('PASS typing ('+JSON.stringify(typed)+' with an input-method composition), one Backspace and one arrow at a time, and clicks reach the page');

  // 4. A popup stacks over its opener; Back closes it.
  // The popup takes the surface's focus, or it would take keys without drawing a caret. Asked from the
  // moment it opens: until the engine has made and loaded it, a command to it is cancelled (the page
  // changed), and is asked again (RC 41c18a7e).
  const focused=()=>page!.evaluate('return document.hasFocus();',{},{isolated:false}).catch(error=>{if(error instanceof Cancelled)return false;throw error;});
  let popupChanges:boolean[]=[],popupFocus:Promise<unknown>|null=null;
  page.onPopupChange=active=>{popupChanges.push(active);if(active)popupFocus??=until('the popup has the focus',focused);};
  // As the surface reports its focus (it may have lost the system's focus during a run, as above).
  const focusSurface=()=>(page as any).input({t:'focus',focus:true});
  focusSurface();
  click(200,230);
  await until('the popup opens',()=>page!.hasPopup).catch(async error=>{throw Error(error.message+' (page clicks '+await page!.evaluate('return window.clicks;',{},{isolated:false})+')');});
  await popupFocus;
  page.goBack();
  await until('Back closes the popup',()=>!page!.hasPopup);
  assert.deepEqual(popupChanges,[true,false]);
  await until('the opener has the focus again',async()=>await page!.evaluate('return document.hasFocus();',{},{isolated:false}));
  console.log('PASS a popup stacks over its opener with the focus, and Back without history closes it');

  // 4b. A link the rules keep out is reported, never silent (owner report 2026-10-06): an app link the person
  // follows, and a window they open to a non-public address.
  const refused:any[]=[];page.onRefused=value=>refused.push(value);
  await page.evaluate(`const links=document.createElement('div');links.innerHTML='<a id=app href="mailto:someone@example.com" style="position:absolute;left:100px;top:300px;width:200px;height:40px;display:block">Mail</a><a id=local href="https://127.0.0.1/" target="_blank" style="position:absolute;left:100px;top:360px;width:200px;height:40px;display:block">Local</a>';document.body.append(links);return true;`,{},{isolated:false});
  focusSurface();
  click(200,320);
  await until('the app link is reported',()=>refused.find(value=>value.kind==='navigation'));
  click(200,380);
  await until('the refused window is reported',()=>refused.find(value=>value.kind==='popup'));
  assert.deepEqual(refused.map(value=>[value.kind,value.reason,value.scheme,value.host]),[['navigation','address','mailto',''],['popup','address','https','127.0.0.1']]);
  assert.ok(!page.hasPopup&&page.url==='https://demo.worldlet.test/brightsmile','the page stays where it was');
  page.onRefused=()=>{};
  console.log('PASS a link the rules keep out (an app link, a window to a non-public address) is reported to the panel instead of doing nothing');

  // 4c. In a Browser tab's page, a link for a new tab (target=_blank) opens the Browser's next tab instead of a popup
  // (owner request 2026-10-08); a window the page sizes itself (a sign-in popup) still stacks over its opener.
  {
   const tabbed=new CefPageView({engine,parent:window.contentView,window:()=>window,scope:'practice',webRoot:profile.webRoot,demo:true,url:'https://demo.worldlet.test/brightsmile',preload:process.env.WORLDLET_WEB_SURFACE_PRELOAD!,onDownload:()=>{},tabs:true});
   let tabbedLoads=0;tabbed.onLoaded=()=>{tabbedLoads++;};
   page.setHidden(true);tabbed.setFrame({x:40,y:30,width:800,height:600});tabbed.setHidden(false);
   try{
    await until('the tab\'s page loads',()=>tabbedLoads>0&&!tabbed.isLoading&&tabbed.url==='https://demo.worldlet.test/brightsmile',30000);
    const opened:{url:string,background:boolean}[]=[];tabbed.onOpenTab=(url,background)=>opened.push({url,background});
    await tabbed.evaluate(`document.documentElement.innerHTML='<body style="margin:0"><a id=tab href="https://example.com/hotel" target="_blank" style="position:absolute;left:100px;top:100px;width:200px;height:40px;display:block">Hotel</a><button id=sized style="position:absolute;left:100px;top:200px;width:200px;height:60px">Sign in</button></body>';
document.getElementById('sized').addEventListener('click',()=>{window.open('about:blank','signin','width=400,height=500');});return true;`,{},{isolated:false});
    const tabSurface=(tabbed as any).surface;
    const press=(x:number,y:number)=>{for(const type of ['mouseDown','mouseUp'] as const)tabSurface.contents.sendInputEvent({type,x,y,button:'left',clickCount:1});};
    (tabbed as any).input({t:'focus',focus:true});
    press(200,120);
    await until('the link opens a tab',()=>opened.length>0);
    assert.deepEqual(opened,[{url:'https://example.com/hotel',background:false}]);
    assert.ok(!tabbed.hasPopup&&tabbed.url==='https://demo.worldlet.test/brightsmile','the page stays, without a popup');
    press(200,230);
    await until('a sized window still stacks as a popup',()=>tabbed.hasPopup);
    assert.equal(opened.length,1);
    tabbed.goBack();await until('Back closes it',()=>!tabbed.hasPopup);
   }finally{tabbed.close();page.setHidden(false);}
  }
  console.log('PASS in a Browser tab\'s page a link for a new tab opens the next tab, and a sized window still stacks as a popup');

  // 5. Fox's relay reaches only the visible page.
  const replies:any[]=[];page.driver={receiveCDP:(message:any)=>replies.push(message),invalidate:()=>{},stop:()=>{},run:async()=>({}),controls:()=>[]};
  page.enableAgentTransport(true);
  page.sendAgentCDP({id:7,method:'Target.getTargets'});page.sendAgentCDP({id:8,method:'Browser.getVersion'});page.sendAgentCDP({id:9,method:'Runtime.evaluate',params:{expression:'1+1',returnByValue:true}});
  await until('the relay answers',()=>replies.some(reply=>reply.id===9));
  assert.equal(replies.find(reply=>reply.id===7)?.error?.code,-32601);
  assert.equal(replies.find(reply=>reply.id===8)?.error?.code,-32601);
  assert.equal(replies.find(reply=>reply.id===9)?.result?.result?.value,2);
  page.driver=null;
  console.log('PASS Fox\'s DevTools relay refuses browser-wide commands and reaches the visible page');

  // 6. Task picture in picture (#1175): shown smaller, the page keeps its own size and takes presses only.
  // Frames a second of a page that changes every frame, counted by the frames' own timestamps after
  // the first one, a moment after the rate changed. A loop that changes nothing gets fewer in the
  // panel (platform/web-engine/README.md), never none.
  const frames=async()=>{await wait(300);return page!.evaluate('return new Promise(done=>{const dot=document.body.appendChild(document.createElement("div"));dot.style.cssText="position:absolute;left:0;top:0;width:8px;height:8px;background:red";let count=-1,start=0;const step=time=>{dot.style.left=(count&63)+"px";if(count<0){start=time;count=0;}else count++;if(time-start<1000)requestAnimationFrame(step);else{dot.remove();done(count);}};requestAnimationFrame(step);});',{},{isolated:false}) as Promise<number>;};
  const {fps}=TASK_PICTURE_IN_PICTURE;
  // Full rate follows the display: 120 on a 120 Hz screen, 60 on most others.
  const full=pageFrameRate({width:800,height:600,scaled:false,refresh:displayRefresh(window.getContentBounds())});
  const near=(rate:number,wanted:number)=>Math.abs(rate-wanted)<=Math.max(2,wanted*0.15);
  // Full rate is the steady rate: the first seconds after a resize can dip while the engine makes
  // surfaces of the new size (Windows measured 43 once; Mac RC d804640b, beside the iOS build and the
  // package build, 11 for two seconds back from out of sight), so the best of up to five seconds
  // counts, ending at the first at full rate.
  // A capped rate dips the same way under load (Mac Alpha 4090 measured 8 for the 15 a scaled page draws at), so each
  // rate counts its best second; a page drawing faster than its cap still fails.
  // Each second measured, for the failure message: whether a rate never got there or got there late.
  const samples:Record<string,number[]>={};
  const steady=async(wanted=full,name='panel',seconds=5)=>{let best=0;const seen:number[]=samples[name]=[];for(let second=0;second<seconds&&!near(best,wanted);second++){const rate=await frames();seen.push(rate);best=Math.max(best,rate);}return best;};
  const panelRate=await steady();
  let presses=0;page.onPress=()=>{presses++;};
  const clicksBefore=await page.evaluate('return window.clicks;',{},{isolated:false});
  page.setFrame({x:500,y:380,width:320,height:240},{width:800,height:600},true);
  await until('the page keeps its size while shown smaller',async()=>JSON.stringify(await page!.evaluate('return [innerWidth,innerHeight];',{},{isolated:false}))==='[800,600]');
  await until('the smaller panel shows the page',async()=>{const value=await pixel();return value&&Math.abs(value[2]-255)<8&&Math.abs(value[1]-128)<8?value:null;});
  for(const type of ['mouseDown','mouseUp'] as const)surface.contents.sendInputEvent({type,x:160,y:200,button:'left',clickCount:1});
  await until('a press is reported',()=>presses===1);
  await wait(300);
  assert.equal(await page.evaluate('return window.clicks;',{},{isolated:false}),clicksBefore,'the page takes no click while it only takes presses');
  // Fox's driver still reaches the page's elements at the page's own coordinates.
  const driven:any[]=[];page.driver={receiveCDP:(message:any)=>driven.push(message),invalidate:()=>{},stop:()=>{},run:async()=>({}),controls:()=>[]};
  page.sendAgentCDP({id:20,method:'Runtime.evaluate',params:{expression:"(()=>{const r=document.getElementById('field').getBoundingClientRect();return [r.x,r.y,r.width,r.height];})()",returnByValue:true}});
  const field=(await until('Fox reads where the field is',()=>driven.find(reply=>reply.id===20)))?.result?.result?.value as number[];
  assert.deepEqual(field.slice(0,2),[100,100],'element places stay the page\'s own while it shows smaller: '+JSON.stringify(field));
  const at={x:field[0]+field[2]/2,y:field[1]+field[3]/2};
  for(const [id,type] of [[21,'mousePressed'],[22,'mouseReleased']] as const)page.sendAgentCDP({id,method:'Input.dispatchMouseEvent',params:{type,...at,button:'left',clickCount:1}});
  await until('Fox\'s click reaches the page',async()=>await page!.evaluate('return window.clicks;',{},{isolated:false})===clicksBefore+1);
  assert.equal(await page.evaluate('return document.activeElement?.id;',{},{isolated:false}),'field','Fox\'s click lands on the field');
  assert.equal(presses,1,'Fox\'s steps are not the person\'s presses');
  page.driver=null;
  const windowRate=await steady(fps.scaled,'window');
  // Out of sight (the window waits while the person is in an Applet): low, never zero.
  page.setFrame({x:0,y:0,width:0,height:0},{width:800,height:600},true);
  const waitingRate=await steady(fps.waiting,'waiting');
  page.setFrame({x:40,y:30,width:800,height:600});
  // Back from out of sight is where a loaded host is slowest to reach full rate again (Mac Alpha 4088 and 4096 on a 75 Hz
  // display: best 16 and 34 within five seconds), so it gets ten.
  const backRate=await steady(full,'back',10);
  assert.ok(near(panelRate,full)&&near(windowRate,fps.scaled)&&near(waitingRate,fps.waiting)&&near(backRate,full),
   'frame rates follow pageFrameRate: '+JSON.stringify({panel:panelRate,window:windowRate,waiting:waitingRate,back:backRate,full,refresh:displayRefresh(window.getContentBounds())??null,samples}));
  // The surface hears of the mode change over IPC; a click sent at once could still count as a press.
  await wait(300);
  click(700,500);
  await until('clicks reach the page again in the panel',async()=>await page!.evaluate('return window.clicks;',{},{isolated:false})>clicksBefore+1);
  console.log('PASS shown smaller, the page keeps its own size, reports presses instead of taking clicks and takes Fox\'s clicks at its own coordinates; frames '+JSON.stringify({panel:panelRate,window:windowRate,waiting:waitingRate})+' per second; back in the panel it takes input again');

  // 6b. A cross-site navigation (a site's sign-in button to its identity provider) commits in a new
  // renderer, which must get the panel's focus too, or the page takes keys without drawing a caret.
  // The second site is answered here like the rehearsal site, with its 404 page.
  await (page as any).cdp('Fetch.enable',{patterns:[`https://demo.worldlet.test/*`,'https://other.example/*'].map(urlPattern=>({urlPattern,requestStage:'Request'}))});
  focusSurface();
  const loadsBefore=loads;page.load('https://other.example/');
  await until('the second site loads',()=>loads>loadsBefore&&!page!.isLoading&&page!.url==='https://other.example/',30000);
  await until('the second site has the focus',async()=>await page!.evaluate('return document.hasFocus();',{},{isolated:false}));
  await page.evaluate(testPage+'return true;',{},{isolated:false});
  console.log('PASS after a cross-site navigation the page has the panel\'s focus');

  // 7. Video formats (#1174): a one-second H.264/AAC clip plays on Worldlet's own CEF build. The
  // standard build has no such codecs and must say so rather than fail silently.
  const info=engineInfo(files),clip=fs.readFileSync('platform/browser/fixtures/h264-aac.mp4').toString('base64');
  const media=await page.evaluate(`const supported=MediaSource.isTypeSupported('video/mp4; codecs="avc1.42E01E, mp4a.40.2"');
const video=document.createElement('video');video.muted=true;
video.src=URL.createObjectURL(new Blob([Uint8Array.from(atob(clip),c=>c.charCodeAt(0))],{type:'video/mp4'}));
document.body.append(video);
const played=await video.play().then(()=>new Promise(done=>{const timer=setTimeout(()=>done(false),5000);video.addEventListener('timeupdate',()=>{if(video.currentTime>0.3){clearTimeout(timer);done(true);}});}),()=>false);
const result={supported,played,width:video.videoWidth,error:video.error?.code??null};video.remove();return result;`,{clip},{isolated:false});
  if(info.codecs){
   assert.ok(media.supported&&media.played&&media.width===64,'Worldlet\'s CEF build plays H.264/AAC: '+JSON.stringify(media));
   console.log('PASS Worldlet\'s own CEF build supports and plays H.264/AAC');
  }else{
   assert.ok(!media.supported&&!media.played,'the standard CEF build has no H.264/AAC: '+JSON.stringify(media));
   console.log('PASS the standard CEF build reports no H.264/AAC (Worldlet\'s own build is not pinned here yet, #1174)');
   // The page's document-start counts (video-formats.js) saw the refusal, so a page whose video
   // needs H.264/AAC moves to Electron's views (core/browser/video-formats.ts).
   const counts=await page.evaluate('return globalThis.__worldletVideoFormats?.()??null;',{},{isolated:false});
   assert.ok(counts&&counts.refused>0,'the page counted the missing H.264/AAC: '+JSON.stringify(counts));
   console.log('PASS the page counts the formats it was told are missing: '+JSON.stringify(counts));
  }

  // 7b. A call's camera and microphone (owner report 2026-10-05: Meetings had neither): a meeting site
  // asks the person once per page for each device, then the OS; a site the OS blocks gets nothing; the
  // site's Permissions API then reads "granted"; other sites are refused without asking. Chromium's fake
  // devices stand in for real ones (WORLDLET_WEB_FAKE_MEDIA).
  {
   const call=new CefPageView({engine,parent:window.contentView,window:()=>window,scope:'practice',webRoot:profile.webRoot,demo:true,url:'https://demo.worldlet.test/brightsmile',preload:process.env.WORLDLET_WEB_SURFACE_PRELOAD!,onDownload:()=>{}});
   const host={profile,store:{sampleEnabled:()=>true,writable:false,state:{}},page:{call:async()=>{},event:()=>{},documentEvent:()=>{},ready:()=>true},
    window:()=>window,worldView:()=>null,diagnostics:{record:()=>{},log:()=>{}}} as unknown as Host;
   const device=new BrowserDevice(host,{binary:()=>'',python:()=>'',script:''} as any),panel=device as any;
   try{
    let callLoads=0;call.onLoaded=()=>{callLoads++;};
    call.setFrame({x:40,y:30,width:640,height:480});call.setHidden(false);
    await until('the rehearsal page loads for the call',()=>callLoads>0&&!call.isLoading&&call.url==='https://demo.worldlet.test/brightsmile',30000);
    const meet=Buffer.from('<!doctype html><title>Meet</title><p>Call</p>').toString('base64');
    (call as any).demoPage=(raw:unknown)=>{try{return new URL(String(raw)).hostname==='meet.google.com'?meet:null;}catch{return null;}};
    await (call as any).cdp('Fetch.enable',{patterns:['https://demo.worldlet.test/*','https://meet.google.com/*','https://other.example/*'].map(urlPattern=>({urlPattern,requestStage:'Request'}))});
    panel.browser=call;panel.bind(call);
    const loaded=call.onLoaded;call.onLoaded=()=>{callLoads++;loaded();};
    const errors:number[]=[];const failed=call.onError;call.onError=code=>{errors.push(code);failed(code);};
    let osAllows=false,osAsked=0;
    device.systemMedia=async()=>{osAsked++;return osAllows;};
    const open=async(url:string)=>{const before=callLoads;call.load(url);await until('the call page loads: '+url,()=>callLoads>before&&!call.isLoading&&call.url===url,30000).catch(error=>{throw Error(error.message+' ('+JSON.stringify({loads:callLoads-before,loading:call.isLoading,url:call.url,errors})+')');});};
    const capture=(constraints:object)=>call.evaluate(`return navigator.mediaDevices.getUserMedia(constraints).then(s=>{const kinds=s.getTracks().map(t=>t.kind+':'+t.readyState);s.getTracks().forEach(t=>t.stop());return kinds.sort().join(',');},e=>e.name);`,{constraints},{isolated:false});
    const state=()=>call.evaluate(`return Promise.all(['microphone','camera'].map(name=>navigator.permissions.query({name}).then(s=>s.state))).then(s=>s.join(','));`,{},{isolated:false});
    await open('https://meet.google.com/abc-defg-hij');
    assert.equal(await state(),'prompt,prompt','a new site has not been allowed');
    assert.equal(await capture({audio:true}),'NotAllowedError','the OS blocks the microphone, so the page gets none');
    assert.equal(osAsked,1,'Worldlet asks the person nothing; only the OS is asked');
    osAllows=true;
    assert.equal(await capture({audio:true}),'audio:live','allowed, the call has the microphone');
    assert.equal(await capture({audio:true}),'audio:live');
    assert.equal(await capture({video:true}),'video:live','the camera is asked for on its own');
    assert.equal(await capture({audio:true,video:true}),'audio:live,video:live');
    assert.equal(osAsked,3,'once allowed, each device is asked of the OS once for the page');
    assert.equal(await state(),'granted,granted','the site sees both devices allowed');
    await open('https://other.example/');
    assert.equal(await capture({audio:true}),'NotAllowedError','other sites get no microphone');
    assert.equal(osAsked,3,'and the OS is not asked');
    console.log('PASS a meeting site gets the camera and microphone once the OS allows each, with no question from Worldlet, and reads them as granted; other sites are refused without asking');
   }finally{device.stop();call.close();}
  }

  // 8. Beside the desktop Companion (#1175), through the panel's own device: the World view under
  // the page stands in for the World.
  const world=new WebContentsView();window.contentView.addChildView(world);world.setBounds({x:0,y:0,width:900,height:700});page.raise();
  const events:any[]=[];let restored=0;
  const host={profile,store:{sampleEnabled:()=>true,writable:false,state:{}},page:{call:async(name:string,event:unknown)=>{if(name==='worldletBrowser')events.push(event);},event:()=>{},documentEvent:()=>{},ready:()=>true},
   window:()=>window,worldView:()=>world,diagnostics:{record:()=>{},log:()=>{}}} as unknown as Host;
  const device=new BrowserDevice(host,{binary:()=>'',python:()=>'',script:''} as any),panel=device as any;
  panel.browser=page;panel.bind(page);device.restoreWorld=()=>{restored++;};
  const fox={label:'Fox is working on this page',colors:['#ff8a00','#2f6bff'],turnSeconds:0,phaseSeconds:0};
  const inWorld={x:560,y:420,width:320,height:240};
  device.layout(inWorld,fox,{width:800,height:600},true);
  assert.deepEqual(page.frameRect(),inWorld,'Fox\'s page is in the World\'s task window');
  assert.equal(panel.pointerScale,inWorld.width/800,'Fox\'s pointer lands where the smaller page shows its target');
  const area=screen.getPrimaryDisplay().workArea,companion={x:area.x+area.width-316,y:area.y+area.height-296,width:300,height:280};
  device.detach();device.placeTask(companion);
  const task=panel.task,placed=desktopTaskPictureInPicturePlacement({area,companion,aspect:taskPictureInPictureAspect({width:800,height:600})});
  assert.ok(task?.visible,'the window beside the Companion shows');
  const bounds=task.window.getBounds();
  // Windows rounds a frameless window's size by a DIP or two (1360,818 362×271 for 360×270).
  assert.ok(['x','y','width','height'].every(key=>Math.abs(bounds[key]-placed[key])<=3),'beside the Companion as the shared rule places it: '+JSON.stringify({bounds,placed}));
  assert.ok(task.contentView.children.includes(surface.view)&&!window.contentView.children.includes(surface.view),'the page\'s surface moved into it');
  assert.deepEqual(page.frameRect(),{x:0,y:0,width:placed.width,height:placed.height});
  assert.equal(panel.pointerScale,placed.width/800);
  assert.equal(JSON.stringify(await page.evaluate('return [innerWidth,innerHeight];',{},{isolated:false})),'[800,600]','the page keeps its size there');
  await until('the page shows beside the Companion',async()=>{const value=await pixel();return value&&Math.abs(value[2]-255)<8&&Math.abs(value[1]-128)<8?value:null;});
  assert.ok(panel.glow.isShowing,'Fox\'s glow follows the page');
  assert.equal(await page.evaluate('return 6*7;',{},{isolated:false}),42,'Fox\'s steps still reach the page');
  // Layouts from the World while it is away only say whether Fox works; the page stays.
  device.layout({x:0,y:0,width:0,height:0},fox,{width:800,height:600},true);
  assert.deepEqual(page.frameRect(),{x:0,y:0,width:placed.width,height:placed.height});
  // A press there brings the World back, and the UI hears of it.
  await task.overlay.ready;
  for(const type of ['mouseDown','mouseUp'] as const)task.overlay.view.webContents.sendInputEvent({type,x:40,y:40,button:'left',clickCount:1});
  await until('a press beside the Companion is reported',()=>restored===1&&events.some(event=>event.phase==='task-pip'&&event.event==='press'));
  device.attach();
  assert.ok(window.contentView.children.includes(surface.view)&&!task.visible,'back in the World window');
  assert.deepEqual(page.frameRect(),inWorld,'where the World last placed it');
  // After Fox's turn the window beside the Companion can be closed, which leaves the page.
  device.layout(inWorld,undefined,{width:800,height:600},true);
  device.detach();device.placeTask(companion);
  assert.ok(task.visible&&!panel.glow.isShowing);
  await until('the close control shows',async()=>await task.overlay.view.webContents.executeJavaScript("document.body.classList.contains('closable')"));
  const close=await task.overlay.view.webContents.executeJavaScript("(()=>{const r=document.getElementById('close').getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)};})()");
  for(const type of ['mouseDown','mouseUp'] as const)task.overlay.view.webContents.sendInputEvent({type,...close,button:'left',clickCount:1});
  await until('closing there is reported',()=>events.some(event=>event.phase==='task-pip'&&event.event==='closed'));
  assert.ok(!task.visible&&device.visiblePage===null,'the page is left and the window goes');
  assert.equal(restored,1,'closing does not bring the World back');
  device.stop();window.contentView.removeChildView(world);world.webContents.close();
  page=null;
  console.log('PASS with the World away, the panel shows Fox\'s page beside the Companion at its own size, still working; a press brings the World back; back there it is where it was; after Fox\'s turn it closes there');

  // 9. Several pages at once (#1176): two pages side by side render and take input each on its own,
  // two Fox drivers run at once on separate pages, and only one page plays sound at a time.
  const pages=[0,1].map(index=>new CefPageView({engine,parent:window.contentView,window:()=>window,scope:'practice',webRoot:profile.webRoot,demo:true,url:'https://demo.worldlet.test/brightsmile',preload:process.env.WORLDLET_WEB_SURFACE_PRELOAD!,onDownload:()=>{}}));
  try{
   const loaded=pages.map(()=>0);pages.forEach((view,index)=>{view.onLoaded=()=>{loaded[index]++;};view.setFrame({x:20+index*440,y:20,width:420,height:320});view.setHidden(false);});
   await until('both pages load',()=>loaded.every(count=>count>0)&&pages.every(view=>!view.isLoading&&view.url==='https://demo.worldlet.test/brightsmile'),30000);
   const colors=['rgb(255,0,0)','rgb(0,160,0)'];
   await Promise.all(pages.map((view,index)=>view.evaluate(`document.documentElement.innerHTML='<body style="margin:0;background:${colors[index]}"><input id=field style="position:absolute;left:20px;top:20px;width:200px;height:30px"></body>';return true;`,{},{isolated:false})));
   const center=async(view:CefPageView)=>{const contents=(view as any).surface.contents;const image=await contents.capturePage().catch(()=>null);if(!image)return null;const size=image.getSize();if(!size.width)return null;const bitmap=image.toBitmap(),i=(Math.floor(size.height/2)*size.width+Math.floor(size.width/2))*4;return [bitmap[i+2],bitmap[i+1],bitmap[i]];};
   // Captures carry the display's color profile (an external monitor read sRGB red as 255,50,0 on
   // the Mac RC host, #1239), so each page is told by its dominant channel, not by exact values.
   const dominant=(rgb:number[]|null,channel:number)=>!!rgb&&rgb[channel]>120&&rgb.every((value,other)=>other===channel||rgb[channel]-value>80);
   let shown:unknown=null;
   await until('each page shows its own pixels',async()=>{const [a,b]=(shown=await Promise.all(pages.map(center))) as (number[]|null)[];return dominant(a,0)&&dominant(b,1);}).catch(error=>{throw Error(error.message+' ('+JSON.stringify(shown)+')');});
   // Typing into each page's own surface reaches only that page.
   const fields=()=>Promise.all(pages.map(view=>view.evaluate("return document.getElementById('field').value;",{},{isolated:false})));
   for(const [index,text] of [[0,'AB'],[1,'cd']] as const){
    const view=pages[index] as any;
    await view.evaluate("document.getElementById('field').focus();return true;",{},{isolated:false});
    view.surface.send({t:'focus'});view.engine.send({t:'focus',id:view.top.id,focus:true});await wait(150);
    for(const keyCode of text)for(const type of ['keyDown','char','keyUp'] as const)view.surface.contents.sendInputEvent({type,keyCode,modifiers:keyCode===keyCode.toUpperCase()?['shift']:[]});
    let seen:unknown=null;
    await until(`page ${index+1} takes its typing`,async()=>(seen=(await fields())[index])===text).catch(error=>{throw Error(error.message+' ('+JSON.stringify(seen)+')');});
   }
   assert.deepEqual(await fields(),['AB','cd'],'each page holds only its own typing');
   // Two Fox drivers at once, each answered by its own page with the same request ids.
   const answers=pages.map(()=>[] as any[]);
   pages.forEach((view,index)=>{view.driver={receiveCDP:(message:any)=>answers[index].push(message),invalidate:()=>{},stop:()=>{},run:async()=>({}),controls:()=>[]};view.enableAgentTransport(true);});
   for(let id=60;id<70;id++)pages.forEach(view=>view.sendAgentCDP({id,method:'Runtime.evaluate',params:{expression:"getComputedStyle(document.body).backgroundColor",returnByValue:true}}));
   await until('both drivers are answered',()=>answers.every(list=>list.filter(reply=>reply.id>=60&&reply.id<70).length===10));
   assert.deepEqual(answers.map(list=>[...new Set(list.filter(reply=>reply.id>=60).map(reply=>reply.result?.result?.value))]),[['rgb(255, 0, 0)'],['rgb(0, 160, 0)']],'each driver reached only its own page');
   pages.forEach(view=>{view.driver=null;view.enableAgentTransport(false);});
   // One sound at a time: the second page's sound pauses the first's.
   const tone=fs.readFileSync('platform/browser/fixtures/tone.webm').toString('base64');
   const play=(view:CefPageView)=>view.evaluate(`const audio=document.createElement('audio');audio.id='tone';audio.loop=true;audio.src=URL.createObjectURL(new Blob([Uint8Array.from(atob(tone),c=>c.charCodeAt(0))],{type:'audio/webm'}));document.body.append(audio);
return await audio.play().then(()=>new Promise(done=>{const timer=setTimeout(()=>done(!audio.paused),3000);audio.addEventListener('timeupdate',()=>{if(audio.currentTime>0.5){clearTimeout(timer);done(true);}});}),error=>String(error));`,{tone},{isolated:false,userGesture:true});
   assert.equal(await play(pages[0]),true,'the first page plays');
   assert.equal(await play(pages[1]),true,'the second page plays');
   const paused=(view:CefPageView)=>view.evaluate("return document.getElementById('tone').paused;",{},{isolated:false});
   await until('the first page\'s sound stops for the second',async()=>await paused(pages[0])===true,5000);
   assert.equal(await paused(pages[1]),false,'the second page keeps playing');
   console.log('PASS two pages at once render and take input each on its own, two Fox drivers run at once on separate pages, and one page plays sound at a time');
  }finally{pages.forEach(view=>view.close());}
 }finally{
  page?.close();
  engine.stop();
  await until('the engine exits',()=>!engine.running,10000).catch(()=>{});
  window.destroy();
 }
}
