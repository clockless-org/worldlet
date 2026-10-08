import assert from 'node:assert/strict';
import {mountWriteNotice} from '../ui/companion/fox-write-notice.ts';
class Node {textContent='';disabled=false;onclick:any;type='';}
const listeners=new Map<string,Function>();
(globalThis as any).window={addEventListener:(name,fn)=>listeners.set(name,fn)};
(globalThis as any).document={createElement:()=>new Node()};
let guide:any,calls:any[]=[],fail=false;
mountWriteNotice(async(action,args)=>{calls.push({action,args});if(fail)throw Error('This change can no longer be undone.');return {ok:true};},()=>({setGuide:value=>guide=value}));
listeners.get('worldlet:write-notice')!({detail:{id:'d',text:'Worldlet blocked this write. Earlier in this turn a tool returned untrusted content.',denied:true}});
assert.match(guide.text,/Worldlet blocked this write/);assert.equal(guide.actions.length,0);
listeners.get('worldlet:write-notice')!({detail:{id:'u',text:'Archived 2 items.',undoable:true}});
assert.deepEqual(guide.actions.map(b=>b.textContent),['Undo']);
await guide.actions[0].onclick();
assert.deepEqual(calls,[{action:'worldWriteUndo',args:{id:'u'}}]);assert.equal(guide.text,'Undone.');
listeners.get('worldlet:write-notice')!({detail:{id:'v',text:'Marked the item done.',undoable:true}});
fail=true;const undo=guide.actions[0];await undo.onclick();
assert.match(guide.text,/no longer be undone/);assert.equal(undo.disabled,false);
console.log('PASS write notice shows denial without actions, undo calls the host and reports failures');
