import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {chromium} from 'playwright';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {attentionRequest,legacyActionDisplayText,summarizeRequest} from '../core/agent/system-requests.ts';
import {firstValueRequest} from '../core/onboarding/first-value.ts';
import {restoreThread,threadRow,threadStart} from '../ui/companion/fox-thread.ts';
import {validateConversationHistory} from '../core/companion/conversation-history.ts';
import {buildUI} from './build-ui.ts';

const id='synthetic-notification',title='Fictional garden club',intent='Help me with this next step: Summarize this item. Read the saved evidence first, then complete it directly.';
const generated=attentionRequest(intent,id,title,firstValueRequest(id,['https://example.test/fictional-garden']));
assert.equal(legacyActionDisplayText(generated),'Summarize this item');
assert.equal(legacyActionDisplayText(summarizeRequest('Fictional note')),'Summarize');
assert.equal(legacyActionDisplayText(attentionRequest('Explore more',id,title,'Read its actual sources and related context first. Do not assume missing facts or completion. Complete website steps directly; never enter payment details or passwords.')),'Explore more');
for(const manual of ['a'.repeat(3000),generated+' My own extra instructions.',generated.replace('supporting evidence','supporting notes'),generated.replace('⟦untrusted "','⟦untrusted invalid "'),generated.replace('Help me with Attention item "synthetic-notification"','Help me with Attention item "another"')])assert.equal(legacyActionDisplayText(manual),undefined);
const entries=threadStart([],{id:'test',key:'notes',view:'',location:'Notes',user:generated,at:1});
assert.equal(restoreThread([threadRow(entries)])[0].user,generated,'new manual text identical to a legacy template is preserved');
assert.equal(restoreThread([{key:'fox-thread',entries}])[0].user,'Summarize this item');

const manual='Handwritten detail. '.repeat(150);
for(const value of [manual,generated+' Additional handwritten instructions.']){
 const row=threadRow(threadStart([],{id:'manual',key:'notes',view:'',location:'Notes',user:value,at:2}));
 validateConversationHistory([row],true);
 assert.equal(restoreThread(JSON.parse(JSON.stringify([row])))[0].user,value);
 assert.equal(restoreThread([{...row,userTextVersion:undefined}])[0].user,value);
}
assert.equal(restoreThread([{...threadRow(entries),userTextVersion:2}])[0].user,generated,'unknown versions are not legacy');
for(const [intent,label] of [
 ['Explain what this update means and useful next steps','Explore more'],
 ['Help me complete the next step','Help me do it'],
 ['Help me prepare for this event','Help prepare'],
 ['Help me plan a route to the saved location; ask for a starting point if unknown','Plan route'],
])assert.equal(legacyActionDisplayText(attentionRequest(intent,id,'Fictional "quoted" title',firstValueRequest(id))),label);
for(const [intent,label] of [['Help me prepare','Help me prepare'],['Help me do this','Help me do it']])assert.equal(legacyActionDisplayText(attentionRequest(intent,id,title,'Read its actual sources and related context first. Do not assume missing facts or completion. Complete website steps directly; never enter payment details or passwords.')),label);
for(const intent of ['toString','constructor','Unknown action'])assert.equal(legacyActionDisplayText(attentionRequest(intent,id,title,firstValueRequest(id))),undefined);
const legacy=restoreThread([{key:'fox-thread',entries}]);
const saved=threadRow(legacy);validateConversationHistory([saved],true);
assert.equal(restoreThread(JSON.parse(JSON.stringify([saved])))[0].user,'Summarize this item');
console.log('PASS exact legacy templates, near misses, version discrimination, long manual messages and serialized thread persistence/reload.');
if(process.argv.includes('--core-only'))process.exit(0);

