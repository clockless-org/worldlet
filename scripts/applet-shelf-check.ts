// The Applet shelf's order (core/applets/shelf.ts) without a page: the open Applet in the middle, one stable ring
// around it, and the ones used longest ago behind "+N".
import assert from 'node:assert/strict';
import {seedShelf,enterShelf,shelfRing} from '../core/applets/index.ts';

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

console.log('PASS the Applet shelf keeps one ring with the open Applet in the middle, +N for the rest.');
