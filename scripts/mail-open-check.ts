import assert from 'node:assert/strict';
import {mailMatters,mailCategory} from '../ui/applets/gmail/open.ts';
import {coreAppletItems} from '../ui/world/applet-content.ts';
const raw=(id,threadId)=>({id,title:'Same subject',record:{id,title:'Same subject',threadId}});
const groups=mailMatters([raw('a','one'),raw('b','one'),raw('c','two'),raw('d',undefined)]);
assert.equal(groups.length,3);assert.equal(groups[0].messageCount,2);assert.equal(groups[2].messageCount,1);
const projected=coreAppletItems('gmail',[{id:'a',threadId:'one',title:'Original subject'},{id:'b',threadId:'one',title:'Re: Original subject'}],[{worldItemId:'task',sourceProvider:'gmail',sourceId:'world-item:task',title:'Reply about the proposal',worldItemSources:[{provider:'gmail',id:'thread:one'}],worldItemSignal:{priority:'high'},worldItemKind:'task',worldItemStatus:'open'}]);
assert.equal(projected.length,1);assert.equal(projected[0].record.title,'Original subject');assert.equal(projected[0].record.messageCount,2);
console.log('PASS mail matters: exact thread identity, source subject, multi-message layers, no title-based grouping.');

assert.equal(mailCategory({record:{labelIds:['CATEGORY_PROMOTIONS']}}),'promotions');
assert.equal(mailCategory({record:{labelIds:['SPAM','CATEGORY_PROMOTIONS']}}),'spam');
assert.equal(mailCategory({attention:{state:'task'},record:{labelIds:['SPAM']}}),'attention');
assert.equal(mailCategory({record:{title:'Special offer'}}),'other','never infer spam from a title');

// Exercise the actual Open renderer in a real scene (ui/applets/scene) with more than nine attention threads.
const {build}=await import('esbuild'),{readFile}=await import('node:fs/promises'),{launchTestBrowser}=await import('./browser-test.ts');
const bundle=await build({entryPoints:['scripts/fixtures/mail-open-entry.ts'],bundle:true,format:'iife',globalName:'MailOpen',write:false});
const browser=await launchTestBrowser();
try{
 const page=await browser.newPage({viewport:{width:1440,height:950}});
 await page.setContent('<div id="notionWorld" style="position:absolute;inset:0;font-family:system-ui"><section class="pixi-applet-stage" data-scene="gmail" data-applet="gmail"></section></div>');
 for(const file of ['ui/frame/pixi-world.css','ui/applets/scene/applet-scene.css','ui/applets/gmail/focus.css','ui/applets/gmail/open.css'])await page.addStyleTag({content:await readFile(file,'utf8')});
 await page.addScriptTag({content:bundle.outputFiles[0].text});
 const render=(items,value)=>page.evaluate(([items,value])=>{const w=window as any;w.scene?.destroy();w.scene=w.MailOpen.mountAppletScene(document.querySelector('section'),'gmail',{source:w.MailOpen.PLAIN_SCENE});w.MailOpen.renderMailOpen(w.scene.primary.element,items,value,item=>w.picked=item.id);},[items,value]);
 const items=Array.from({length:13},(_,i)=>({id:String(i),title:['Review the launch plan','Confirm Friday’s meeting','Feedback on the proposal'][i%3],attention:i<12?{state:'task',priority:'high'}:null,record:{title:['Review the launch plan','Confirm Friday’s meeting','Feedback on the proposal'][i%3],from:['Alice Chen <alice@example.com>','Sam Miller <sam@example.com>','Jamie Lee <jamie@example.com>'][i%3],date:new Date(Date.now()-3600000*(i+1)).toISOString(),threadId:String(i)}}));
 await render(items,{connected:true,loaded:true,accountLabel:'reader@example.test'});
 assert.equal(await page.locator('.mail-letter').count(),9,'at most nine attention letters');
 assert.equal(await page.locator('.mail-open-piles,.mail-board-pages,.mail-open-desk').count(),0);
 assert.equal(await page.getByRole('heading',{name:'Mail'}).count(),1);
 assert.equal(await page.locator('.mail-account').textContent(),'reader@example.test');
 await page.locator('.mail-letter').first().click();assert.equal(await page.evaluate(()=>(window as any).picked),'0');
 for(const width of [1440,1000,600]){
  await page.setViewportSize({width,height:950});
  assert.ok(await page.locator('.mail-letter').evaluateAll(letters=>letters.every(letter=>{
   const parts=['.mail-letter-avatar','.mail-letter-text','.mail-letter-side'].map(s=>letter.querySelector(s)!.getBoundingClientRect()),box=letter.getBoundingClientRect();
   const apart=(a,b)=>a.right<=b.left+1||b.right<=a.left+1;
   return apart(parts[0],parts[1])&&apart(parts[1],parts[2])&&parts.every(r=>r.left>=box.left-1&&r.right<=box.right+1);
  })),'portrait, text and time never overlap at '+width);
  assert.ok(await page.locator('.applet-scene-region').evaluate(r=>r.scrollWidth<=r.clientWidth+1),'no sideways scrolling at '+width);
 }
 await page.setViewportSize({width:1440,height:950});
 await page.screenshot({path:'/tmp/mail-open-scene.png'});
 await render([],{connected:true,loaded:true});
 assert.equal(await page.locator('.mail-empty').textContent(),'No letters need you right now.');
 await render([],{connected:true,loaded:false,error:'Network timed out'});
 assert.equal(await page.locator('.mail-empty').count(),0,'a failed read stays quiet');
 assert.ok(!(await page.locator('.applet-scene').innerText()).includes('Network timed out'));
 console.log('PASS Mail Open: nine attention threads on the scene\'s paper, selectable letters, quiet failed reads.');
}finally{await browser.close();}
