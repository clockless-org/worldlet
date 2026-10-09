// The Applet shelf's order (core/applets/shelf.ts) without a page: the open Applet in the middle, one stable ring
// around it, the ones used longest ago behind "+N", and closing handing over to a neighbour.
import assert from 'node:assert/strict';
import {seedShelf,enterShelf,closeOnShelf,shelfRing} from '../core/applets/index.ts';

const used:Record<string,number>={a:6,b:5,c:4,d:3,e:2,f:1,g:0};
const lastUsed=(id:string)=>used[id]??0;
const offsets=(ring:ReturnType<typeof shelfRing>)=>Object.fromEntries(ring.visible.map(v=>[v.id,v.offset]));

let state=seedShelf(['a','b','c']);
assert.deepEqual(state.order,['c','b','a'],'seeded oldest first');
state=enterShelf(state,'d');
assert.deepEqual(state.order,['c','b','a','d'],'a new Applet joins at the end');
assert.equal(enterShelf(state,'b'),state,'an Applet already on the shelf keeps its place');

assert.deepEqual(offsets(shelfRing(state,'d',lastUsed)),{d:0,c:1,b:-2,a:-1},'the open Applet stands in the middle, the extra one of an even ring on the left');
assert.deepEqual(offsets(shelfRing(state,'b',lastUsed)),{b:0,a:1,d:-2,c:-1},'switching slides the same ring');
const five=enterShelf(state,'e');
assert.deepEqual(offsets(shelfRing(five,'a',lastUsed)),{a:0,d:1,e:2,c:-2,b:-1},'an odd ring is balanced');

let full=state;for(const id of ['e','f','g'])full=enterShelf(full,id);
const ring=shelfRing(full,'g',lastUsed,4);
assert.deepEqual(ring.visible.map(v=>v.id).sort(),['a','b','c','g'],'the open Applet and the most recently used stay');
assert.deepEqual(ring.overflow,['d','e','f'],'the rest wait behind +N, most recent first');

let closed=closeOnShelf(state,'b','b');
assert.deepEqual([closed.state.order,closed.next],[['c','a','d'],'a'],'closing the open Applet opens the one after it');
closed=closeOnShelf(state,'d','d');
assert.equal(closed.next,'a','closing the last in the order opens the one before it');
closed=closeOnShelf(state,'c','d');
assert.deepEqual([closed.state.order,closed.next],[['b','a','d'],'d'],'closing another Applet keeps the open one');
closed=closeOnShelf({order:['x']},'x','x');
assert.deepEqual([closed.state.order,closed.next],[[],null],'closing the only Applet leaves for the World');
console.log('PASS the Applet shelf keeps one ring with the open Applet in the middle, +N for the rest, and closing opens a neighbour.');
