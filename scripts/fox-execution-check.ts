import assert from 'node:assert/strict';
import {withBrowser,fileAccess,pageErrors,worldUrl,waitForWorld} from './browser-test.ts';
await withBrowser(fileAccess,async browser=>{
 const page=await browser.newPage({viewport:{width:1280,height:900},reducedMotion:'reduce'});page.setDefaultTimeout(15000);
 const errors=pageErrors(page);
 await page.addInitScript(()=>{
  window.calls=[];let authorized=false;
  window.webkit={messageHandlers:{worldlet:{async postMessage(b){calls.push(b);
   if(b.action==='snapshot')return {workspaceId:'execution',revision:0,sources:[],knowledge:[],connections:[],worldItems:[],onboarding:{completed:true},sampleEnabled:false,cloudConsent:true};
   if(b.action==='modelStatus')return {available:true,cloudAllowed:true};
   if(b.action==='foxPreferences')return {cloudConsent:true,model:{ready:true,provider:'custom',name:'Fixture'}};
   if(b.action==='developmentSessions')return b.operation==='read'?{messages:[{role:'assistant',text:'Saved Claude reply.'}]}:{providers:[{provider:'claude',state:'ready',sessions:[{id:'claude:one',sessionId:'fixture-session',title:'Resume this project',cwd:'/fixture',status:'Saved'}]}]};
   if(b.action==='claudeSession'&&b.operation==='send'){
    await window.worldletClaudeEvent({type:'delta',text:'Looking at this project.'});
    const permission=await window.worldletClaudeEvent({type:'permission',id:'permission-one',tool:'Edit',input:{file_path:'/fixture/readme.md',old_string:'old',new_string:'new'}});
    if(!permission.allow)return {message:'Edit denied.'};
    return {message:'The selected Claude session continued.'};
   }
   if(b.action==='emailAction'){
    if(b.operation==='cancel')throw Error('Sending was already attempted. Check Sent mail.');
    if(b.operation==='authorize'){authorized=true;return {ok:true};}
    if(b.operation==='send')return authorized?{status:'sent',messageId:'receipt-one'}:{needsAuthorization:true};
   }
   return {ok:true};
  }}}};
 });
 await page.goto(worldUrl());
 await waitForWorld(page);
 await page.evaluate(()=>location.hash='object=app-claude-code');
 await page.getByRole('button',{name:/Resume this project/}).click();
 await page.getByText('Saved Claude reply.',{exact:true}).waitFor();
 await page.evaluate(()=>window.worldletShowControls('preferences'));
 await page.locator('#notionInput').fill('Continue this task');await page.locator('#notionInput').press('Enter');
 await page.getByRole('button',{name:'Allow once',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('#worldConversation')?.textContent.includes('The selected Claude session continued.'));
 assert.equal(await page.evaluate(()=>calls.find(c=>c.action==='claudeSession'&&c.operation==='send')?.id),'fixture-session');
 assert.equal(await page.evaluate(()=>calls.filter(c=>c.action==='agentChat').length),0);
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('worldlet:email-review',{detail:{id:'draft-one',draft:{from:'me@example.com',to:'alex@example.com',subject:'Japan plan',body:'The plan read from Notion.'}}})));
 await page.locator('.fox-email-review').waitFor();
 assert.match(await page.locator('.fox-email-review').textContent(),/alex@example.com/);
 const actions=page.locator('.companion-guide-actions');
 await actions.getByRole('button',{name:'Send',exact:true}).click();
 await actions.getByRole('button',{name:'Allow sending',exact:true}).click();
 assert.equal(await page.evaluate(()=>calls.filter(c=>c.action==='emailAction'&&c.operation==='send').length),1,'authorizing does not send');
 await actions.getByRole('button',{name:'Send',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('.companion-guide')?.textContent.includes('Sent to alex@example.com.')||document.body.textContent.includes('Sent to alex@example.com.'));
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('worldlet:email-review',{detail:{id:'uncertain',draft:{from:'me@example.com',to:'alex@example.com',subject:'Uncertain',body:'Fixture'}}})));
 await actions.getByRole('button',{name:'Cancel',exact:true}).click();
 await page.getByText('Sending was already attempted. Check Sent mail.',{exact:true}).waitFor();
 assert.equal(await actions.getByRole('button',{name:'Send',exact:true}).isEnabled(),true,'cancel failure retains the review');
 assert.deepEqual(errors,[]);
 console.log('PASS selected Claude session, explicit tool approval, complete email review and separate authorize/send');
});
