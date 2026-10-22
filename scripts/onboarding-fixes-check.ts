import assert from 'node:assert/strict';
// The desktop Companion hint waits 300ms before speaking; destroying it during that wait must cancel the line.
const store=new Map<string,string>(),target=new EventTarget(),guides:unknown[]=[];
Object.assign(globalThis,{
 window:Object.assign(target,{setTimeout,clearTimeout}),
 localStorage:{getItem:(k:string)=>store.get(k)??null,setItem:(k:string,v:string)=>store.set(k,v)},
 document:{documentElement:{lang:'en',classList:{contains:(c:string)=>c==='desktop-companion'}}},
});
const {mountDesktopCompanionHint}=await import('../ui/frame/desktop-companion-hint.ts');
const view={guideSource:null as string|null,busy:false,setGuide(g:any){guides.push(g);view.guideSource=g?.source??null;}};
const state={onboarding:{completed:true}},root={dataset:{}};
const wait=(ms:number)=>new Promise(r=>setTimeout(r,ms));
const fire=()=>target.dispatchEvent(new CustomEvent('worldlet:desktop-companion',{detail:true}));

let hint=mountDesktopCompanionHint({root,view,state});
fire();hint.destroy();await wait(400);
assert.equal(guides.length,0,'a destroyed hint does not speak');
assert.equal(store.get('worldlet.companion.desktop-hint'),undefined,'a destroyed hint does not use up its one showing');

hint=mountDesktopCompanionHint({root,view,state});
fire();await wait(400);
assert.equal(guides.length,1);assert.equal((guides[0] as any).source,'desktop-companion-hint');
hint.destroy();assert.equal(guides.at(-1),null,'destroy clears the shown hint');
console.log('PASS desktop Companion hint: destroy cancels the pending showing');
