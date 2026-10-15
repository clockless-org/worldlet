/** Shared reminder surfaces, source routing and refresh focus at the review viewport. */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {build} from 'esbuild';
import {launchTestBrowser,pageErrors} from './browser-test.ts';
const bundle=await build({stdin:{contents:"export {mountAppletScene} from './ui/applets/scene/applet-scene.ts';export {renderRemindersOpen} from './ui/applets/apple-reminders/open.ts';",resolveDir:process.cwd(),loader:'ts'},bundle:true,format:'iife',globalName:'Reminder',write:false});
const browser=await launchTestBrowser();
try{
 const page=await browser.newPage({viewport:{width:1500,height:844}}),errors=pageErrors(page,{console:true});
 await page.setContent('<!doctype html><title>Shared reminder surfaces</title><main id="host" style="position:fixed;inset:0"></main>');
 await page.addStyleTag({content:(await Promise.all(['dist/WorldletWeb/worldlet-ui.css','ui/applets/scene/applet-scene.css'].map(p=>readFile(p,'utf8')))).join('\n')});
 await page.addScriptTag({content:bundle.outputFiles[0].text});
 await page.evaluate(()=>{
  const w=window as any;w.owner={};w.opened=[];w.drafts=0;
  w.items=['Plan the workshop','Return library books','Pack a notebook','Water the plants'].map((title,i)=>({id:'task-'+i,title,record:{title,list:i?'Personal':'Work',due:'2026-10-15',completed:i===3}}));
  w.value={sample:true,connected:true,now:new Date(2026,9,15,10).getTime(),reminders:{create:()=>w.drafts++}};
  w.mount=(distributed=true)=>{
   w.scene?.destroy();w.scene=w.Reminder.mountAppletScene(document.getElementById('host'),'apple-reminders',{source:{registration:{imageSize:[1500,844],sha256:'0'.repeat(64),regions:distributed?[
    {id:'main',role:'primary',rect:[.35,.22,.25,.5],material:'paper'},
    {id:'navigation',role:'secondary',rect:[.08,.22,.2,.5],material:'paper'},
    {id:'details',role:'secondary',rect:[.67,.22,.25,.5],material:'paper'},
    {id:'heading',role:'secondary',rect:[.08,.1,.84,.08],material:'board'},
    {id:'status',role:'secondary',rect:[.08,.8,.84,.07],material:'paper'}
   ]:[{id:'main',role:'primary',rect:[.1,.12,.7,.6],material:'paper'}],companion:[.8,.82,.15,.15]}}});w.paint();
  };
  w.paint=()=>w.Reminder.renderRemindersOpen(w.scene.primary.element,w.items,w.value,w.owner,item=>w.opened.push(item.id),w.scene.regions);w.mount();
 });
 assert.equal(await page.title(),'Shared reminder surfaces');assert.equal(await page.locator('.reminders-region').count(),5);assert.equal(await page.locator('.reminders-task').count(),4);
 assert.equal(await page.evaluate(()=>(window as any).scene.metrics.compact),false,'distributed task column has room for its own content');
 await page.getByRole('button',{name:'Completed',exact:true}).click();assert.equal(await page.locator('.reminders-task').count(),1);assert.match(await page.locator('.reminders-detail-title').innerText(),/Water the plants/);
 await page.getByRole('button',{name:'All reminders',exact:true}).click();await page.getByLabel('Search reminders',{exact:true}).fill('book');assert.equal(await page.locator('.reminders-task').count(),2);
 await page.evaluate(()=>(window as any).paint());assert.equal(await page.getByLabel('Search reminders',{exact:true}).evaluate(e=>e===document.activeElement),true,'refresh restores search focus');assert.equal(await page.getByLabel('Search reminders',{exact:true}).inputValue(),'book');
 await page.getByLabel('Search reminders',{exact:true}).fill('');await page.getByRole('button',{name:'Pack a notebook',exact:true}).focus();await page.keyboard.press('Enter');assert.deepEqual(await page.evaluate(()=>(window as any).opened),[]);
 await page.evaluate(()=>(window as any).paint());assert.equal(await page.getByRole('button',{name:'Pack a notebook',exact:true}).evaluate(e=>e===document.activeElement),true,'refresh restores selected task focus');
 await page.getByRole('button',{name:'Open original reminder: Pack a notebook',exact:true}).click();assert.deepEqual(await page.evaluate(()=>(window as any).opened),['task-2']);
 await page.getByRole('button',{name:'Add with Fox',exact:true}).click();assert.equal(await page.evaluate(()=>(window as any).drafts),1);
 await page.getByLabel('Reminder list',{exact:true}).selectOption('Work');assert.equal(await page.locator('.reminders-task').count(),1);await page.getByLabel('Reminder list',{exact:true}).selectOption('');
 await page.evaluate(()=>(window as any).mount(false));assert.equal(await page.locator('.reminders-region').count(),0,'single sheet remains supported');assert.equal(await page.locator('.reminders-task').count(),4);
 await page.getByRole('button',{name:'Completed',exact:true}).click();assert.equal(await page.locator('.reminders-task').count(),1);assert.equal(await page.locator('.reminders-check').isDisabled(),true);await page.getByRole('button',{name:'Water the plants',exact:true}).click();assert.deepEqual(await page.evaluate(()=>(window as any).opened),['task-2','task-3']);
 await page.evaluate(()=>(window as any).scene.destroy());assert.equal(await page.locator('.applet-scene').count(),0);assert.deepEqual(errors,[]);
 console.log('PASS reminder regions: filters, readonly status, preview, original route, Fox callback, refresh focus and single sheet at 1500 × 844');
}finally{await browser.close();}
