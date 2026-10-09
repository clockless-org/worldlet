import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {chromium} from 'playwright';
import {bundleScript} from './browser-test.ts';
// An artifact never pages (owner Order 2026-10-07) and never scrolls (owner Order 2026-10-09): the card shows the
// fullest version that fits its room, the detail, the body with its blocks, fewer blocks, then the one-sentence brief,
// and Show all gives it more room. Changing size picks again without asking Fox.
const browser=await chromium.launch();
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 // A secure origin, as in the app, for crypto.randomUUID.
 await page.route('http://localhost/**',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><main id="notionWorld" style="position:relative;width:1440px;height:900px"></main>'}));await page.goto('http://localhost/');
 await page.addStyleTag({content:readFileSync('ui/attention/attention-preview.css','utf8')+'\n#notionWorld .fox-artifact{position:absolute;left:400px;width:470px;flex-direction:column;padding:20px}#notionWorld .fox-artifact[data-size=small]{max-height:340px}#notionWorld .fox-artifact[data-size=large]{max-height:820px}'});
 await page.addScriptTag({content:await bundleScript({entryPoints:['ui/companion/fox-artifact.ts'],globalName:'artifact'})});
 const result=await page.evaluate(async()=>{
  const errors:string[]=[];window.addEventListener('error',e=>errors.push(e.message));
  const frame=()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
  const render=(markdown:string,p:{title:string;path:string})=>{const article=document.createElement('article');const lines=markdown.split('\n');if(lines[0]==='# '+p.title)lines.shift();if(!p.path.endsWith('.md'))throw Error('No page path');for(const line of lines.filter(Boolean)){const para=document.createElement('p');para.textContent=line.replace(/^# /,'');article.append(para);}return article;};
  const sizes:string[]=[],kept:any[]=[];
  const panel=(window as any).artifact.mountFoxArtifact(document.getElementById('notionWorld'),render,()=>{},()=>{},size=>sizes.push(size),()=>{},blocks=>kept.push(blocks));
  const card=()=>document.getElementById('foxArtifact')!,body=()=>document.querySelector<HTMLElement>('.fox-artifact-body')!,more=()=>document.querySelector<HTMLElement>('.fox-artifact-more')!;
  const view=(r:any)=>({shows:r.shows,leftOut:r.leftOut,fits:body().scrollHeight<=body().clientHeight+1,overflow:getComputedStyle(body()).overflowY,more:!more().hidden});
  const lines=(n:number,what:string)=>Array.from({length:n},(_,i)=>'Line '+i+' of '+what+' with a few useful words.').join('\n');

  const short=panel.show({title:'Plan',body:'# Plan\n\nStep one',size:'medium'});
  window.dispatchEvent(new Event('resize'));await frame();
  const shortView={...view(short),text:body().textContent};

  // Too long for its card: the brief, never a scrollbar.
  const long=view(panel.show({title:'Summary',body:lines(60,'a long Discord summary'),brief:'Three channels, one decision: ship on Friday.',size:'medium'}));
  const longText=body().textContent;

  // The detail when there is room, the body when not; Show all makes the card large, and back it gets the detail.
  const detailMedium=view(panel.show({title:'Labs',body:'TAC is the cheapest that fits.',detail:lines(22,'the labs compared'),brief:'TAC.',size:'medium'}));
  more().querySelector('button')!.click();await frame();
  const detailLarge={...view({shows:card().dataset.fit,leftOut:false}),size:card().dataset.size,sizes:[...sizes]};

  // Blocks come most important first: a small card leaves out the last ones, and what the person ticks keeps them.
  const checklist=(label:string)=>({type:'checklist',label,items:['One','Two','Three']});
  const blocks=panel.show({title:'Trip',body:'Pack light.',blocks:[checklist('Pack'),checklist('Book'),checklist('Call')],size:'small'});
  const blocksView={...view(blocks),drawn:document.querySelectorAll('.fox-artifact-body .artifact-block').length};
  document.querySelector<HTMLElement>('.fox-artifact-body .artifact-checklist input')?.click();await frame();

  // A window that gets shorter fits the card again, without Fox.
  const roomy=view(panel.show({title:'Week',body:lines(9,'the week'),brief:'A calm week.',size:'large'}));
  card().style.maxHeight='160px';window.dispatchEvent(new Event('resize'));await frame();
  const cramped={shows:card().dataset.fit,fits:body().scrollHeight<=body().clientHeight+1};
  await frame();
  return {short:shortView,long,longText,detailMedium,detailLarge,blocks:blocksView,kept:kept.map(b=>b.length),roomy,cramped,errors};
 });
 assert.deepEqual(result.short,{shows:'body',leftOut:false,fits:true,overflow:'hidden',more:false,text:'Step one'},'a short artifact shows whole, with nothing to show more of, also after a resize');
 assert.deepEqual(result.long,{shows:'brief',leftOut:true,fits:true,overflow:'hidden',more:true},'a body too long for its card shows the brief and Show all, never a scrollbar');
 assert.equal(result.longText,'Three channels, one decision: ship on Friday.');
 assert.deepEqual(result.detailMedium,{shows:'body',leftOut:true,fits:true,overflow:'hidden',more:true},'the detail waits for room; the body shows');
 assert.deepEqual(result.detailLarge,{shows:'detail',leftOut:false,fits:true,overflow:'hidden',more:false,size:'large',sizes:['large']},'Show all makes the card large, kept as its size, and the detail shows');
 assert.equal(result.blocks.shows,'body');assert.ok(result.blocks.leftOut&&result.blocks.fits&&result.blocks.drawn>=1&&result.blocks.drawn<3,'a small card leaves out its last blocks '+JSON.stringify(result.blocks));
 assert.ok(result.kept.length&&result.kept.every(n=>n===3),'ticking a shown block keeps the ones left out '+JSON.stringify(result.kept));
 assert.equal(result.roomy.shows,'body');
 assert.deepEqual(result.cramped,{shows:'brief',fits:true},'a card whose room shrinks fits again');
 assert.deepEqual(result.errors,[]);
 console.log('PASS artifacts never scroll: the fullest version that fits its card, fewer blocks, then the brief; Show all, and fitting again when the room changes');
}finally{await browser.close();}
