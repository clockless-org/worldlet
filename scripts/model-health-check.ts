import assert from 'node:assert/strict';
import {modelHealthView,type ModelHealth} from '../ui/companion/model-health.ts';

// Settings › Your Agent names the path, the problem in plain words and the fixes that fit (ui/companion/model-health.ts).
const at=Date.parse('2026-10-06T22:32:46Z');
const codex:ModelHealth={agent:'hermes',available:true,lastReply:null,model:{name:'gpt-6-astra',id:'gpt-6-astra',provider:'openai-codex',source:'local-codex',ready:true,configured:true}};
let view=modelHealthView(codex);
assert.equal(view.path,'codex');assert.equal(view.state,'ok');assert.deepEqual(view.fixes,[]);assert.match(view.detail,/ChatGPT plan/);
// Kelvin's 2026-10-06 failure: a reply that hit the time limit says the model was slow and offers a restart.
view=modelHealthView({...codex,lastReply:{ok:false,at,error:'Hermes timed out. You can try again.'}});
assert.equal(view.state,'attention');assert.deepEqual(view.fixes,['restart']);assert.match(view.problem,/took too long/);assert.doesNotMatch(view.problem,/#fox-action/);
view=modelHealthView({...codex,lastReply:{ok:false,at,error:'HTTP 401 Unauthorized'}});
assert.deepEqual(view.fixes,['connect']);
view=modelHealthView({...codex,lastReply:{ok:false,at,error:'model_not_found'}});
assert.deepEqual(view.fixes,['connect']);
view=modelHealthView({...codex,lastReply:{ok:false,at,error:'Something odd'}});
assert.deepEqual(view.fixes,['restart','connect']);assert.match(view.problem,/Something odd/);
// A missing or expired Codex sign-in, no connection at all, an Agent that does not run, and a chosen Agent.
view=modelHealthView({...codex,model:{...codex.model,ready:false}});
assert.equal(view.state,'none');assert.deepEqual(view.fixes,['connect']);assert.equal(view.title,'No model connected');assert.match(view.problem,/missing or expired/);
view=modelHealthView({...codex,model:{name:'',id:'',provider:'',source:null,ready:false,configured:false}});
assert.equal(view.path,'none');assert.equal(view.title,'No model connected');
assert.deepEqual(modelHealthView(null).fixes,['restart']);
view=modelHealthView({...codex,model:{...codex.model,ready:false}},'Claude Code');
assert.equal(view.path,'agent');assert.equal(view.state,'ok');assert.match(view.detail,/Claude Code on this computer answers/);
view=modelHealthView({...codex,model:{name:'claude-sonnet',id:'claude-sonnet',provider:'anthropic',source:null,ready:true,configured:true},lastReply:{ok:true,at}});
assert.equal(view.path,'key');assert.match(view.detail,/API key with anthropic.*Last reply finished/);
// An Agent on another computer (Harness location remote): named by where it runs, never by a Harness name.
view=modelHealthView({...codex,agent:'remote',model:{name:'Agent on Mac mini',id:'',provider:'remote',source:null,ready:true,configured:false},location:{kind:'remote',computer:'Mac mini'}});
assert.equal(view.path,'remote');assert.equal(view.state,'ok');assert.match(view.title,/Agent on Mac mini/);assert.deepEqual(view.fixes,[]);
assert.match(view.detail,/through Worldlet there/);
// A Gateway reached directly (location `native`): no Worldlet runs there, and the page does not say one does.
view=modelHealthView({...codex,agent:'remote-openclaw',model:{name:'OpenClaw at mini.tail1.ts.net',id:'',provider:'remote-openclaw',source:null,ready:true,configured:false},location:{kind:'remote',computer:'mini.tail1.ts.net',direct:true}});
assert.equal(view.path,'remote');assert.match(view.title,/Agent on mini\.tail1\.ts\.net/);assert.match(view.detail,/reached directly/);assert.doesNotMatch(view.detail,/Worldlet there/);
view=modelHealthView({...codex,location:{kind:'remote',computer:'Mac mini'},lastReply:{ok:false,at,error:'Worldlet on Mac mini is away.'}});
assert.equal(view.state,'attention');assert.match(view.problem,/Mac mini is away/);
console.log('PASS model health: path, plain problem, fixes per failure, missing sign-in, no connection, Agent in use, Agent on another computer.');
