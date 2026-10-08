// Fox's name tag at its feet (ui/companion/fox-name-tag.ts, owner request 2026-10-07) on the real World page with a
// fake host: at rest it says the name, centered just under Fox's paws without covering them; while a chat turn waits it says Thinking…;
// work outside the chat (the day's plan) shows there through `worldlet:fox-status` and leaves when it ends; selecting
// it opens the message bar like selecting Fox.
import assert from 'node:assert/strict';
import {withBrowser,fileAccess,pageErrors,worldUrl} from './browser-test.ts';
const fixture=()=>{const w=window as any;w.webkit={messageHandlers:{worldlet:{postMessage(b:any){
 if(b.action==='snapshot')return Promise.resolve({workspaceId:'name-tag-fixture',revision:0,sources:[],knowledge:[],worldItems:[],connections:[],onboarding:{completed:true},sampleEnabled:false,cloudConsent:true});
 if(b.action==='modelStatus')return Promise.resolve({available:true,cloudAllowed:true});
 if(b.action==='agentChat')return new Promise(()=>{});
 return Promise.resolve({ok:true});
}}}};};
await withBrowser(fileAccess,async browser=>{
 const page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'}),errors=pageErrors(page);
 await page.addInitScript(fixture);
 await page.goto(worldUrl());await page.locator('#worldStartup').waitFor({state:'detached'});
 const tag=page.locator('.companion-pet .fox-name-tag'),status=tag.locator('.fox-name-tag-status');
 await tag.waitFor({state:'visible'});
 assert.equal((await tag.innerText()).trim(),'Fox','the name at rest');assert.equal(await status.isVisible(),false);
 {const t=(await tag.boundingBox())!,f=(await page.locator('.companion-avatar').boundingBox())!,bar=(await page.locator('#notionCommand').boundingBox())!;
  assert(Math.abs(t.x+t.width/2-(f.x+f.width/2))<2,'centered under Fox');
  assert(t.y<f.y+f.height&&t.y+t.height>f.y+f.height-8,'at Fox’s feet');
  assert(t.y>=f.y+f.height-4,'under Fox’s paws, not over them');
  assert(t.y+t.height<=bar.y+2,'above the message bar');
  assert.equal(await page.evaluate(([x,y])=>!!document.elementFromPoint(x,y)?.closest('.fox-name-tag'),[t.x+t.width/2,t.y+t.height/2]),true,'drawn over Fox, not under it');}
 // Work outside the chat says what it is doing on the tag, not in a card.
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('worldlet:fox-status',{detail:{source:'daily',text:'Making today’s plan…'}})));
 assert.equal(await status.innerText(),'Making today’s plan…');assert.equal(await tag.getAttribute('data-busy'),'true');
 assert.equal(await page.locator('#companionDialogue').isVisible(),false,'no card for it');
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('worldlet:fox-status',{detail:{source:'daily',text:''}})));
 assert.equal(await status.isVisible(),false,'gone when the work ends');assert.equal((await tag.innerText()).trim(),'Fox');
 // Selecting the tag is selecting Fox: the bar opens to type.
 await tag.click();
 await page.waitForFunction(()=>(document.querySelector('.notion-world') as HTMLElement)?.dataset.entryExpanded==='true');
 // A chat turn waiting on Fox shows on the tag.
 await page.locator('#notionInput').fill('What is on today?');await page.keyboard.press('Enter');
 await page.waitForFunction(()=>document.querySelector('.fox-name-tag-status')?.textContent==='Thinking…');
 // Work outside the chat names itself over a turn that would only say Thinking… (a quiet turn runs the day's plan).
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('worldlet:fox-status',{detail:{source:'daily',text:'Making today’s plan…'}})));
 assert.equal(await status.innerText(),'Making today’s plan…');
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('worldlet:fox-status',{detail:{source:'daily',text:''}})));
 assert.equal(await status.innerText(),'Thinking…');
 assert.deepEqual(errors,[]);
});
console.log('Fox name tag check passed');
