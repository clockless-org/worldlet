import {chromium} from 'playwright';import {build} from 'esbuild';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';

 const bundle=await build({entryPoints:['ui/hud/dev-build-update.ts'],bundle:true,format:'iife',globalName:'DevBuildUI',write:false});
 const browser=await chromium.launch({headless:true});try{
 const page=await browser.newPage({viewport:{width:1100,height:760}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.setContent('<style>body{margin:0;background:#c8d4bd;font:14px system-ui}.native-console{position:relative;width:100vw;height:100vh}.ui-button{font:inherit;padding:8px 12px;border-radius:9px;border:1px solid #9baa8e;background:#f4eedc;color:#293c28}</style><main class="native-console"><input aria-label="Unfinished work" value="Unsaved message"><div class="world-update-dock" aria-label="App update"><button type="button" class="world-footer-update ui-button" hidden>Update</button></div></main>');
 await page.addStyleTag({content:fs.readFileSync('ui/components/layout.css','utf8')});await page.addScriptTag({content:bundle.outputFiles[0].text});
 await page.evaluate(()=>{(window as any).requests=[];(window as any).state={supported:true,online:true,candidate:null};(window as any).dispose=(window as any).DevBuildUI.mountDevBuildUpdate(document.querySelector('.world-update-dock'),async(action,body)=>{if(action==='devBuildStatus')return (window as any).state;(window as any).requests.push({action,body});return {accepted:true};});});
 if(await page.locator('.dev-build-update').isVisible())throw Error('No candidate must stay hidden');
 const age=await page.evaluate(()=>{const now=Date.parse('2026-09-30T12:00:00Z'),at=m=>new Date(now-m*60000).toISOString();return [(window as any).DevBuildUI.commitAge(at(0),now),(window as any).DevBuildUI.commitAge(at(12),now),(window as any).DevBuildUI.commitAge(at(180),now),(window as any).DevBuildUI.commitAge(at(60*72),now),(window as any).DevBuildUI.commitAge('bad',now)];});
 if(JSON.stringify(age)!==JSON.stringify(['just now','12m ago','3h ago','3d ago','']))throw Error('Commit age: '+JSON.stringify(age));
 if(JSON.stringify(await page.evaluate(()=>{const ui=(window as any).DevBuildUI;return [ui.commitsBehind(1),ui.commitsBehind(12),ui.commitsBehind(0),ui.commitsBehind(undefined)];}))!==JSON.stringify(['1 commit behind','12 commits behind','','']))throw Error('Commits behind wording');
 // Only how many commits behind: no PR number, no sha, no time (owner 2026-10-04).
 await page.evaluate(()=>(window as any).state.candidate={id:'a'.repeat(24),revision:'1'.repeat(40),committedAt:new Date(Date.now()-5*60000).toISOString(),pr:1633,behind:3});
 const capsule=page.getByRole('button',{name:/^Apply · /});await capsule.waitFor();
 const text=await page.locator('.dev-build-update-label').textContent();if(text!=='Apply · 3 commits behind')throw Error('One capsule with how many commits behind: '+text);
 if(await page.getByRole('textbox').inputValue()!=='Unsaved message')throw Error('Ready discarded input');
 // The same capsule as Update, in the bottom-left update dock (owner report 2026-10-02: the underlined word was missed).
 const box=await capsule.boundingBox(),vh=page.viewportSize().height;
 if(box.x>20||Math.abs(vh-(box.y+box.height)-16)>2||box.height<44)throw Error('Apply must be a 44px capsule in the bottom-left dock: '+JSON.stringify(box));
 if(!await capsule.evaluate(b=>b.classList.contains('world-footer-update')))throw Error('Apply uses the Update button style');
 await page.screenshot({path:path.join(os.tmpdir(),'worldlet-dev-update.png')});
 // Fox dismisses its bubble on a root pointerdown unless the event is marked; the notice marks its own.
 await page.evaluate(()=>{(window as any).keepFox=[];document.querySelector('main').addEventListener('pointerdown',e=>(window as any).keepFox.push(!!(e as any).worldletKeepFox));});
  await page.evaluate(()=>(window as any).state.online=false);await page.waitForFunction(()=>(document.querySelector('.dev-build-update') as HTMLButtonElement).disabled);
 if(!/watcher offline/.test(await page.locator('.dev-build-update-label').textContent()))throw Error('Offline must say so');
 if(await page.getByRole('textbox').inputValue()!=='Unsaved message')throw Error('Offline changed input');
 await page.evaluate(()=>(window as any).state.online=true);await page.waitForFunction(()=>!(document.querySelector('.dev-build-update') as HTMLButtonElement).disabled);
 // Fixture-only button exercise. This request callback cannot launch or restart a product.
 await page.locator('.dev-build-update').dispatchEvent('pointerdown');
 if(JSON.stringify(await page.evaluate(()=>(window as any).keepFox))!=='[true]')throw Error('Pressing Apply must not count as a click away from Fox');
 await capsule.click();
 const calls=await page.evaluate(()=>(window as any).requests);if(calls.length!==1||calls[0].action!=='devBuildApply'||calls[0].body.id!=='a'.repeat(24))throw Error('Apply must target the visible exact candidate once');
 if(await page.getByRole('textbox').inputValue()!=='Unsaved message')throw Error('UI itself must not reload');
 await page.evaluate(()=>{(window as any).dispose();(window as any).state={supported:false};(window as any).DevBuildUI.mountDevBuildUpdate(document.querySelector('.world-update-dock'),async()=>(window as any).state);});
 if(await page.locator('.dev-build-update').isVisible())throw Error('Unsupported host must hide');
 if(errors.length)throw Error(errors.join('\n'));
 console.log('PASS Dev Apply: an Update-style capsule in the bottom-left dock with how many commits behind; preserves input; keeps Fox; offline disables; exact-ID explicit Apply; unsupported host hidden');
 }finally{await browser.close();}
