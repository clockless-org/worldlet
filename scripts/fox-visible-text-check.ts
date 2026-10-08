import assert from 'node:assert/strict';
import {foxVisibleText,guidedVisibleText} from '../ui/companion/fox-visible-text.ts';
assert.equal(foxVisibleText('[response interrupted]'),'');
assert.equal(foxVisibleText('The note is saved.\n[response interrupted]'),'The note is saved.');
assert.equal(foxVisibleText('Hello.\n[response interrupted]\nNext sentence.'),'Hello.\n\nNext sentence.');
const marker='[response interrupted]';
for(let i=1;i<=marker.length;i++)assert.equal(foxVisibleText('Hello.\n'+marker.slice(0,i),true),'Hello.');
assert.equal(foxVisibleText('[Read note](https://example.com)',true),'[Read note](https://example.com)');
assert.equal(foxVisibleText('The phrase "[response interrupted]" is a diagnostic.'),'The phrase "[response interrupted]" is a diagnostic.');
console.log('PASS internal placeholder removal, split streaming markers and ordinary Markdown');

assert.equal(guidedVisibleText('Tool policy and permission deliberation'), '');
assert.equal(guidedVisibleText('Internal planning <worldlet-answer>I opened the report. Two findings need you.</worldlet-answer> More internal commentary'), 'I opened the report. Two findings need you.');
assert.equal(guidedVisibleText('<worldlet-answer>Incomplete'), '');
console.log('PASS guided answers expose only the completed public answer, never surrounding planning');

import {firstWinCandidate} from '../ui/onboarding/first-win.ts';
const result='<worldlet-answer>A renewal needs your decision.</worldlet-answer><worldlet-candidate>saved-123</worldlet-candidate>';
assert.equal(firstWinCandidate(result),'saved-123');
assert.equal(guidedVisibleText(result),'A renewal needs your decision.');
assert.equal(firstWinCandidate('<worldlet-candidate></worldlet-candidate>'),null);
assert.equal(firstWinCandidate('Review old task saved-123'),null);
console.log('PASS explicit candidate identity stays separate from visible dialogue');
