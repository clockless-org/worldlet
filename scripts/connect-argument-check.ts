// One-click install (`--connect=<id>`): an install script launches Worldlet naming the person's Agent.
// The host only reads argv (`connectArgument`); first-run setup decides with `connectRequestPlan`
// (core/agent/PORTABILITY.md#local-harnesses-chosen-at-setup). No app, browser or Agent is started.
import assert from 'node:assert/strict';
import {CONNECT_ARGUMENT,LOCAL_HARNESSES,connectArgument,connectRequestPlan} from '../core/agent/index.ts';

// Reading argv ------------------------------------------------------------------------------------
assert.equal(CONNECT_ARGUMENT,'--connect');
for(const {id} of LOCAL_HARNESSES){
 assert.equal(connectArgument(['/Applications/Worldlet.app/Contents/MacOS/Worldlet','--connect='+id]),id,'--connect=<id> for '+id);
 assert.equal(connectArgument(['Worldlet.exe','--connect',id]),id,'--connect <id> for '+id);
}
assert.equal(connectArgument(['Worldlet.exe','--connect=OpenClaw ']),'openclaw','case and spaces do not matter');
assert.equal(connectArgument(['Worldlet.exe']),null,'no argument');
assert.equal(connectArgument(['Worldlet.exe','--connect=']),null,'empty value');
assert.equal(connectArgument(['Worldlet.exe','--connect']),null,'no value after the flag');
assert.equal(connectArgument(['Worldlet.exe','--connect=gpt-agent']),null,'unknown IDs are ignored');
assert.equal(connectArgument(['Worldlet.exe','--connect','--quit']),null,'the next flag is not a value');
assert.equal(connectArgument(['Worldlet.exe','--connected=hermes','--connect-to=hermes','connect=hermes']),null,'only the exact flag');
assert.equal(connectArgument(['Worldlet.exe','--connect=hermes','--connect=nope']),'hermes','an unknown later one does not erase a valid one');
assert.equal(connectArgument(['Worldlet.exe','--connect=hermes','--connect','pi']),'pi','the last valid one wins');
// A second launch on Windows: Electron's second-instance argv carries Chromium switches around it.
assert.equal(connectArgument(['C:\\Worldlet\\Worldlet.exe','--allow-file-access-from-files','--connect=hermes','--original-process-start-time=1']),'hermes');

// What setup does with it ---------------------------------------------------------------------------
const found=[{id:'openclaw'},{id:'codex'}];
assert.deepEqual(connectRequestPlan('openclaw',{firstPage:true,found}),{pick:'openclaw',select:true,missing:false},'found on the first page: picked and connected as Continue would');
assert.deepEqual(connectRequestPlan('openclaw',{firstPage:true,found,busy:true}),{pick:'openclaw',select:false,missing:false},'something else running: only picked');
assert.deepEqual(connectRequestPlan('hermes',{firstPage:true,found}),{pick:'hermes',select:false,missing:true},'not on this computer: picked and said so, the normal setup stays');
assert.deepEqual(connectRequestPlan('hermes',{firstPage:true,found:[]}),{pick:'hermes',select:false,missing:true},'no Agents found at all');
for(const requested of [null,undefined,'','gpt-agent',42])assert.deepEqual(connectRequestPlan(requested,{firstPage:true,found}),{pick:null,select:false,missing:false},'nothing requested: '+String(requested));
assert.deepEqual(connectRequestPlan('openclaw',{firstPage:false,found}),{pick:null,select:false,missing:false},'past the first page (an Agent already chosen, Google, a pairing): nothing changes');

console.log('PASS connect argument');
