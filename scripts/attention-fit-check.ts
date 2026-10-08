import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {readFile} from 'node:fs/promises';
import {bundleScript} from './browser-test.ts';

const source=await bundleScript({entryPoints:['ui/hud/fit-attention-panel.ts'],globalName:'attentionFit'});
const css=(await Promise.all(['ui/components/components.css','ui/components/layout.css','ui/shell/pixi-world.css'].map(p=>readFile(p,'utf8')))).join('\n');
const browser=await chromium.launch();
try{
 const page=await browser.newPage();
 await page.setContent('<style>'+css+'\n*{animation:none!important;transition:none!important}.world-task-list{width:280px!important;flex:none!important}.world-matter{flex-shrink:0}</style><main id="notionWorld" class="native-console"></main>');
 await page.addScriptTag({content:source});
 const result=await page.evaluate(()=>{
  let cases=0,oldReads=0,newReads=0;
  for(const height of [50,160,360,650])for(const count of [0,1,8,40])for(const empty of [false,true]){
   const make=()=>{
    const list=document.createElement('div');list.className='world-task-list';list.style.height=height+'px';
    for(const [g,state] of ['event','task','unseen'].entries()){
     const section=document.createElement('section');section.className='world-task-group';section.dataset.group=state;const h=document.createElement('h2');h.className='world-task-heading';h.textContent=state;section.append(h);
     for(let i=0;i<(empty&&g===1?0:count+g);i++){const b=document.createElement('button');b.className='world-matter';b.dataset.id=g+':'+i;b.style.height=(28+i%3*12)+'px';b.textContent='Fixture '+i;section.append(b);}
     list.append(section);
    }document.querySelector('main').append(list);return list;
   };
   const old=make(),next=make();
   const getter=Object.getOwnPropertyDescriptor(Element.prototype,'scrollHeight').get;
   Object.defineProperty(old,'scrollHeight',{get(){oldReads++;return getter.call(old);}});
   Object.defineProperty(next,'scrollHeight',{get(){newReads++;return getter.call(next);}});
   for(let guard=0;guard<120&&old.scrollHeight>old.clientHeight+1;guard++){
    const groups=Array.from(old.querySelectorAll<HTMLElement>('.world-task-group')).map(g=>({g,rows:Array.from(g.querySelectorAll('.world-matter'))})).filter(v=>v.rows.length);if(!groups.length)break;
    const removable=groups.filter(({g,rows})=>rows.length>(g.dataset.group==='event'?3:1));
    const longest=(removable.length?removable:groups).reduce((a,b)=>b.rows.length>=a.rows.length?b:a);longest.rows.at(-1).remove();if(!longest.g.querySelector('.world-matter'))longest.g.remove();
   }
   (window as any).attentionFit.fitAttentionPanel(next);
   if(old.innerHTML!==next.innerHTML)throw Error('Trim mismatch '+JSON.stringify({height,count,empty}));
   old.remove();next.remove();cases++;
  }return {cases,oldReads,newReads};
 });
 assert.ok(result.newReads<result.oldReads/3);console.log('PASS exact Attention trim parity',result);
}finally{await browser.close();}
