import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {workingStowStudy,WORKING_STOW_DURATION} from '../ui/companion/animation/fox-working-stow-study.ts';

// Prints generated data for review/patching; --check only reads the saved pack.
const channels=['upperArmL','forearmL','pawL','upperArmR','forearmR','pawR'],stepMs=20;
const samples=Array.from({length:WORKING_STOW_DURATION/stepMs+1},(_,i)=>{
 const pose=workingStowStudy(i*stepMs).pose;
 return channels.map(id=>Number((pose[id].angle??0).toFixed(9))||0);
});
const data={version:1,status:'stow-study-not-live',generator:'scripts/fox-working-stow-bake.ts',durationMs:WORKING_STOW_DURATION,stepMs,channels,samples};
if(process.argv.includes('--check')){
 const saved=JSON.parse(await readFile('resources/styles/builtin/drafts/fox-states-v1/working-stow-path.json','utf8'));
 assert.deepEqual(saved,data,'Stow path is stale; regenerate from its reference study');
 console.log('PASS deterministic stow path bake:',samples.length,'knots,',channels.length,'rotation channels.');
}else console.log(JSON.stringify(data));