const output='.worldlet-task/action-history-ui';await mkdir(output,{recursive:true});
await buildUI(process.cwd(),output);
await build({entryPoints:['scripts/fixtures/generated-action-history.ts'],outfile:output+'/fixture.js',bundle:true,format:'iife'});
await writeFile(output+'/index.html',`<!doctype html><meta charset="utf-8"><title>Synthetic action history · #648</title><link rel="stylesheet" href="worldlet-ui.css"><style>body{margin:0;background:#e8eadf}.fixture-tools{position:fixed;left:24px;top:24px;z-index:10000;max-width:420px;padding:20px;background:#fff8eb;border-radius:16px;font:16px system-ui}.fixture-tools button{padding:8px;margin:4px}.notion-world{height:100vh!important}#notionWorld .notion-voice{position:absolute;inset:0;pointer-events:none}#notionWorld .notion-voice>*{pointer-events:auto}</style><aside class="fixture-tools"><h1>Fictional notification</h1><p>Garden club · Synthetic fixture only. No accounts or model calls.</p><button id="generated">Summarize this item</button><button id="delta">Stream update</button><button id="finish">Finish reply</button><button id="manual">Send long manual message</button><button id="legacy">Load old generated template</button><button id="reload">Reload saved history</button><button id="reset">Reset fixture</button></aside><main id="notionWorld" class="notion-world"><div class="notion-top"></div><dialog id="notionDialog"></dialog><section id="notionContent" hidden></section><div class="notion-voice"><div class="notion-shortcuts"></div><form><input id="notionInput"><button id="notionSend">Send</button><button id="trigger"></button></form></div><span id="status"></span></main><script src="fixture.js"></script>`);
const server=createServer(async(req,res)=>{try{const url=new URL(req.url!,'http://localhost');const file=url.pathname==='/'?'index.html':url.pathname.slice(1);if(file.includes('..')){res.writeHead(404);res.end();return;}const body=await readFile(output+'/'+file);res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':'application/octet-stream');res.end(body);}catch{res.writeHead(404);res.end();}});
await new Promise<void>(resolve=>server.listen(process.argv.includes('--serve')?8648:0,'127.0.0.1',resolve));
const address=server.address() as {port:number},url='http://127.0.0.1:'+address.port;
if(process.argv.includes('--serve')){console.log('Synthetic fixture: '+url);}else{
 let browser:Awaited<ReturnType<typeof chromium.launch>>|undefined;
 try{
  browser=await chromium.launch();
  const page=await browser.newPage({viewport:{width:1280,height:900}}),errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url);await page.waitForFunction(()=>(window as any).ready);
  await page.locator('#generated').click();await page.waitForFunction(()=>(window as any).turns.length===1);
  assert.equal(await page.locator('.companion-asked').textContent(),'Summarize this item');
  assert.equal(await page.evaluate(()=>(window as any).turns[0].text),generated.replace(title,'Fictional garden club notification'));
  await page.locator('#delta').click();assert.equal(await page.locator('.companion-asked').textContent(),'Summarize this item');
  await page.locator('#finish').click();await page.evaluate(()=>(window as any).pending);
  assert.equal(await page.locator('.companion-asked').textContent(),'Summarize this item');
  await page.reload();await page.waitForFunction(()=>(window as any).ready);assert.equal(await page.locator('.companion-asked').textContent(),'Summarize this item');
  await page.locator('#manual').click();await page.waitForFunction(()=>(window as any).turns.length===1);
  await page.waitForFunction(()=>!(window as any).fox.active);
  assert.equal(await page.locator('.companion-asked').textContent(),await page.evaluate(()=>(window as any).manual));
  assert.equal(await page.locator('.companion-thread-user').last().textContent(),'Summarize this item');
  assert.equal(await page.evaluate(()=>(window as any).turns[0].history[0].text),generated.replace(title,'Fictional garden club notification'),'model history retains execution context');
  await page.reload();await page.waitForFunction(()=>(window as any).ready);assert.equal(await page.locator('.companion-asked').textContent(),await page.evaluate(()=>(window as any).manual));
  await page.locator('#legacy').click();await page.waitForFunction(()=>(window as any).ready&&document.querySelector('.companion-asked')?.textContent==='Summarize this item');
  assert.equal(await page.locator('.companion-asked').textContent(),'Summarize this item');
  await page.reload();await page.waitForFunction(()=>(window as any).ready);assert.equal(await page.locator('.companion-asked').textContent(),'Summarize this item');
  // Queued actions retain display and execution text, including recovered drafts.
  await page.locator('#generated').click();await page.waitForFunction(()=>(window as any).turns.length===1);
  await page.evaluate(()=>{const w=window as any;w.fox.ask(w.execution,{displayText:'Queued summary'});});
  await page.locator('#finish').click();await page.waitForFunction(()=>(window as any).turns.length===2&&!(window as any).fox.active);
  assert.equal(await page.locator('.companion-asked').textContent(),'Queued summary');
  await page.locator('#generated').click();await page.waitForFunction(()=>(window as any).turns.length===3);
  await page.evaluate(()=>{const w=window as any;w.fox.ask(w.execution,{displayText:'Recovered summary'});w.fox.setContext({key:'calendar',title:'Fictional calendar',detail:''});});
  await page.locator('#finish').click();await page.waitForFunction(()=>!(window as any).fox.active);
  assert.equal(await page.locator('#notionInput').inputValue(),'Recovered summary');
  await page.locator('#notionSend').click();await page.waitForFunction(()=>(window as any).turns.length===4&&!(window as any).fox.active);
  assert.equal(await page.evaluate(()=>(window as any).turns.at(-1).text),generated.replace(title,'Fictional garden club notification'));
  assert.equal(await page.locator('.companion-asked').textContent(),'Recovered summary');
  await page.locator('#generated').click();await page.waitForFunction(()=>(window as any).turns.length===5);
  await page.evaluate(()=>{const w=window as any;w.fox.ask(w.execution,{displayText:'Draft to edit'});w.fox.setContext({key:'notes',title:'Fictional notes',detail:''});});
  await page.locator('#finish').click();await page.waitForFunction(()=>!(window as any).fox.active);
  await page.locator('#notionInput').fill('My edited manual request');
  await page.locator('#notionSend').click();await page.waitForFunction(()=>(window as any).turns.length===6&&!(window as any).fox.active);
  assert.equal(await page.evaluate(()=>(window as any).turns.at(-1).text),'My edited manual request');
  assert.equal(await page.locator('.companion-asked').textContent(),'My edited manual request');
  assert.deepEqual(errors,[]);
  await page.screenshot({path:output+'/verified.png'});
  console.log('PASS exact legacy templates, near misses, new manual templates, send/stream/persistence/reload, long manual text, model payload/history, queue and recovered drafts.');
 }finally{await browser?.close();server.close();}
}
