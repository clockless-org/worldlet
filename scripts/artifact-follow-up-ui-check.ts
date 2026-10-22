import assert from 'node:assert/strict';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {withBrowser,fileAccess,pageErrors,worldUrl} from './browser-test.ts';
// A follow-up on an Artifact runs in the background (owner request 2026-10-11, context/store/follow-up.ts): a next
// step on the card drafts its request in Fox's message bar; sent while the card is open, the card turns over and drops
// into the Doing now side beside Fox, the request goes to a background session (never a turn of the conversation), and
// what it makes comes back as a new card while the Doing now card goes. Typed words stay a turn; with other background
// work running, the follow-up is a turn too. Bundled UI with a faked native bridge; fictional cards, no model or account.
const SCREEN=process.env.WORLDLET_FOLLOW_UP_SCREEN||path.join(tmpdir(),'worldlet-artifact-follow-up.png');
await withBrowser(fileAccess,async browser=>{
 for(const motion of ['reduce','no-preference'] as const){
  const page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:motion});page.setDefaultTimeout(15000);
  const errors=pageErrors(page);
  await page.addInitScript(()=>{
   const w=window as any;w.calls=[];w.busy=false;
   const labs={title:'Which CASA lab',body:'The **TAC** lab is the cheapest and fits the deadline.',chart:null,size:'small',actions:[{label:'Book TAC',request:'Book the TAC Security assessment'}]};
   w.webkit={messageHandlers:{worldlet:{async postMessage(b:any){
    w.calls.push({action:b.action==='agentChat'&&b.background?'background':b.action,text:b.text,shown:b.shown});
    if(b.action==='snapshot')return {workspaceId:'x',revision:0,sources:[],knowledge:[],connections:[],onboarding:{completed:true},sampleEnabled:false,cloudConsent:true};
    if(b.action==='modelStatus')return {available:true,cloudAllowed:true};
    if(b.action==='foxPreferences')return {model:{name:'M',ready:true},cloudConsent:true,autoSync:true};
    if(b.action==='taskPanel')return {jobs:[],working:[]};
    if(b.action==='taskPanelPage')return {page:null};
    if(b.action==='agentChat'&&!b.background){if(b.text==='labs'){await w.worldletAgentTool(b.id,{id:'t-labs',name:'show_artifact',args:labs});return {message:'Here it is.'};}return {message:'Answered: '+b.text};}
    if(b.action==='agentChat'&&b.background){
     if(w.busy)throw new Error('Fox is busy with other background work.');
     // It runs until the check lets it finish, then shows what it made.
     await new Promise(done=>{w.finishBackground=done;});
     await w.worldletAgentTool(b.id,{id:'t-booked',name:'show_artifact',args:{title:'TAC booked',body:'Booked for **Tuesday**.',chart:null,size:'small',actions:null}});
     return {message:'Booked TAC.'};
    }
    if(b.action==='cloudRequest')return {status:200,body:{configured:false,authorized:false}};
    return {ok:true};
   }}}};
  });
  await page.goto(worldUrl());
  await page.locator('.companion-avatar').waitFor();
  const card=page.locator('#foxArtifact'),input=page.locator('#notionInput');
  const send=async(text?:string)=>{if(text!==undefined){await input.click();await input.fill(text);}await input.press('Enter');};
  const calls=(action:string)=>page.evaluate(action=>(window as any).calls.filter((c:any)=>c.action===action),action);
  await send('labs');
  await card.getByText('Which CASA lab').waitFor();
  // The next step drafts its request; sent, it goes to the background, not the conversation.
  await card.getByRole('button',{name:'Book TAC'}).click();
  assert.equal(await input.inputValue(),'Book the TAC Security assessment');
  const chats=(await calls('agentChat')).length;
  await send();
  const dock=page.locator('.task-group[data-group=now] .task-card[data-task-id="fox:follow-up"]');
  await dock.waitFor();
  if(motion==='no-preference'){await page.waitForTimeout(380);await page.screenshot({path:SCREEN});}
  await card.waitFor({state:'hidden'});
  await page.locator('.artifact-turned').waitFor({state:'detached'});
  assert.deepEqual([await dock.locator('.task-title').textContent(),await dock.locator('.task-when').textContent()],['Which CASA lab','Book the TAC Security assessment'],'its card beside Fox goes by the card’s title');
  const [asked]=await calls('background');
  assert.ok(asked.text.startsWith('Book the TAC Security assessment')&&asked.text.includes('follows up the card "Which CASA lab"'),asked.text);
  assert.equal(asked.shown,'Book the TAC Security assessment');
  assert.equal((await calls('agentChat')).length,chats,'not a turn of the conversation');
  assert.equal(await input.inputValue(),'','the bar is cleared');
  // Done: what it made comes back as a card, and the Doing now card goes.
  await page.evaluate(()=>(window as any).finishBackground());
  await card.getByText('TAC booked').waitFor();
  await dock.waitFor({state:'detached'});
  if(motion==='reduce'){
   // Words the person types while a card is open stay a turn of the conversation.
   await send('labs');
   await card.getByText('Which CASA lab').waitFor();
   await send('What does TAC stand for?');
   await page.getByText('Answered: What does TAC stand for?').waitFor();
   assert.equal((await calls('background')).length,1);
   // With other background work running, the follow-up is an ordinary turn.
   await page.evaluate(()=>{(window as any).busy=true;});
   await card.getByRole('button',{name:'Book TAC'}).click();
   await send();
   await page.getByText('Answered: Book the TAC Security assessment').waitFor();
   await dock.waitFor({state:'detached'});
  }
  assert.deepEqual(errors,[]);
  await page.close();
 }
});
console.log('PASS artifact follow-up: a next step sent while its card is open turns the card over into the Doing now side beside Fox and runs in the background, its result a new card; typed words and a busy moment stay turns');
