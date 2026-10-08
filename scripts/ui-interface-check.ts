import assert from 'node:assert/strict';
import {createWorldUI} from '../ui/shell/public-interface.ts';
import type {UISnapshot} from '../contracts/ui.ts';
let state:UISnapshot={version:1,context:{id:'overview',title:'World',depth:'world'},targets:[{id:'app-mail',label:'Mail',kind:'applet'}]};
const calls:unknown[]=[];
const ui=createWorldUI(()=>state,value=>{calls.push(value);return {ok:true}});
await ui.dispatch({version:1,action:'activate',id:'app-mail'});
assert.deepEqual(calls,[{version:1,action:'activate',id:'app-mail'}]);
ui.snapshot().targets.length=0;assert.equal(ui.snapshot().targets.length,1);
state={...state,targets:[]};
await assert.rejects(ui.dispatch({version:1,action:'activate',id:'app-mail'}),/unavailable/);
await assert.rejects(ui.dispatch({version:2,action:'overview'} as any),/version/);
await assert.rejects(ui.dispatch({version:1,action:'overview',script:'anything'} as any),/field/);
await assert.rejects(ui.dispatch({version:1,action:'evaluate'} as any),/unavailable/);
await ui.dispatch({version:1,action:'back'});await ui.dispatch({version:1,action:'overview'});
assert.equal(calls.length,3);
console.log('PASS versioned UI actions, stale target rejection, closed command schema, snapshot isolation, shared dispatch.');

// Public UI imports must not mount controls, register global handlers or require
// a live document. Startup belongs to explicit mount functions and entry files.
assert.equal(typeof globalThis.document,'undefined');
for(const component of ['components','attention','world','shell','browser','onboarding','companion','distribution','applets','practice','hud']){
 const api=await import(`../ui/${component}/index.ts`);
 assert(Object.keys(api).length>0,`${component} has no public API`);
}
console.log('PASS all UI component APIs load without a document or implicit startup');
