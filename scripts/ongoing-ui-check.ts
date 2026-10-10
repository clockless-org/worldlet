// Ongoing things on the World page (core/tasks/README.md): the brought conversations about one subject stand in Worth
// Doing as one theme; opening it lays out why with Show me, Not now and Don't ask again; Show me puts the theme off and
// asks Fox, who shows one artifact (Kelvin 2026-10-07: an artifact, not an Applet). A conversation kept as an Applet
// earlier is still a device of its own, which opens on its kind's page and latest messages.
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {pageErrors,worldUrl,waitForWorld} from './browser-test.ts';
const browser=await chromium.launch({args:['--allow-file-access-from-files']});
try{
 const page=await browser.newPage({viewport:{width:1280,height:850},reducedMotion:'reduce',timezoneId:'America/Los_Angeles'}),errors=pageErrors(page);
 await page.clock.setFixedTime(new Date('2026-10-04T10:00:00-07:00'));
 await page.addInitScript(()=>{const w=window as any;w.calls=[];
  const day=86400,t=Date.now()/1000,iso=(s:number)=>new Date(s*1000).toISOString();
  const thing=(id:string,title:string,state:string)=>({id,source:'openclaw',session:'OpenClaw · Discord · '+title,title,where:'OpenClaw · Discord',state,proposedAt:t-day,decidedAt:state==='kept'?t-day:null,laterUntil:null,turns:42,userTurns:21,first:iso(t-20*day),last:iso(t-day)});
  let kept=[{...thing('job-fooddiary001','#food-diary','kept'),region:'money'}],proposals=[thing('job-dietandhlth1','#diet-and-health','proposed'),thing('job-mealprep0001','#meal-prep','proposed'),thing('job-random000001','#random','proposed')],revision=0,unlocked=['app-gmail','app-job-fooddiary001'];
  const snapshot=()=>({workspaceId:'ongoing-fixture',revision,sources:[],knowledge:[],worldItems:[],connections:[],onboarding:{completed:true,unlockedApplets:unlocked},sampleEnabled:false,cloudConsent:true,ongoing:kept.map(({id,source,session,title,where,region})=>({id,source,session,title,where,region}))});
  w.webkit={messageHandlers:{worldlet:{async postMessage(b){w.calls.push(b);
  if(b.action==='snapshot')return snapshot();
  if(b.action==='onboarding'&&b.operation==='unlock'){unlocked=[...unlocked,b.applet];return {ok:true};}
  if(b.action==='modelStatus')return {available:true,cloudAllowed:true};
  if(b.action==='agentChat'){if(/read_companion_archive/.test(b.text||''))await w.worldletAgentTool(b.id,{id:'t1',name:'show_artifact',args:{title:'Eating well this autumn',body:'Lunches are steady.\n\n## Next\nKeep the salmon bowl.',chart:null,size:'large',actions:[]}});return {message:'Here is your page.'};}
  if(b.action==='ongoing'){
   if(b.operation==='list')return {proposals,kept};
   if(b.operation==='turns')return {...b.template===true?{template:{kind:'food',title:'Food',heading:'Meals you noted',stats:[{label:'Meals',value:'9'},{label:'Days',value:'5'},{label:'Last',value:'yesterday'}],entries:[{at:iso(t-day),text:'Lunch was the salmon bowl again, about 650 kcal',value:'650 kcal'}],empty:'No meals in this conversation yet.',action:'Review my meals'}}:{},turns:[{role:'user',text:'Lunch was the salmon bowl again',createdAt:iso(t-day)},{role:'assistant',text:'Logged. You are at 1,350 kcal today.',createdAt:iso(t-day+60)}],recent:[{text:'You: Lunch was the salmon bowl again',at:iso(t-day)}]};
   if(['later','decline'].includes(b.operation)){proposals=proposals.filter(x=>x.id!==b.id);return {ok:true};}
   if(b.operation==='keep'){const p=proposals.find(x=>x.id===b.id);proposals=proposals.filter(x=>x.id!==b.id);if(p)kept=[{...p,state:'kept',region:'money'},...kept];
    // The host tells the page, and the World changes (store.changed): the next snapshot carries the new device.
    setTimeout(()=>{window.dispatchEvent(new CustomEvent('worldlet:ongoing',{detail:{id:b.id}}));revision++;w.worldletReceive(snapshot());},50);return {ok:true};}
  }
  return {ok:true};
 }}}};});
 await page.goto(worldUrl());await waitForWorld(page);
 // A thing kept earlier is a device of its own.
 await page.waitForFunction(()=>(document.querySelector('#notionWorld') as any)?.appletLayout?.has('app-job-fooddiary001'));
 // The two food conversations are one theme in Worth Doing, after the items; one of no kind offers nothing.
 const row=page.locator('.world-task-group[data-group=needsAction] .world-ongoing');
 await row.waitFor();
 assert.equal(await page.locator('.world-task-group[data-group=needsAction] h2').textContent(),'Worth Doing');
 assert.equal(await row.count(),1,'one theme, not one row per conversation');
 assert.equal(await row.getAttribute('data-ongoing'),'food');
 assert.match(await row.textContent()||'',/What you eat, on one page/);
 assert.match(await row.textContent()||'',/Food · 2 conversations with OpenClaw · 42 of your messages/);
 assert.doesNotMatch(await row.textContent()||'',/Applet/);
 await page.screenshot({path:'/tmp/ongoing-now.png'});
 // Opening it has Fox say why, with the three choices.
 await row.click();
 const show=page.getByRole('button',{name:'Show me',exact:true});await show.waitFor();
 await page.getByRole('button',{name:'Not now'}).waitFor();await page.getByRole('button',{name:'Don\'t ask again'}).waitFor();
 assert.match(await page.locator('body').textContent()||'',/You keep talking about what you eat with OpenClaw: “#diet-and-health”, “#meal-prep”/);
 await page.screenshot({path:'/tmp/ongoing-offer.png'});
 await show.click();
 // Fox is asked for one artifact from both conversations; the theme leaves Worth Doing and nothing becomes an Applet.
 await page.waitForFunction(()=>(window as any).calls.some(c=>c.action==='agentChat'&&/#diet-and-health/.test(c.text)&&/#meal-prep/.test(c.text)&&/show_artifact/.test(c.text)));
 await page.locator('#foxArtifact',{hasText:'Eating well this autumn'}).waitFor();
 assert.deepEqual(await page.evaluate(()=>(window as any).calls.filter(c=>c.action==='ongoing'&&c.operation==='later').map(c=>c.id).sort()),['job-dietandhlth1','job-mealprep0001']);
 assert.ok(!await page.evaluate(()=>(window as any).calls.some(c=>c.action==='ongoing'&&c.operation==='keep')),'no Applet is made');
 await page.locator('.world-ongoing').waitFor({state:'detached'});
 await page.screenshot({path:'/tmp/ongoing-artifact.png'});
  // A conversation kept as an Applet earlier opens on its own device, with its kind's page and latest messages.
 await page.getByRole('button',{name:'Close artifact'}).click();
 await page.evaluate(()=>{location.hash='object=app-job-fooddiary001';});
 const panel=page.locator('#notionContent[data-template=job-fooddiary001] .ongoing-applet');await panel.waitFor();
 await panel.locator('.ongoing-heading h2',{hasText:'#food-diary'}).waitFor();
 await panel.locator('.ongoing-turn[data-role=user]',{hasText:'salmon bowl'}).waitFor();
 await page.screenshot({path:'/tmp/ongoing-open.png'});
 assert.equal(await panel.getByRole('button',{name:'‹ All ongoing'}).count(),0,'a device shows its own thing only');
 assert.match(await panel.locator('.ongoing-heading p').textContent()||'',/Food · OpenClaw · Discord · 42 messages · last yesterday/);
 // A food conversation opens on the food page: its counts and the meals the person wrote, then the latest messages.
 await panel.locator('.ongoing-kind[data-kind=food] .ongoing-entry',{hasText:'salmon bowl'}).waitFor();
 assert.equal(await panel.locator('.ongoing-entry-value').first().textContent(),'650 kcal');
 assert.deepEqual(await panel.locator('.ongoing-stat dd').allTextContents(),['9','5','yesterday']);
 assert.ok(await page.evaluate(()=>(window as any).calls.some(c=>c.action==='ongoing'&&c.operation==='turns'&&c.template===true)));
 await panel.getByRole('button',{name:'Review my meals'}).waitFor();
 await page.screenshot({path:'/tmp/ongoing-food.png'});
 assert.deepEqual(errors,[]);
 console.log('PASS Ongoing: brought conversations about one subject stand in Worth Doing as one theme, and Show me asks Fox for one artifact from them, making no Applet; a thing kept earlier is a device of its own that opens on its kind\'s page and latest messages.');
}finally{await browser.close();}
