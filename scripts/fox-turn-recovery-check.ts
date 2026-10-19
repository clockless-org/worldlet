// Fox's first reply must come back (owner request 2026-10-13): Core's rule for when a failed turn is tried once more by
// itself, and what Fox says when it still fails. No model, no browser.
import assert from 'node:assert/strict';
import {FOX_CHOOSE_AGENT_ACTION,FOX_RETRY_ACTION,FOX_RETRY_FAST_MS,foxTurnFailureText,foxTurnRetry} from '../agent/fox/index.ts';
import {diagnosticError} from '../agent/base/index.ts';
import {replyAction} from '../ui/companion/reply-actions.ts';

// The rule the UI passes, as analytics classifies it (ui/shell errorFields).
const kind=(message:string)=>{const rule=diagnosticError({message}).rule;return typeof rule==='string'&&rule!=='other'?rule:undefined;};

const quick={known:null,elapsedMs:300,streamed:false,toolsRan:false,attempt:0};
// A resident Agent that was not up yet, did not answer, stopped, or failed in a way nobody classified: tried once more.
for(const message of ['connect ECONNREFUSED 127.0.0.1:8642','Hermes Agent did not answer.','Hermes Agent exited with code 1','Model unavailable'])
 assert.equal(foxTurnRetry({...quick,kind:kind(message)}),true,message);
// Only once, only quick, and never after the person saw text or a World tool ran.
assert.equal(foxTurnRetry({...quick,kind:kind('socket hang up'),attempt:1}),false,'one retry per turn');
assert.equal(foxTurnRetry({...quick,kind:kind('socket hang up'),elapsedMs:FOX_RETRY_FAST_MS}),false,'a slow failure is not doubled');
assert.equal(foxTurnRetry({...quick,kind:kind('socket hang up'),streamed:true}),false,'text already shown');
assert.equal(foxTurnRetry({...quick,kind:kind('socket hang up'),toolsRan:true}),false,'a World tool already ran');
// What the person must fix is not retried.
for(const message of ['Hermes Agent is not signed in','Claude Code is not installed','spawn hermes ENOENT','permission denied',
 'Error code: 400 - invalid request','Error code: 400 - This model\'s maximum context length is 128000 tokens','HTTP 403 forbidden'])
 assert.equal(foxTurnRetry({...quick,kind:kind(message)}),false,message);
for(const known of ['authentication','quota','model','rate_limit','paused'])
 assert.equal(foxTurnRetry({...quick,known}),false,known);
assert.equal(foxTurnRetry({...quick,kind:kind('Failed to fetch'),known:'network'}),true,'a network blip passes');

// The failure says why and offers Try again and Choose another Agent, both real reply actions.
const refusedText='connect ECONNREFUSED 127.0.0.1:8642',refused=foxTurnFailureText(refusedText,kind(refusedText));
assert.match(refused,/^Your Agent is not running right now/);
assert.ok(!refused.includes('127.0.0.1'),'no raw transport text');
assert.ok(refused.includes(`(${FOX_RETRY_ACTION})`)&&refused.includes(`(${FOX_CHOOSE_AGENT_ACTION})`));
assert.ok(replyAction(FOX_RETRY_ACTION)&&replyAction(FOX_CHOOSE_AGENT_ACTION),'both render as action buttons');
// The host's own plain words are kept; a message that already offers the Agent choice does not offer it twice.
assert.match(foxTurnFailureText('Hermes Agent took too long to answer. Try again.'),/^Hermes Agent took too long to answer/);
const known=foxTurnFailureText('Your model connection needs attention.\n\n[Change model connection](#fox-action=open.model)');
assert.equal(known.split(FOX_CHOOSE_AGENT_ACTION).length-1,1);
assert.ok(known.includes(FOX_RETRY_ACTION));
assert.match(foxTurnFailureText(''),/^Fox could not answer this time\./);
console.log('PASS Fox turn recovery: quick failures before any text or tool are tried once more; lasting ones are not; the failure says why with Try again and Choose another Agent');
