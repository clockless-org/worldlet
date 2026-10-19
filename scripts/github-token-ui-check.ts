// Connecting GitHub from the World (ui/shell/world-onboarding.ts): by default it signs in with GitHub's code, shown
// in Fox's bubble with Copy and open GitHub (ui/settings/sign-in-code.ts). Under Advanced, GitHub with a key
// (TOKEN_PROVIDERS) shows one password field with the access it needs; what is pasted goes to the host's `connect`
// once, is cleared from the page at once and never shows in the guide; a refused token says why and asks again.
import assert from 'node:assert/strict';
import {bundleScript,withBrowser,pageErrors} from './browser-test.ts';

declare global {var TokenSetup:any;var tokenGuide:any;var tokenState:any;var tokenCalls:any[];var tokenRefuse:boolean;var signIn:any;var copied:string[];}
const PASTED='github_pat_'+'Ab1'.repeat(20);
await withBrowser(async browser=>{
 const page=await browser.newPage(),errors=pageErrors(page);
 const bundle=await bundleScript({entryPoints:['ui/shell/world-onboarding.ts'],globalName:'TokenSetup'});
 await page.setContent('<main><div id="guide"></div></main>');await page.addScriptTag({content:bundle});
 await page.evaluate(()=>{
  tokenCalls=[];tokenRefuse=true;copied=[];Object.defineProperty(navigator,'clipboard',{value:{writeText:async(text:string)=>{copied.push(text);}}});tokenState={platform:'mac',onboarding:{completed:true},sources:[],knowledge:[],connections:[],cloudConsent:true};
  const call=async(action,body:any={})=>{
   tokenCalls.push({action,...body});
   if(action==='snapshot')return structuredClone(tokenState);
   if(action==='openSystemBrowser')return {ok:true};
   if(action==='connect'){
    // No key: GitHub's code sign-in, open until the check finishes it.
    if(!body.token){await new Promise(resolve=>{signIn=resolve;});tokenState.connections=[{id:'hermes-github',provider:'github',connected:true,transport:'hermes'}];return {ok:true,connected:true};}
    if(tokenRefuse)throw Error('GitHub did not accept this token. Check that it has not expired and has read access to Issues, Pull requests and Metadata, then paste it again.');
    tokenState.connections=[{id:'hermes-github',provider:'github',connected:true,transport:'hermes'}];return {ok:true,connected:true};
   }
   throw Error('Unexpected native action '+action);
  };
  const view={metrics:{buildings:[]},revealGuide(){},openApplet(){},setGuide(value){const guide=document.getElementById('guide');guide.replaceChildren();if(value?.text)guide.append(document.createTextNode(value.text));if(value?.body)guide.append(value.body);for(const b of value?.actions||[])guide.append(b);}};
  tokenGuide=TokenSetup.mountWorldOnboarding({root:document.querySelector('main'),state:tokenState,call,view});tokenGuide.show('connection','work','github');
 });
 // The code: in Fox's bubble, large, with one button that copies it and opens GitHub's page.
 await page.waitForFunction(()=>tokenCalls.some(c=>c.action==='connect'));
 assert.deepEqual(await page.evaluate(()=>tokenCalls.filter(c=>c.action==='connect')),[{action:'connect',provider:'github',region:'work'}]);
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('worldlet:sign-in-code',{detail:{provider:'github',code:'WDJB-MJHT',url:'https://github.com/login/device'}})));
 await page.getByText(/Your GitHub code: WDJB-MJHT/).waitFor();
 await page.getByRole('button',{name:'Copy and open GitHub',exact:true}).click();
 await page.waitForFunction(()=>tokenCalls.some(c=>c.action==='openSystemBrowser'));
 assert.deepEqual(await page.evaluate(()=>[copied,tokenCalls.filter(c=>c.action==='openSystemBrowser').map(c=>c.url)]),[['WDJB-MJHT'],['https://github.com/login/device']]);
 await page.evaluate(()=>signIn());
 await page.getByText('GitHub is connected',{exact:false}).waitFor();
 // Advanced: GitHub with a key.
 await page.evaluate(()=>{tokenState.connections=[];tokenCalls.length=0;tokenGuide.update(structuredClone(tokenState));tokenGuide.show('sources','work');});
 await page.locator('[data-advanced] summary').click();
 await page.getByRole('button',{name:'GitHub with a key',exact:true}).click();
 const field=page.getByLabel('GitHub token',{exact:true});
 await field.waitFor();
 assert.equal(await field.getAttribute('type'),'password');
 assert.match(await page.locator('#guide').innerText(),/read-only access to Issues, Pull requests and Metadata/);
 assert.ok(await page.evaluate(()=>!tokenCalls.some(c=>c.action==='connect')),'the key form starts no sign-in');
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
 console.log('PASS GitHub from the World: the code in Fox\'s bubble with Copy and open GitHub; under Advanced a password field with the scopes it needs, one connect per paste, cleared at once, refused token explained and asked again, accepted token connects');
});
