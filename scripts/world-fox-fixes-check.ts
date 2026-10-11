// Small lifecycle fixes in the World and Fox's Settings, checked without a browser:
// a second win burst replaces the first (ui/world/world-celebration.ts), and leaving Settings › General drops its
// app-update listener at once (ui/companion/companion-settings.ts).
import assert from 'node:assert/strict';

class Node{
 children:Node[]=[];parent:Node|null=null;dataset:Record<string,string>={};style:any={setProperty(){},removeProperty(){},getPropertyValue:()=>''};attributes:Record<string,string>={};
 className='';hidden=false;value='';type='';title='';disabled=false;onclick:any=null;offsetParent=null;clientWidth=800;clientHeight=600;
 text='';tagName:string;
 constructor(tagName='div'){this.tagName=tagName;}
 classList={add:(...names:string[])=>{this.className=[this.className,...names].filter(Boolean).join(' ');},remove:()=>{},toggle:()=>{},contains:(name:string)=>this.className.split(' ').includes(name)};
 get isConnected(){let n:Node=this;while(n.parent)n=n.parent;return n===body;}
 get textContent(){return this.text+this.children.map(c=>c.textContent).join('');}
 set textContent(value:string){this.children=[];this.text=String(value??'');}
 append(...nodes:any[]){for(const n of nodes){if(!(n instanceof Node)){const t=new Node('#text');t.text=String(n);this.append(t);continue;}n.remove();n.parent=this;this.children.push(n);}}
 prepend(...nodes:any[]){const rest=this.children;this.children=[];this.append(...nodes);for(const n of rest)this.children.push(n);}
 replaceChildren(...nodes:any[]){for(const c of this.children)c.parent=null;this.children=[];this.text='';this.append(...nodes);}
 remove(){if(this.parent){this.parent.children=this.parent.children.filter(c=>c!==this);this.parent=null;}}
 setAttribute(name:string,value:string){this.attributes[name]=String(value);}
 getAttribute(name:string){return this.attributes[name]??null;}
 removeAttribute(name:string){delete this.attributes[name];}
 all(test:(n:Node)=>boolean):Node[]{return this.children.flatMap(c=>[...test(c)?[c]:[],...c.all(test)]);}
 querySelectorAll(selector:string){return this.all(n=>selector==='button'?n.tagName==='button':selector.startsWith('.')?n.classList.contains(selector.slice(1)):false);}
 querySelector(selector:string){return this.querySelectorAll(selector)[0]??null;}
 scrollIntoView(){}
 addEventListener(){}
 removeEventListener(){}
 animate(){return {cancel(){}};}
 getContext(){return new Proxy({},{get:()=>()=>({})});}
}
const body=new Node('body');
const listeners=new Map<string,Set<any>>();
const g=globalThis as any;
g.document={createElement:(tag:string)=>new Node(tag),body,documentElement:new Node('html')};
g.window={
 addEventListener:(name:string,f:any)=>{if(!listeners.has(name))listeners.set(name,new Set());listeners.get(name)!.add(f);},
 removeEventListener:(name:string,f:any)=>{listeners.get(name)?.delete(f);},
 dispatchEvent:()=>true,location:{reload(){}},devicePixelRatio:1,
};
g.CustomEvent=class extends Event{detail:any;constructor(name:string,init:any={}){super(name);this.detail=init.detail;}};
g.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});
const settle=async(turns=20)=>{for(let i=0;i<turns;i++)await new Promise(resolve=>setTimeout(resolve,1));};

// Settings › General: its update listener goes as soon as another page is shown, not at the next update event.
{
 const {createCompanionSettings}=await import('../ui/companion/companion-settings.ts');
 const call=async(action:string)=>action==='appUpdate'?{installed:{version:'2026.1011.1',build:1},channel:'production',channels:[]}:{};
 const settings=createCompanionSettings({call,host:()=>undefined,pages:{fox:new Node() as any,phone:new Node() as any,knows:new Node() as any},records:{records:new Node() as any,showRecords(){}},
  onShow(){},close(){},openFeedback(){},replayTutorial(){}});
 body.append(settings.element);
 const updateListeners=()=>listeners.get('worldlet:app-update')?.size??0;
 const before=updateListeners();
 settings.open('general');await settle();
 assert.ok((settings.element as any).all(n=>n.dataset.action==='check-updates').length,'General shows Check for updates');
 assert.equal(updateListeners(),before+1,'General listens for app updates while it shows');
 settings.open('phone');await settle(5);
 assert.equal(updateListeners(),before,'leaving General removes its update listener without waiting for an event');
 settings.open('general');await settle();
 settings.refresh('general');await settle();
 assert.equal(updateListeners(),before+1,'showing General again keeps exactly one listener');
}

// A second win burst replaces the first: one layer on screen, and the first one's timers never fire later.
{
 g.requestAnimationFrame=()=>1;g.cancelAnimationFrame=()=>{};
 g.ResizeObserver=class{observe(){}unobserve(){}disconnect(){}};g.HTMLCanvasElement=class{};
 const {celebrateWin}=await import('../ui/world/world-celebration.ts');
 const root=new Node();body.append(root);
 const layers=()=>root.all(n=>n.classList.contains('world-win'));
 celebrateWin(root as any);
 const first=layers()[0];
 assert.ok(first,'a win shows its burst');
 await new Promise(resolve=>setTimeout(resolve,300));
 celebrateWin(root as any);
 assert.equal(layers().length,1,'the second win replaces the first layer');
 const second=layers()[0];
 assert.notEqual(second,first,'the layer on screen is the new one');
 await new Promise(resolve=>setTimeout(resolve,2400));
 assert.equal(layers()[0],second,'the first burst’s end timer was cancelled and does not cut the second one short');
 await new Promise(resolve=>setTimeout(resolve,400));
 assert.equal(layers().length,0,'the second burst ends on its own timer');
}
console.log('world-fox-fixes-check: ok');
