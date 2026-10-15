// Connecting PostHog with a pasted personal API key (ui/onboarding/world-onboarding.ts, TOKEN_PROVIDERS): the PostHog
// connection asks for its address (US Cloud by default), the project ID and the key, in a password field, instead of a
// browser sign-in; the key goes to the host's `connect` once with the settings, is cleared from the page at once and
// never shows in the guide, while the address and project stay for another try; a connected PostHog promises no
// background reads.
import assert from 'node:assert/strict';
import {bundleScript,withBrowser,pageErrors} from './browser-test.ts';

declare global {var TokenSetup:any;var tokenState:any;var tokenCalls:any[];var tokenRefuse:boolean;}
const PASTED='phx_'+'Ab1'.repeat(15);
await withBrowser(async browser=>{
 const page=await browser.newPage(),errors=pageErrors(page);
 const bundle=await bundleScript({entryPoints:['ui/onboarding/world-onboarding.ts'],globalName:'TokenSetup'});
 await page.setContent('<main><div id="guide"></div></main>');await page.addScriptTag({content:bundle});
 await page.evaluate(()=>{
  tokenCalls=[];tokenRefuse=true;tokenState={platform:'mac',onboarding:{completed:true},sources:[],knowledge:[],connections:[],cloudConsent:true};
  const call=async(action,body:any={})=>{
   tokenCalls.push({action,...body});
   if(action==='snapshot')return structuredClone(tokenState);
   if(action==='connect'){
    if(tokenRefuse)throw Error('PostHog did not accept this key. Check that it is a personal API key that has not expired, with read access to Project, Query, Insight, Dashboard, Feature flag and Annotation, then paste it again.');
    tokenState.connections=[{id:'hermes-posthog',provider:'posthog',connected:true,transport:'hermes'}];return {ok:true,connected:true};
   }
   throw Error('Unexpected native action '+action);
  };
  const view={metrics:{buildings:[]},revealGuide(){},openApplet(){},setGuide(value){const guide=document.getElementById('guide');guide.replaceChildren();if(value?.text)guide.append(document.createTextNode(value.text));if(value?.body)guide.append(value.body);for(const b of value?.actions||[])guide.append(b);}};
  TokenSetup.mountWorldOnboarding({root:document.querySelector('main'),state:tokenState,call,view}).show('connection','work','posthog');
 });
 const key=page.getByLabel('PostHog personal API key',{exact:true}),address=page.getByLabel('PostHog address',{exact:false}),project=page.getByLabel('Project ID',{exact:false});
 await key.waitFor();
 assert.equal(await key.getAttribute('type'),'password');
 assert.equal(await address.inputValue(),'https://us.posthog.com','US Cloud by default');
 const guide=await page.locator('#guide').innerText();
 assert.match(guide,/read access to Project, Query, Insight, Dashboard, Feature flag and Annotation/);
 assert.match(guide,/EU Cloud https:\/\/eu\.posthog\.com/);
 assert.ok(await page.evaluate(()=>!tokenCalls.some(c=>c.action==='connect')),'no browser sign-in starts for PostHog');
 // A refused key: one connect with the key and both settings, the key cleared, the reason shown; Try again keeps the settings.
 await address.fill('https://eu.posthog.com');await project.fill('12345');await key.fill(PASTED);
 await page.getByRole('button',{name:'Connect PostHog',exact:true}).click();
 await page.getByRole('button',{name:'Try again',exact:true}).waitFor();
 assert.match(await page.locator('#guide').innerText(),/PostHog did not accept this key/);
 assert.deepEqual(await page.evaluate(()=>tokenCalls.filter(c=>c.action==='connect').map(c=>[c.provider,c.token,c.settings])),[['posthog',PASTED,{host:'https://eu.posthog.com',project:'12345'}]]);
 assert.ok(!(await page.locator('#guide').innerText()).includes(PASTED));
 await page.getByRole('button',{name:'Try again',exact:true}).click();
 await key.waitFor();
 assert.equal(await key.inputValue(),'','the pasted key is not kept in the page');
 assert.equal(await address.inputValue(),'https://eu.posthog.com');assert.equal(await project.inputValue(),'12345');
 // An accepted key connects, and promises nothing in the background.
 await page.evaluate(()=>{tokenRefuse=false;});
 await key.fill(PASTED);
 await page.getByRole('button',{name:'Connect PostHog',exact:true}).click();
 await page.getByText('PostHog is connected',{exact:false}).waitFor();
 assert.match(await page.locator('#guide').innerText(),/Nothing is read in the background/);
 assert.ok(!(await page.content()).includes(PASTED),'the key is nowhere in the page');
 assert.deepEqual(errors,[]);
 console.log('PASS PostHog key: address (US Cloud by default), project ID and a password field, one connect per paste with its settings, key cleared at once while the settings stay, refused key explained and asked again, accepted key connects with no background reads promised');
});
