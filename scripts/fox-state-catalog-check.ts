import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {FOX_STATES,foxState} from '../ui/companion/animation/fox-state-catalog.ts';
assert.equal(FOX_STATES.length,32);assert.equal(new Set(FOX_STATES.map(s=>s.id)).size,32);
const plan=await readFile('ui/companion/ANIMATION.md','utf8');
// ANIMATION.md lists the approved scope; the catalog may also hold experimental states.
const planned=[...plan.matchAll(/^\| [A-Z][a-z ]+ \| ([a-z_, ]+) \|$/gm)].flatMap(m=>m[1].split(', '));
assert.equal(planned.length,32);for(const id of planned)assert(foxState(id),'Catalog drift: '+id);
for(const spec of FOX_STATES){assert(spec.seconds>0);assert(spec.performance&&spec.trigger);}
assert.equal(foxState('waving')?.id,'greeting');assert.equal(foxState('unknown'),undefined);
console.log('PASS: 32 unique catalog states matching ANIMATION.md, each timed with a performance and trigger, and aliases.');
