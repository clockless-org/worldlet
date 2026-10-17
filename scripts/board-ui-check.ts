import assert from 'node:assert/strict';
import fs from 'node:fs';
import {withBrowser,bundleScript,pageErrors} from './browser-test.ts';
// The Board Applet's panel (ui/applets/board/applet.md), on its own: one fictional board of all four kinds and one card
// that cannot be shown, tabs, Refresh, the empty state, 1280 and 390 px, and that the panel reads only `board` `read`
// and never shows a preset's read or anything key-like. The device's number in the World: board-world-ui-check.ts.
const tmp=process.env.TMPDIR||'/tmp';
await withBrowser(async browser=>{
 const page=await browser.newPage({viewport:{width:1280,height:900},reducedMotion:'reduce'}),errors=pageErrors(page,{console:true});
 await page.setContent('<!doctype html><title>Board panel check</title><main id="content" class="notion-content" data-template="board" style="max-width:860px;margin:0 auto"></main>');
 await page.addStyleTag({content:fs.readFileSync('ui/applets/board/panel.css','utf8')});
 await page.addScriptTag({content:await bundleScript({entryPoints:['ui/applets/board/panel.ts'],globalName:'BoardPanel'})});
 await page.evaluate(()=>{
  const w=window as any;w.calls=[];w.seen=[];w.board='full';
  const definition={title:'Product',tabs:[
   {id:'growth',title:'Growth',blocks:[{id:'north-star',title:'Installs this week',kind:'number',preset:'funnel',field:'installed',goodAtLeast:100},{id:'funnel',title:'Funnel',kind:'funnel',preset:'funnel',steps:[]},{id:'signups',title:'Signups',kind:'trend',preset:'signups',x:'day',y:'signups'},{id:'prs',title:'Open pull requests',kind:'list',preset:'open-prs'},{id:'errors',title:'Worker errors',kind:'number',preset:'workers'}]},
   {id:'health',title:'Health',blocks:[{id:'pr-count',title:'Pull requests open',kind:'number',preset:'open-prs',goodAtMost:2}]}]};
  const growth={id:'growth',title:'Growth',blocks:[
   {id:'north-star',title:'Installs this week',kind:'number',preset:'funnel',provider:'posthog',scope:'Project 1 · last 7 days',status:'ok',number:{value:1240,tone:'good'}},
   {id:'funnel',title:'Funnel',kind:'funnel',preset:'funnel',provider:'posthog',scope:'Project 1 · last 7 days',status:'ok',funnel:{steps:[{label:'Visited',count:12000,rate:null},{label:'Downloaded',count:3000,rate:.25,tone:'bad'},{label:'Installed',count:1240,rate:.413}],overall:.103}},
   {id:'signups',title:'Signups',kind:'trend',preset:'signups',provider:'posthog',scope:'Project 1',status:'ok',trend:{points:[{x:'2026-10-13',y:10},{x:'2026-10-14',y:14},{x:'2026-10-15',y:11}],latest:11,change:-3}},
   {id:'prs',title:'Open pull requests',kind:'list',preset:'open-prs',provider:'github',scope:'example/app',status:'ok',list:{items:[{title:'Fix the <b>build</b>',url:'https://github.com/example/app/pull/1',fields:{repository:'example/app',author:'alex'}},{title:'Add tabs',url:'https://github.com/example/app/pull/2',fields:{repository:'example/app'}}],more:true}},
   {id:'errors',title:'Worker errors',kind:'number',preset:'workers',provider:'cloudflare',status:'error',error:'Cloudflare is not connected. Connect it in Worldlet first.'}]};
  const health={id:'health',title:'Health',blocks:[{id:'pr-count',title:'Pull requests open',kind:'number',preset:'open-prs',provider:'github',scope:'example/app',status:'ok',number:{value:5,tone:'bad'}}]};
  const presets=[{id:'funnel',provider:'posthog',read:{operation:'query',query:'SELECT secret_sauce FROM events'}}];
  const native={async board(body:any){w.calls.push({action:'board',...body});
   if(w.board==='none')return {revision:0,definition:null,presets:[],view:null};
   const tabs=body.tab===undefined?[growth,health]:[body.tab==='health'?health:growth];
   return {revision:3,definition,presets,view:{title:'Product',tabs,resolvedAt:'2026-10-15T17:05:00.000Z'}};
  }};
  window.addEventListener('worldlet:board-read',(e:any)=>w.seen.push(e.detail.view?.tabs.map((t:any)=>t.id)||null));
  const panel=w.BoardPanel.createBoardApplet({native,ask:(text:string,options:any)=>w.calls.push({action:'ask',text,label:options?.displayText}),settings:(part:string)=>w.calls.push({action:'settings',part}),
   connect:(provider:string)=>w.calls.push({action:'connect',provider}),connected:(provider:string)=>provider!=='cloudflare',openLink:(url:string)=>w.calls.push({action:'link',url}),onContext:()=>{w.contextChanges=(w.contextChanges||0)+1;}});
  w.panel=panel;document.getElementById('content')!.append(panel.element);panel.show();
 });
 const root=page.locator('.board-applet'),card=(id:string)=>root.locator(`.board-card[data-block="${id}"]`);
 await card('north-star').waitFor();
 // The top bar: title, tab pills, Refresh, when it was read.
 assert.equal(await root.locator('.board-title').textContent(),'Product');
 assert.deepEqual(await root.locator('.board-tab').allTextContents(),['Growth','Health']);
 assert.equal(await root.locator('.board-tab[aria-current=true]').textContent(),'Growth');
 assert.match(await root.locator('.board-read-at').textContent()||'',/^Read at \d{1,2}:\d{2}/);
 // Each kind, and the card that cannot be shown keeps to itself.
 assert.deepEqual(await root.locator('.board-card').evaluateAll(cards=>cards.map(c=>(c as HTMLElement).dataset.kind+':'+(c as HTMLElement).dataset.status)),['number:ok','funnel:ok','trend:ok','list:ok','number:error']);
 assert.equal(await card('north-star').locator('.board-value').textContent(),'1,240');
 assert.equal(await card('north-star').locator('.board-tone').textContent(),'On target','a tone is a word too, never colour alone');
 assert.deepEqual(await card('funnel').locator('.board-step-rate').allTextContents(),['','25%','41%']);
 assert.equal(await card('funnel').locator('.board-overall').textContent(),'Overall 10%');
 assert.deepEqual(await card('funnel').locator('.board-step-label .board-tone').allTextContents(),['Off target'],'a step\'s target is said in words');
 assert.deepEqual([await card('signups').locator('.board-value').textContent(),await card('signups').locator('.board-change').textContent()],['11','▼ 3']);
 assert.equal(await card('signups').locator('svg polyline').count(),1);
 assert.match(await card('signups').locator('svg').getAttribute('aria-label')||'',/3 points, from 2026-10-13 to 2026-10-15, latest 11/);
 assert.equal(await card('prs').locator('.board-link').first().textContent(),'Fix the <b>build</b>','Service text is shown as text');
 assert.equal(await card('prs').locator('b').count(),0);
 assert.equal(await card('prs').locator('.board-more').textContent(),'More in GitHub');
 assert.equal(await card('prs').locator('.board-card-foot').textContent(),'GitHub · example/app');
 await card('prs').locator('.board-link').first().click();
 assert.equal(page.url(),'about:blank','a list link never navigates the panel');
 assert.equal(await card('errors').locator('.board-error').textContent(),'Cloudflare is not connected. Connect it in Worldlet first.');
 await card('errors').getByRole('button',{name:'Connect Cloudflare'}).click();
 // Fox's actions follow the selected block: the first number, then the one chosen.
 let context=await page.evaluate(()=>{const c=(window as any).panel.context();return {title:c.context.title,labels:c.actions.map((a:any)=>a.label+(a.disabled?' (off)':''))};});
 assert.deepEqual(context,{title:'Board · Installs this week',labels:['Explain this number','What changed?']});
 await card('funnel').locator('.board-card-title').click();
 assert.equal(await card('funnel').getAttribute('data-selected'),'true');
 context=await page.evaluate(()=>{const c=(window as any).panel.context();return {title:c.context.title,labels:c.actions.map((a:any)=>a.label+(a.disabled?' (off)':''))};});
 assert.deepEqual(context,{title:'Board · Funnel',labels:['Explain this number (off)','What changed?']});
 await page.evaluate(()=>(window as any).panel.context().actions[1].run());
 await page.screenshot({path:tmp+'/board-panel-1280.png',fullPage:true});
 // Tabs and Refresh read one tab again, through `board` `read` only.
 await root.locator('.board-tab',{hasText:'Health'}).click();
 await card('pr-count').waitFor();
 assert.equal(await card('pr-count').locator('.board-tone').textContent(),'Off target');
 assert.equal(await root.locator('.board-tab[aria-current=true]').textContent(),'Health');
 await root.getByRole('button',{name:'Refresh'}).click();
 await page.waitForFunction(()=>(window as any).calls.filter((c:any)=>c.action==='board').length===3);
 // 390 px: one column, tabs in one bounded row, controls at least 44 px, no sideways scroll.
 await root.locator('.board-tab',{hasText:'Growth'}).click();await card('funnel').waitFor();
 await page.setViewportSize({width:390,height:844});
 const narrow=await page.evaluate(()=>{const cards=[...document.querySelectorAll('.board-card')].map(c=>c.getBoundingClientRect());const step=document.querySelector('.board-step')!.getBoundingClientRect(),bar=document.querySelector('.board-bar')!.getBoundingClientRect(),label=document.querySelector('.board-step-label')!.getBoundingClientRect();
  return {lefts:new Set(cards.map(c=>Math.round(c.left))).size,stacked:cards.every((c,i)=>!i||c.top>=cards[i-1].bottom-1),scroll:document.documentElement.scrollWidth,tabs:document.querySelector('.board-tabs')!.getBoundingClientRect().height,
   buttons:Math.min(...[...document.querySelectorAll('.board-applet button')].map(b=>b.getBoundingClientRect().height)),barBelow:bar.top>=label.bottom-1,barWide:bar.width>step.width*.8};});
 assert.deepEqual(narrow,{lefts:1,stacked:true,scroll:390,tabs:narrow.tabs,buttons:narrow.buttons,barBelow:true,barWide:true});
 assert.ok(narrow.tabs<60,'tab pills stay one row');assert.ok(narrow.buttons>=44,'controls are at least 44 px');
 await page.screenshot({path:tmp+'/board-panel-390.png',fullPage:true});
 // The empty state points to Access; nothing else is offered.
 await page.setViewportSize({width:1280,height:900});
 await page.evaluate(()=>{(window as any).board='none';});
 await root.getByRole('button',{name:'Refresh'}).click();
 await root.locator('.board-empty h2',{hasText:'No board yet.'}).waitFor();
 assert.match(await root.locator('.board-empty p').textContent()||'',/“Can set up your board” for it in Settings › Agent › Access/);
 assert.equal(await root.locator('.board-tabs').isVisible(),false);
 await root.getByRole('button',{name:'Open Access'}).click();
 assert.deepEqual(await page.evaluate(()=>(window as any).panel.context()),{actions:[]});
 // Never a preset's read or anything key-like; only board/read went out, and every read was announced.
 const text=await root.innerText();
 assert.doesNotMatch(text,/secret_sauce|SELECT|api key|token|\b(sk|ghp|phc)_/i);
 const calls=await page.evaluate(()=>(window as any).calls);
 assert.deepEqual(calls.filter((c:any)=>c.action==='board').map((c:any)=>c.operation+(c.tab?':'+c.tab:'')),['read','read:health','read:health','read:growth','read:growth']);
 assert.deepEqual(calls.filter((c:any)=>c.action!=='board').map((c:any)=>c.action+':'+(c.provider||c.url||c.label||c.part)),['link:https://github.com/example/app/pull/1','connect:cloudflare','ask:What changed?','settings:access']);
 assert.deepEqual(await page.evaluate(()=>(window as any).seen),[['growth','health'],['health'],['health'],['growth'],null]);
 assert.deepEqual(errors,[]);
});
console.log('PASS Board panel: four kinds and a per-card error, tabs, Refresh, Fox actions on the selected block, the empty state to Access, one column at 390 px, only board/read, no preset reads or keys shown');
