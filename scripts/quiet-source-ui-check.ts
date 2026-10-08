import assert from 'node:assert/strict';
import {withBrowser,fileAccess,pageErrors,worldUrl} from './browser-test.ts';
await withBrowser(fileAccess,async browser=>{
 const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'});page.setDefaultTimeout(15000);const errors=pageErrors(page);
 await page.addInitScript(()=>{const w=window as any;w.calls=[];w.fixture={workspaceId:'quiet-source',revision:0,sources:[],knowledge:[],worldItems:[],onboarding:{completed:true},sampleEnabled:false,cloudConsent:true,connections:[{id:'gmail',provider:'gmail',connected:true,syncStatus:'sync_error',failed:true}]};w.webkit={messageHandlers:{worldlet:{async postMessage(b){w.calls.push(b);if(b.action==='snapshot')return structuredClone(w.fixture);if(b.action==='appContent')throw Error('Network timed out');if(b.action==='weatherLoad')return null;if(b.action==='modelStatus')return {available:true};return {ok:true};}}}};});
 await page.goto(worldUrl());
 await page.locator('#worldStartup').waitFor({state:'detached',timeout:60000});
 // Enter Mail the way a person does (a restored location does not start a read).
 await page.evaluate(()=>location.hash='building=building-home');
 await page.locator('.notion-pin[data-page="place-app-gmail"]').focus();await page.keyboard.press('Enter');
 await page.locator('.mail-attention-board').waitFor();
 await page.waitForFunction(()=>(window as any).calls.some(b=>b.action==='appContent'));
 // The empty board is its painted slots: no error or retry copy replaces it.
 assert.equal(await page.locator('.mail-attention-board .pixi-stage-item').count(),0);
 assert.equal(await page.locator('.pixi-open-empty').count(),0,'A failed inventory read adds no explanatory error text');
 assert.equal(await page.locator('.companion-source-alert').isVisible(),false);
 assert.ok(!/read did not finish|Ask Fox to retry|Network timed out/.test(await page.locator('#notionWorld').innerText()));
 await page.evaluate(()=>{const w=window as any;w.fixture.connections[0].syncError='Your Google sign-in expired or was revoked. Reconnect with Fox.';w.fixture.revision++;w.worldletReceive(structuredClone(w.fixture));});
 await page.locator('.companion-source-alert').waitFor({state:'visible'});
 await page.locator('.companion-source-alert').click();
 await page.getByRole('button',{name:'Reconnect Mail',exact:true}).waitFor();
 await page.screenshot({path:'/private/tmp/quiet-source-alert.png'});
 await page.evaluate(()=>{const w=window as any;delete w.fixture.connections[0].syncError;w.fixture.connections[0].syncStatus='connected';w.fixture.connections[0].failed=false;w.fixture.revision++;w.worldletReceive(structuredClone(w.fixture));});
 await page.locator('.companion-source-alert').waitFor({state:'hidden'});
 assert.deepEqual(errors,[]);console.log('PASS silent failed mail inventory, neutral empty state, actionable Fox badge and recovery');
});
