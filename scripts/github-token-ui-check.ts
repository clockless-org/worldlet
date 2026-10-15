// Connecting GitHub with a pasted token (ui/onboarding/world-onboarding.ts, TOKEN_PROVIDERS): the GitHub connection
// shows one password field with the scopes it needs instead of a browser sign-in; what is pasted goes to the host's
// `connect` once, is cleared from the page at once and never shows in the guide; a refused token says why and asks again.
import assert from 'node:assert/strict';
import {bundleScript,withBrowser,pageErrors} from './browser-test.ts';

declare global {var TokenSetup:any;var tokenGuide:any;var tokenState:any;var tokenCalls:any[];var tokenRefuse:boolean;}
const PASTED='github_pat_'+'Ab1'.repeat(20);
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
    if(tokenRefuse)throw Error('GitHub did not accept this token. Check that it has not expired and has read access to Issues, Pull requests and Metadata, then paste it again.');
    tokenState.connections=[{id:'hermes-github',provider:'github',connected:true,transport:'hermes'}];return {ok:true,connected:true};
   }
   throw Error('Unexpected native action '+action);
  };
  const view={metrics:{buildings:[]},revealGuide(){},openApplet(){},setGuide(value){const guide=document.getElementById('guide');guide.replaceChildren();if(value?.text)guide.append(document.createTextNode(value.text));if(value?.body)guide.append(value.body);for(const b of value?.actions||[])guide.append(b);}};
  tokenGuide=TokenSetup.mountWorldOnboarding({root:document.querySelector('main'),state:tokenState,call,view});tokenGuide.show('connection','work','github');
 });
 const field=page.getByLabel('GitHub token',{exact:true});
 await field.waitFor();
 assert.equal(await field.getAttribute('type'),'password');
 assert.match(await page.locator('#guide').innerText(),/read-only access to Issues, Pull requests and Metadata/);
 assert.ok(await page.evaluate(()=>!tokenCalls.some(c=>c.action==='connect')),'no browser sign-in starts for GitHub');
 // A refused token: one connect with it, the field cleared, the reason shown, and Try again asks for a token again.
 await field.fill(PASTED);
 await page.getByRole('button',{name:'Connect GitHub',exact:true}).click();
 await page.getByRole('button',{name:'Try again',exact:true}).waitFor();
 assert.match(await page.locator('#guide').innerText(),/GitHub did not accept this token/);
 assert.deepEqual(await page.evaluate(()=>tokenCalls.filter(c=>c.action==='connect').map(c=>[c.provider,c.token])),[['github',PASTED]]);
 assert.ok(!(await page.locator('#guide').innerText()).includes(PASTED));
 await page.getByRole('button',{name:'Try again',exact:true}).click();
 await field.waitFor();assert.equal(await field.inputValue(),'','the pasted token is not kept in the page');
 // An accepted token connects.
 await page.evaluate(()=>{tokenRefuse=false;});
 await field.fill(PASTED);
 await page.getByRole('button',{name:'Connect GitHub',exact:true}).click();
 await page.getByText('GitHub is connected',{exact:false}).waitFor();
 assert.ok(!(await page.content()).includes(PASTED),'the token is nowhere in the page');
 assert.deepEqual(errors,[]);
 console.log('PASS GitHub token: a password field with the scopes it needs, one connect per paste, cleared at once, refused token explained and asked again, accepted token connects');
});
