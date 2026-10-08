import assert from 'node:assert/strict';
import {execFileSync,spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {withBrowser,fileAccess,worldUrl} from './browser-test.ts';
import path from 'node:path';
// The adapter runs on a bare environment. Windows has no /usr/bin/python3: there it is the installation
// behind `python3` (the gate's shim), which also needs SystemRoot.
const windows=process.platform==='win32';
const python=windows?execFileSync('python3',['-c','import os,sys;print(os.path.join(sys.base_prefix,"python.exe"))'],{encoding:'utf8'}).trim():'/usr/bin/python3';
await withBrowser(fileAccess,async browser=>{
 const page=await browser.newPage({viewport:{width:1380,height:900},reducedMotion:'reduce'});
 let deltas=0,tools=0;
 await page.exposeFunction('externalTurn',body=>new Promise((resolve,reject)=>{
  const child=spawn(python,[path.resolve('harness/example/agent.py')],{env:{...(windows?{SystemRoot:process.env.SystemRoot}:{PATH:'/usr/bin:/bin'}),PYTHONUNBUFFERED:'1'}});
  let settled=false;const timer=setTimeout(()=>{child.kill('SIGKILL');reject(Error('Adapter timed out'));},10000);
  const send=value=>child.stdin.write(JSON.stringify(value)+'\n');
  const lines=createInterface({input:child.stdout});let queue=Promise.resolve();
  lines.on('line',line=>{queue=queue.then(async()=>{
   const event=JSON.parse(line);
   if(event.type==='hello'){assert.equal(event.protocolVersion,1);send({type:'request',id:body.id,body:{action:'chat',text:body.text}});return;}
   if(event.type==='result'){settled=true;clearTimeout(timer);resolve(event.value);return;}
   if(event.type==='error')throw Error(event.message);
   if(event.type==='tool'){tools++;const result=await page.evaluate(async({id,event})=>await window.worldletAgentTool(id,event),{id:body.id,event});send({type:'tool_result',requestId:body.id,id:event.id,result});}
   else {if(event.type==='delta')deltas++;await page.evaluate(({id,event})=>window.worldletAgentEvent(id,event),{id:body.id,event});}
  }).catch(error=>{clearTimeout(timer);child.kill();reject(error);});});
  child.on('error',reject);child.on('exit',()=>{clearTimeout(timer);void queue.then(()=>{if(!settled)reject(Error('Adapter exited'));});});
  send({type:'hello',protocolVersion:1});
 }));
 await page.addInitScript(()=>{window.calls=[];window.webkit={messageHandlers:{worldlet:{async postMessage(body){calls.push(body);
  if(body.action==='snapshot')return {workspaceId:'external',revision:0,sources:[],knowledge:[],connections:[],onboarding:{completed:true},sampleEnabled:false,cloudConsent:true};
  if(body.action==='modelStatus')return {available:!(window as any).agentUnavailable,provider:'example',cloudAllowed:true,reason:'Connect a model or retry your Agent.'};
  if(body.action==='agentChat')return await (window as any).externalTurn(body);
  return {ok:true};
 }}}};});
 await page.goto(worldUrl());
 await page.locator('#worldStartup').waitFor({state:'detached'});
 await page.locator('#notionInput').click();const input=page.locator('#notionInput');await input.fill('open browser');await input.press('Enter');
 await page.waitForFunction(()=>document.querySelector<any>('#notionWorld').sceneMetrics.active==='app-browser');
 await page.waitForFunction(()=>document.querySelector('#worldConversation')?.textContent.includes('Browser is open.'));
 assert.equal(tools,1);assert.ok(deltas>2);
 assert.equal(await page.evaluate(()=>calls.some(c=>c.action.startsWith('hermes'))),false);
 const before=await page.evaluate(()=>calls.filter(c=>c.action==='agentChat').length);
 await page.evaluate(()=>{(window as any).agentUnavailable=true;window.dispatchEvent(new Event('worldlet:model-changed'));});
 await page.waitForTimeout(100);
 await input.fill('hello without an available model');await input.press('Enter');
 await page.waitForFunction(()=>document.querySelector('#worldConversation')?.textContent.includes('Connect a model or retry your Agent.'));
 assert.equal(await page.evaluate(()=>calls.filter(c=>c.action==='agentChat').length),before);
 assert.equal(await page.evaluate(()=>calls.some(c=>c.action==='appleRequest'||(c.action==='cloudRequest'&&c.path==='/api/chat'))),false);
 await page.evaluate(()=>{(window as any).agentUnavailable=false;window.dispatchEvent(new Event('worldlet:model-changed'));});
 await page.waitForTimeout(100);
 await input.fill('hello again');await input.press('Enter');
 await page.waitForFunction(n=>calls.filter(c=>c.action==='agentChat').length>n,before);
 console.log('PASS unavailable Agent has no inference fallback and reconnect retries through the selected adapter');
 console.log('PASS independent Python adapter streams through actual UI and opens Browser through World tool gateway without Hermes');
});
