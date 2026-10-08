import assert from 'node:assert/strict';
import {foxStepsStart,foxStepsAdd,foxStepsFinish,foxStepsView,foxResultText,FOX_STEPS_SHOWN} from '../core/browser/index.ts';
// Fox's steps on a page, the page's one status card (#1619): each step is ticked once Fox moves on,
// Thinking heads the card without becoming a step, a repeated step is one step, and the turn's end
// ticks everything and keeps the reply's first lines as the result.
let state=foxStepsStart();
state=foxStepsAdd(state,'Opening claude.ai…');
state=foxStepsAdd(state,'Thinking…');
assert.deepEqual(state.steps,[{text:'Opening claude.ai',done:true}]);
assert.equal(state.now,'Thinking');
state=foxStepsAdd(state,'Filling in the form…');
state=foxStepsAdd(state,'Filling in the form…');
assert.deepEqual(state.steps.map(s=>[s.text,s.done]),[['Opening claude.ai',true],['Filling in the form',false]],'the same words again are the same step');
assert.equal(foxStepsAdd(state,'   '),state,'empty text is no step');
const stopped=foxStepsFinish(state,{ok:false,result:'This reply was interrupted.'});
assert.deepEqual(stopped.steps.at(-1),{text:'Filling in the form',done:false},'a stopped turn leaves its step unticked');
const done=foxStepsFinish(state,{ok:true,result:'## Done\n**Signed in.** Your [account](https://claude.ai) is ready.'});
assert.ok(done.finished&&done.steps.every(s=>s.done));
assert.equal(done.result,'Done Signed in. Your account is ready.');
// Only the latest steps are listed, with a count of earlier ones.
let many=foxStepsStart();for(let i=1;i<=8;i++)many=foxStepsAdd(many,'Step '+i);
const view=foxStepsView(many);
assert.equal(view.steps.length,FOX_STEPS_SHOWN);assert.equal(view.earlier,8-FOX_STEPS_SHOWN);assert.equal(view.steps[0].text,'Step '+(8-FOX_STEPS_SHOWN+1));
// A long reply keeps its first sentences, within the card's three lines.
const long=foxResultText('I filled in your name and email. '.repeat(10));
assert.ok(long.length<=180&&long.endsWith('.'),long);
console.log('PASS Fox steps: ticked as Fox moves on, Thinking is not a step, repeats merge, a stopped step stays open, and the result is plain and short.');
