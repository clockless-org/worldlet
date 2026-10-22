import assert from 'node:assert/strict';
import {MINE_FIELDS,newMineState,actOnMine,mineNeighbours,elapsedMineSeconds,type MineState} from '../context/store/index.ts';
for(const field of Object.values(MINE_FIELDS))for(let i=0;i<field.rows*field.columns;i++){
 const initial=newMineState(field),next=actOnMine(initial,i,'dig',1000,()=>0);
 assert.equal(initial.opened.size,0,'decisions leave previous snapshots unchanged');assert.equal(next.mines.size,field.mines);
 assert.equal(next.status,'playing');assert.ok(next.opened.has(i));assert.ok([i,...mineNeighbours(next,i)].every(n=>!next.mines.has(n)),'the first reveal and all its neighbours are safe');
}
let state=newMineState(MINE_FIELDS.compact);state=actOnMine(state,29,'flag',0);assert.equal(elapsedMineSeconds(state,9000),0);assert.equal(actOnMine(state,29,'dig',100),state);
state=actOnMine(state,0,'dig',1000,()=>0);assert.equal(elapsedMineSeconds(state,3500),2);assert.equal(elapsedMineSeconds(state,0),0);
for(const mine of state.mines)if(state.flags.has(mine))state=actOnMine(state,mine,'flag',3500);
const lost=actOnMine(state,[...state.mines][0],'dig',4500);assert.equal(lost.status,'lost');assert.equal(elapsedMineSeconds(lost,99999),3);assert.equal(actOnMine(lost,1,'dig',5000),lost);
let won=actOnMine(newMineState(MINE_FIELDS.compact),0,'dig',1000,()=>0);
for(let i=0;i<30;i++)if(!won.mines.has(i))won=actOnMine(won,i,'dig',6500);
assert.equal(won.status,'won');assert.equal(won.opened.size,20);assert.equal(elapsedMineSeconds(won,99999),5);assert.equal(actOnMine(won,1,'flag',10000),won);
// A wrong chord ends at its first mine; it must not uncover the remaining safe neighbours afterwards.
const chord:MineState={...newMineState({columns:4,rows:4,mines:1}),mines:new Set([0]),flags:new Set([1]),opened:new Set([5]),status:'playing',startedAt:0};
const boom=actOnMine(chord,5,'dig',2000);assert.equal(boom.status,'lost');assert.equal(boom.opened.size,1);assert.equal(boom.boom,0);
const safe=actOnMine({...chord,flags:new Set([0])},5,'dig',2000);assert.equal(safe.status,'won');assert.equal(safe.opened.size,15);
assert.equal(actOnMine(chord,-1,'dig',100),chord);assert.equal(actOnMine(chord,1,'dig',NaN),chord);
for(const field of [{columns:2,rows:2,mines:1},{columns:6,rows:5,mines:22},{columns:5.5,rows:5,mines:1}])assert.throws(()=>newMineState(field));
console.log('PASS Minesweeper: every first cell safe, bounded constant randomness, immutable flags, chord/win/loss, frozen elapsed time and invalid input');
