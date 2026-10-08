// A Google sign-in refused in a website panel (#1089), driven through the real World UI with a
// faked native bridge. The rule recognizes only Google's refusal page, never a sign-in step.
// Refused, YouTube shows Fox's explanation and one explicit system-browser action beside the page;
// nothing opens by itself, the action asks the host for YouTube, and it leaves with the next page.
// This is not a live Google sign-in: whether Google refuses a given account is Google's call.
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {googleSignInPage,googleSignInRejected,signInRejectedMessage} from '../core/browser/index.ts';
import {pageErrors,worldUrl} from './browser-test.ts';

for(const url of ['https://accounts.google.com/v3/signin/rejected?continue=https%3A%2F%2Fwww.youtube.com','https://accounts.google.com/signin/v2/deniedsigninrejected?flowName=GlifWebSignIn','https://ACCOUNTS.google.com/signin/rejected',new URL('https://accounts.google.com/v3/signin/rejected/')])
 assert.equal(googleSignInRejected(url),true,'refusal: '+url);
for(const url of ['https://accounts.google.com/v3/signin/identifier?continue=https%3A%2F%2Fwww.youtube.com','https://accounts.google.com/v3/signin/challenge/pwd','https://accounts.google.com/ServiceLogin','http://accounts.google.com/v3/signin/rejected','https://accounts.google.com.example.com/v3/signin/rejected','https://example.com/v3/signin/rejected','https://www.youtube.com/signin/rejected','not a url',null])
 assert.equal(googleSignInRejected(url),false,'not a refusal: '+url);
// Google's sign-in on Electron's views moves to the CEF engine as it starts, before Google judges the browser.
for(const url of ['https://accounts.google.com/ServiceLogin?continue=https%3A%2F%2Fwww.youtube.com','https://ACCOUNTS.google.com/v3/signin/identifier','https://accounts.google.com/o/oauth2/v2/auth?client_id=x',new URL('https://accounts.google.com/')])
 assert.equal(googleSignInPage(url),true,'Google sign-in: '+url);
for(const url of ['http://accounts.google.com/ServiceLogin','https://accounts.google.com.example.com/','https://myaccount.google.com/','https://appleid.apple.com/auth/authorize','not a url',null])
 assert.equal(googleSignInPage(url),false,'not Google sign-in: '+url);
assert.match(signInRejectedMessage('youtube'),/Videos still play here signed out/);
assert.doesNotMatch(signInRejectedMessage('web'),/Videos/);
console.log('PASS only Google’s refusal page counts as a refused sign-in');

const browser=await chromium.launch({executablePath:process.env.WORLDLET_TEST_BROWSER,args:['--allow-file-access-from-files',...process.platform==='darwin'?['--use-angle=metal']:[]]});
try{
 const page=await browser.newPage({viewport:{width:1440,height:840},reducedMotion:'reduce'}),errors=pageErrors(page);page.setDefaultTimeout(15000);
 await page.addInitScript(()=>{
  const w=window as any;w.calls=[];
  w.webkit={messageHandlers:{worldlet:{async postMessage(b){
   if(b.action==='browserCommand')w.calls.push(b);
   if(b.action==='snapshot')return {workspaceId:'sign-in-check',revision:0,activityRevision:0,sources:[],knowledge:[],connections:[],worldItems:[],onboarding:{completed:true},sampleEnabled:false,cloudConsent:true};
   if(b.action==='modelStatus')return {available:true,cloudAllowed:true};
   if(b.action==='appContent')return {pages:[]};
   if(b.action==='weatherLoad')return null;
   if(b.action==='browserShow')setTimeout(()=>w.worldletBrowser({phase:'page',platform:b.platform,loading:false,url:'https://www.youtube.com/',title:'YouTube'}),0);
   return {ok:true};
  }}}};
 });
 await page.goto(worldUrl());
 await page.waitForFunction(()=>(document.querySelector<HTMLElement>('#notionWorld') as any)?.sceneMetrics?.camera?.settled&&!document.getElementById('worldStartup'));
 await page.evaluate(()=>{location.hash='object=app-youtube';});
 await page.locator('.browser-viewport').waitFor();
 const offer=page.locator('.browser-sign-in-offer');
 assert.equal(await offer.isVisible(),false,'no offer before a refusal');
 await page.evaluate(()=>(window as any).worldletBrowser({phase:'error',platform:'youtube',signIn:'google',externalSignIn:true,message:'Google doesn’t allow signing in from Worldlet’s built-in browser.'}));
 await offer.waitFor();
 assert.equal(await offer.textContent(),'Open YouTube in your browser ↗');
 const box=await offer.boundingBox(),viewport=await page.locator('.browser-viewport').boundingBox();
 const fox=await page.locator('#companionDialogue').boundingBox();
 assert.ok(box&&viewport&&box.x>=viewport.x+viewport.width,'the action sits beside the page, not over it');
 assert.ok(fox&&box.y+box.height<=fox.y,'Fox’s explanation does not cover the action');
 assert.equal(await page.evaluate(()=>(window as any).calls.filter(c=>c.operation==='external').length),0,'nothing opens by itself');
 await offer.click();
 await page.waitForFunction(()=>(window as any).calls.some(c=>c.operation==='external'));
 assert.deepEqual(await page.evaluate(()=>(window as any).calls.find(c=>c.operation==='external')),{action:'browserCommand',operation:'external',args:{platform:'youtube'},agent:false});
 await page.evaluate(()=>(window as any).worldletBrowser({phase:'error',platform:'youtube',externalSignIn:true,retry:true,message:'You’re offline. Reconnect, then retry this page.'}));
 await page.waitForFunction(()=>document.querySelector<HTMLElement>('.browser-sign-in-offer')?.hidden===true);
 await page.evaluate(()=>(window as any).worldletBrowser({phase:'error',platform:'youtube',signIn:'google',externalSignIn:true,message:'refused'}));
 await offer.waitFor();
 await page.evaluate(()=>(window as any).worldletBrowser({phase:'page',platform:'youtube',loading:false,url:'https://www.youtube.com/',title:'YouTube'}));
 await page.waitForFunction(()=>document.querySelector<HTMLElement>('.browser-sign-in-offer')?.hidden===true);
 // Leaving the Applet hides the offer, and reopening it starts clean: the refusal belongs to that page.
 await page.evaluate(()=>(window as any).worldletBrowser({phase:'error',platform:'youtube',signIn:'google',externalSignIn:true,message:'refused'}));
 await offer.waitFor();
 await page.evaluate(()=>{location.hash='';});
 await page.waitForFunction(()=>document.querySelector<HTMLElement>('.browser-sign-in-offer')?.hidden!==false);
 await page.evaluate(()=>{location.hash='object=app-youtube';});
 await page.locator('.browser-viewport').waitFor();
 assert.equal(await offer.isVisible(),false,'reopening YouTube does not keep an old refusal');
 assert.deepEqual(errors,[]);
 console.log('PASS a refused Google sign-in offers the system browser on request and clears with the next page');
}finally{await browser.close();}
