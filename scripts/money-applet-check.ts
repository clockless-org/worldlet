import assert from 'node:assert/strict';
import {withBrowser,fileAccess,pageErrors,worldUrl,leaveApplet} from './browser-test.ts';
await withBrowser(fileAccess,async browser=>{
 const page=await browser.newPage({viewport:{width:1280,height:850},reducedMotion:'reduce'}),errors=pageErrors(page);page.setDefaultTimeout(15000);
 await page.addInitScript(()=>{
  window.calls=[];
  window.fixture={workspaceId:'money-test',revision:0,sources:[],knowledge:[],worldItems:[],worldChecks:[],cloudConsent:true,connections:[{id:'paypal',provider:'paypal',syncStatus:'connected',connected:true}],onboarding:{completed:true},sampleEnabled:false,sampleUI:{},overlay:{version:1,created:{},edits:{},trash:{},receipts:{},undo:null}};
  window.webkit={messageHandlers:{worldlet:{async postMessage(b){calls.push(b);
   if(b.action==='snapshot')return structuredClone(fixture);if(b.action==='modelStatus')return {available:true,cloudAllowed:true};if(b.action==='foxPreferences')return {model:{name:'F',ready:true,provider:'custom'},cloudConsent:true};
   if(b.action==='stripe'){
    if(b.operation==='status')return {connected:true,mode:'test',account:'acct_fixture'};
    if(b.operation==='customers')return {items:Array.from({length:5},(_,i)=>({id:'cus_'+i,name:'Customer '+i,email:'fixture@example.test'})),nextPage:null};
    if(b.operation==='overview')return {today:[{amount:12345,currency:'usd'}],todayComplete:true,mrr:[],mrrComplete:false,activeSubscriptions:2,asOf:'2026-09-18',limitations:['Metered prices excluded.']};
    if(b.operation==='customer')return {customer:{id:b.id,name:'Fixture customer'},payments:[{id:'ch_fixture',amount:9900,currency:'usd',status:'succeeded'}],invoices:[],subscriptions:[],limited:false};
   }
   if(b.action==='paypalContent')return b.operation==='list'?{pages:Array.from({length:5},(_,i)=>({id:'INV2-TEST-'+i,title:'Invoice '+i,status:'SENT',amount:'12.34',currency:'USD'})),scope:'Merchant invoices',more:false}:{title:'Invoice',text:'Original invoice\nAmount: 12.34 USD'};
   if(b.action==='weatherLoad')return null;return {ok:true};
  }}}};
 });
 await page.goto(worldUrl());
 await page.waitForFunction(()=>document.querySelector<HTMLElement>('#notionWorld')?.sceneMetrics?.modules.length>0,undefined,{timeout:60000});
 for(const key of ['stripe','paypal']){
  await page.evaluate(k=>location.hash='object=app-'+k,key);
  // Every record shows at once (#2048): the item area scrolls instead of paging.
  await page.waitForFunction(count=>document.querySelectorAll('.pixi-stage-item').length===count,key==='stripe'?6:5);
  await page.screenshot({path:'/tmp/worldlet-'+key+'-open.png'});
  await page.locator('.pixi-stage-item').first().click();await page.locator('.app-source-body').waitFor();
  await page.waitForFunction(k=>document.querySelector('.app-source-body')?.textContent.includes(k==='stripe'?'$123.45':'12.34 USD'),key);
  if(key==='stripe')assert.match(await page.locator('.app-source-body').innerText(),/Unavailable — incomplete read/);
  await page.locator('.pixi-selected-item').waitFor();
  await page.getByRole('button',{name:'Next item',exact:true}).click();
  await page.waitForFunction(k=>calls.some(c=>k==='stripe'?c.action==='stripe'&&c.operation==='customer':c.action==='paypalContent'&&c.operation==='read'&&c.id==='INV2-TEST-1'),key);
  await page.screenshot({path:'/tmp/worldlet-'+key+'-focus.png'});
  await page.locator('.applet-mode-web').click();await page.locator('.browser-viewport').waitFor();
  await page.locator('.applet-mode-native').click();await page.locator('.app-source-body').waitFor();
  await leaveApplet(page);await page.locator('.pixi-applet-stage').waitFor();
 }
 for(const key of ['oura','strava','fitbit','google-maps','airbnb','tripit','plaid']){
  await page.evaluate(k=>location.hash='object=app-'+k,key);await page.locator('.browser-viewport').waitFor();
  await page.waitForFunction(k=>document.querySelector<HTMLElement>('#notionContent').dataset.applet===k,key);
 }
 for(const region of ['health','travel','money']){await page.evaluate(r=>location.hash='building=building-'+r,region);await page.waitForFunction(r=>{const m=document.querySelector<HTMLElement>('#notionWorld').sceneMetrics;return m.active==='building-'+r&&m.camera.settled;},region);await page.screenshot({path:'/tmp/worldlet-'+region+'-region.png'});}
 assert.deepEqual(errors,[]);
 assert.equal(await page.evaluate(()=>calls.some(c=>['configure','send_invoice','pay_order','create_refund'].includes(c.operation))),false);
 console.log('PASS Money Open/Focus, correct currency units and incomplete totals, read-only dispatch, web escape and seven website Applets.');
});
