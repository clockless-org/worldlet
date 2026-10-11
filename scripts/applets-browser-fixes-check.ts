// Applets and Browser fixes, checked without a browser on a tiny stand-in DOM:
// Codex drops a thread's cached items once its turn ends, and the Voice Memos reader
// redraws when another recording took over playback.
import assert from 'node:assert/strict';
class FakeElement{
 tagName:string;value='';children:any[]=[];attributes=new Map<string,string>();dataset:any={};style:any={};textContent='';className='';hidden=false;isConnected=true;parentElement:any=null;
 classList={add:(..._c:string[])=>{},remove:(..._c:string[])=>{},toggle:(..._c:any[])=>{},contains:()=>false};
 constructor(tag:string){this.tagName=tag.toUpperCase();}
 setAttribute(k:string,v:string){this.attributes.set(k,String(v));}
 getAttribute(k:string){return this.attributes.get(k)??null;}
 removeAttribute(k:string){this.attributes.delete(k);}
 append(...nodes:any[]){for(const n of nodes){if(n&&typeof n==='object')n.parentElement=this;this.children.push(n);}}
 prepend(...nodes:any[]){this.children.unshift(...nodes);}
 replaceChildren(...nodes:any[]){this.children=[];this.append(...nodes);}
 remove(){}
 contains(){return false;}
 querySelector(){return null;}
 get text():string{return this.textContent+this.children.map(c=>c?.text??'').join('');}
}
const g=globalThis as any;
g.document={createElement:(tag:string)=>new FakeElement(tag),hidden:false,activeElement:null};
g.window=g;g.addEventListener=()=>{};
g.localStorage={getItem:()=>null,setItem:()=>{}};
const intervals:Function[]=[];g.setInterval=(fn:Function)=>{intervals.push(fn);return intervals.length;};g.clearInterval=()=>{};
const tick=()=>new Promise(r=>setTimeout(r,0));

// Codex: a pending approval still previews its item's command; after the turn ends the
// thread's cached items are gone, so the map no longer grows for the life of the Applet.
{
 const {createCodexApplet}=await import('../ui/applets/codex/codex-applet.ts');
 const shown:any[]=[];
 const codex=createCodexApplet({call:async()=>({}),renderMarkdown:(t:string)=>Object.assign(new FakeElement('div'),{textContent:t}),onSelect:()=>{},onState:()=>{},onRequest:(b:any)=>shown.push(b),onRequestDone:()=>{},isVisible:()=>true});
 await codex.inspect({sessionId:'t1',title:'One',cwd:''},Object.assign(new FakeElement('div'),{isConnected:false}));
 const ask=(requestId:string)=>codex.events({method:'worldlet/request',params:{threadId:'t1',requestId,kind:'item/commandExecution/requestApproval',details:{itemId:'i1'}}});
 codex.events({method:'item/started',params:{threadId:'t1',item:{id:'i1',type:'commandExecution',command:'npm test'}}});
 ask('r1');
 assert.ok(shown.at(-1).text.includes('npm test'),'an approval previews the cached command');
 codex.events({method:'turn/completed',params:{threadId:'t1',turn:{status:'completed'}}});
 ask('r2');
 assert.ok(!shown.at(-1).text.includes('npm test'),'the thread\'s cached items are dropped once its turn ends');
 codex.events({method:'item/started',params:{threadId:'t1',item:{id:'i1',type:'commandExecution',command:'npm run build'}}});
 codex.events({method:'worldlet/disconnected',params:{}});
 ask('r3');
 assert.ok(!shown.at(-1).text.includes('npm run build'),'a disconnect drops every cached item');
}

// Voice Memos: when the player reports a different recording, this reader shows Paused and
// tells the HUD to rebuild its Play/Pause button instead of keeping a stale Pause.
{
 const {createVoiceMemoReader}=await import('../ui/applets/voice-memos/voice-memos.ts');
 let current='memo-a',playing=false,changes=0;
 const call=async(b:any)=>{if(b.operation==='select')return {duration:60,transcript:'Hello'};if(b.operation==='play'){playing=true;return {playing,position:1};}if(b.operation==='status')return {id:current,playing,position:2,duration:60};return {};};
 const reader=createVoiceMemoReader({call,record:{id:'memo-a',title:'A'},sample:false,onChange:()=>changes++});
 await tick();
 const poll=intervals.at(-1)!;
 await reader.context().actions[0].run();
 assert.equal(reader.context().actions[0].label,'Pause');
 current='memo-b';const before=changes;await poll();
 assert.equal(reader.context().actions[0].label,'Play','another recording playing turns this one back to Play');
 assert.ok(changes>before,'the HUD is told to rebuild its buttons');
 assert.match(reader.element.children[0].textContent,/Paused/,'the caption says Paused');
 reader.dispose();
}
console.log('applets and browser fixes: ok');
