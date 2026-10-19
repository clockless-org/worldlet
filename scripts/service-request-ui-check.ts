import assert from 'node:assert/strict';
import {withBrowser,fileAccess,pageErrors,worldUrl,waitForWorld} from './browser-test.ts';
// An Agent's first need of a Service on its Attention card (agent/agent/GRANTS.md#when-an-agent-first-needs-a-service):
// Allow and Not now go to the host's `serviceRequest` with only the request's ID; a Service that is not connected and
// signs in is connected from the card (the host's `connect`, into its Thing's region) before Allow; one that takes a key
// opens Settings › Connectors. Never the ordinary item status. Bundled UI, faked bridge, fictional requests.
await withBrowser(fileAccess,async browser=>{
 const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'});page.setDefaultTimeout(15000);
 const errors=pageErrors(page);
 await page.addInitScript(()=>{
  const w=window as any;w.calls=[];w.opened=[];
  // Settings would open over the card: recorded here and stopped, so the card can still be answered.
  window.addEventListener('worldlet:companion-info',e=>{w.opened.push((e as CustomEvent).detail);e.stopImmediatePropagation();});
  const request=(agentId:string,agentName:string,provider:string,service:string,connected:boolean,signIn:boolean,title:string)=>({id:'service-request:'+agentId+'.'+provider,provider:'agents',kind:'task',title,
   reason:agentName+' asks to look at '+service,context:'Before anything is changed, Worldlet asks you.',summary:'Before anything is changed, Worldlet asks you.',attentionReason:'Before anything is changed, Worldlet asks you.',
   attentionContentVersion:1,status:'open',statusOrigin:'agent',policyVersion:2,sources:[{provider:'agents',id:agentId+'.'+provider,quote:title}],
   agentId,agentName,serviceRequestId:agentId+'.'+provider,serviceRequestProvider:provider,serviceRequestService:service,serviceRequestConnected:connected,serviceRequestSignIn:signIn,
   ...signIn?{serviceRequestRegion:'work'}:{},serviceRequestStatus:'pending'});
  w.fixture={workspaceId:'service-request',revision:0,sources:[],knowledge:[],onboarding:{completed:true},sampleEnabled:false,cloudConsent:true,connections:[],
   worldItems:[
    request('codex','Codex','posthog','PostHog',true,true,'Codex wants to look at your PostHog.'),
    request('claude-code','Claude Code','cloudflare','Cloudflare',false,true,'Claude Code wants to use Cloudflare. It isn\'t connected yet.'),
    request('codex','Codex','github','GitHub',false,false,'Codex wants to use GitHub. It isn\'t connected yet.')]};
  w.webkit={messageHandlers:{worldlet:{async postMessage(b:any){w.calls.push(b);
   if(b.action==='snapshot')return structuredClone(w.fixture);
   if(b.action==='modelStatus')return {available:true,cloudAllowed:true};
   if(b.action==='appContent')return {pages:[]};
   if(b.action==='weatherLoad')return null;
   if(b.action==='connect')return {ok:true,connected:true};
   if(b.action==='serviceRequest'){
    const item=w.fixture.worldItems.find((i:any)=>i.serviceRequestId===b.id);
    const status=b.operation==='allow'?'allowed':'declined';
    item.status=status==='allowed'?'done':'dismissed';item.serviceRequestStatus=status;w.fixture.revision++;
    return {ok:true,status};
   }
   return {ok:true};
  }}}};
 });
 await page.goto(process.env.WORLDLET_TEST_URL||worldUrl());
 const row=(id:string)=>page.locator('.world-matter[data-world-item-id="'+id+'"]');
 const preview=page.locator('#attentionPreview');
 const sent=()=>page.evaluate(()=>(window as any).calls.filter((c:any)=>['serviceRequest','connect','worldItemStatus','agentAccess'].includes(c.action)));
 await row('service-request:codex.posthog').waitFor();
 await waitForWorld(page);
 // Connected: Allow and Not now; Allow sends only the request's ID.
 await row('service-request:codex.posthog').click({timeout:30000});await preview.waitFor({state:'visible'});
 assert.deepEqual(await preview.locator('.attention-preview-action').allTextContents(),['Allow','Not now']);
 await preview.getByRole('button',{name:'Allow'}).click();
 await page.waitForFunction(()=>(window as any).calls.some((c:any)=>c.action==='serviceRequest'));
 assert.deepEqual(await sent(),[{action:'serviceRequest',operation:'allow',id:'codex.posthog'}]);
 await page.waitForFunction(()=>document.body.innerText.includes('Codex can now look at your PostHog.'));
 // Not connected, signs in: Connect Cloudflare connects it into its Thing's region, then allows.
 await row('service-request:claude-code.cloudflare').click({timeout:30000});
 await preview.getByRole('button',{name:'Connect Cloudflare'}).waitFor();
 assert.deepEqual(await preview.locator('.attention-preview-action').allTextContents(),['Connect Cloudflare','Not now']);
 await preview.getByRole('button',{name:'Connect Cloudflare'}).click();
 await page.waitForFunction(()=>(window as any).calls.filter((c:any)=>c.action==='serviceRequest').length===2);
 assert.deepEqual((await sent()).slice(1),[{action:'connect',provider:'cloudflare',region:'work'},{action:'serviceRequest',operation:'allow',id:'claude-code.cloudflare'}]);
 // Takes a key: Open Connectors opens Settings › Connectors and answers nothing; Not now declines.
 await row('service-request:codex.github').click({timeout:30000});
 await preview.getByRole('button',{name:'Open Connectors'}).waitFor();
 assert.deepEqual(await preview.locator('.attention-preview-action').allTextContents(),['Open Connectors','Allow','Not now']);
 await preview.getByRole('button',{name:'Open Connectors'}).click();
 assert.deepEqual(await page.evaluate(()=>(window as any).opened),[{tab:'Settings',setting:'connectors'}]);
 assert.equal((await sent()).length,3,'opening Connectors answers nothing');
 await preview.getByRole('button',{name:'Not now'}).click();
 await page.waitForFunction(()=>(window as any).calls.filter((c:any)=>c.action==='serviceRequest').length===3);
 assert.deepEqual((await sent()).at(-1),{action:'serviceRequest',operation:'decline',id:'codex.github'});
 assert.equal((await sent()).some((c:any)=>c.action==='worldItemStatus'||c.action==='agentAccess'),false,'only serviceRequest decides');
 assert.deepEqual(errors,[]);
});
console.log('PASS Service requests on their Attention cards: Allow and Not now send only the request ID; Connect signs in into the Thing\'s region, then allows; a key service opens Settings › Connectors');
