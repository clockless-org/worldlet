import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {chromium} from 'playwright';
import {bundleScript} from './browser-test.ts';
// Nothing inside a card pages (owner Order 2026-10-07): an artifact that fits shows whole, and a longer one
// scrolls inside its own body with every word in it, never behind ‹ 1 / 2 ›.
const browser=await chromium.launch();
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 // A secure origin, as in the app, for crypto.randomUUID.
 await page.route('http://localhost/**',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><main id="notionWorld" style="position:relative;width:1440px;height:900px"></main>'}));await page.goto('http://localhost/');
 await page.addStyleTag({content:readFileSync('ui/attention/attention-preview.css','utf8')+'\n#notionWorld .fox-artifact{position:absolute;left:400px;width:470px;flex-direction:column;padding:20px}'});
 await page.addScriptTag({content:await bundleScript({entryPoints:['ui/companion/fox-artifact.ts'],globalName:'artifact'})});
 const result=await page.evaluate(()=>{
  const errors:string[]=[];window.addEventListener('error',e=>errors.push(e.message));
  const render=(markdown:string,p:{title:string;path:string})=>{const article=document.createElement('article');const lines=markdown.split('\n');if(lines[0]==='# '+p.title)lines.shift();if(!p.path.endsWith('.md'))throw Error('No page path');for(const line of lines.filter(Boolean)){const para=document.createElement('p');para.textContent=line.replace(/^# /,'');article.append(para);}return article;};
  const panel=(window as any).artifact.mountFoxArtifact(document.getElementById('notionWorld'),render,()=>{},()=>{});
  const body=()=>document.querySelector<HTMLElement>('.fox-artifact-body');
  const short=panel.show({title:'Plan',body:'# Plan\n\nStep one'});
  window.dispatchEvent(new Event('resize'));
  const shortView={ok:short.ok,text:body().textContent,scrolls:short.scrolls,overflow:body().scrollHeight>body().clientHeight};
  const lines=Array.from({length:60},(_,i)=>'Line '+i+' of a long Discord summary with a few useful words.');
  const long=panel.show({title:'Summary',body:lines.join('\n')});
  const b=body();
  return {short:shortView,long:{scrolls:long.scrolls,overflowY:getComputedStyle(b).overflowY,whole:lines.every(l=>b.textContent.includes(l)),more:b.dataset.more,navs:document.querySelectorAll('.fox-artifact nav').length,pages:'pages' in long},errors};
 });
 assert.deepEqual(result.short,{ok:true,text:'Step one',scrolls:false,overflow:false},'a short artifact opening with its title renders once and whole, also after a resize');
 assert.deepEqual(result.long,{scrolls:true,overflowY:'auto',whole:true,more:'true',navs:0,pages:false},'a long artifact keeps all its text in one body that scrolls, with no page arrows');
 assert.deepEqual(result.errors,[]);
 console.log('PASS artifacts never page: short ones show whole, long ones scroll inside the card');
}finally{await browser.close();}
