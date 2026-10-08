import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {bundleScript} from './browser-test.ts';
// Render real Center rows (taskRow plus the HUD's marker swap), not a hand-copied markup.
const bundle=await bundleScript({stdin:{contents:"export {taskRow} from './ui/components/primitives/components.ts';export {attentionIcon} from './ui/attention/icon.ts';",resolveDir:process.cwd(),loader:'ts'},globalName:'rows'});
const browser=await chromium.launch();
try{
 const page=await browser.newPage({viewport:{width:900,height:700}});
 await page.setContent('<style>'+await readFile('ui/shell/homestead.css','utf8')+':root{--ui-text-body:14px;--ui-text-caption:11px;--ui-font-ui:Arial}'+await readFile('ui/components/components.css','utf8')+'</style><div class="native-console radial-pet-console companion-console" style="width:310px"><div class="world-task-tracker"><div class="world-task-list"></div></div></div>');
 await page.addScriptTag({content:bundle});
 await page.evaluate(()=>{
  const {taskRow,attentionIcon}=(window as any).rows,list=document.querySelector('.world-task-list');
  for(const [state,time] of [['event','in 2h'],['event','Tomorrow'],['needsAction','Tuesday'],['needsAction','Next Wednesday'],['unseen','']]){
   const row=taskRow({title:'Confirm school pickup',objective:'Ms. Alvarez needs an answer by Thursday.',label:'Row',state,when:time?{factor:time,label:time}:null,run(){}});
   row.classList.add('world-matter');
   const mark=row.querySelector('.world-task-marker');mark.innerHTML=attentionIcon(state);mark.className='matter-icon';
   list.append(row);
  }
 });
 assert.ok(await page.locator('.matter-icon').evaluateAll(els=>els.every(el=>Math.round(el.getBoundingClientRect().width)===24)),'Marker columns stay compact and equal');
 const positions=await page.locator('.world-task-copy').evaluateAll(els=>els.map(el=>el.getBoundingClientRect().x));
 assert.ok(positions.every(x=>Math.abs(x-positions[0])<1),'Timed and untimed titles share the same left edge');
 // The time leads the key-facts line under the title (#1281), so titles keep their full width.
 assert.ok(await page.locator('.world-task-copy').evaluateAll(els=>els.every(copy=>{const title=copy.querySelector('.world-task-title'),time=copy.querySelector('.world-task-time');return !time||time.getBoundingClientRect().top>=title.getBoundingClientRect().bottom-1&&time.parentElement.firstElementChild===time;})),'A time leads the line under its title');
 assert.equal(await page.locator('.world-task-head .world-task-time,.world-task-soon').count(),0,'Nothing sits beside a title');
 console.log('PASS: relative dates and untimed items share a stable text column');
}finally{await browser.close();}
