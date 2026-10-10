import assert from 'node:assert/strict';
import {CHAT_TIER,PROVIDERS,hermesRequestModel,agentProviders,chooseProvider,chosenModel,localHarnessInvocation,localHarnessStream,providerModel,providerSignIn,readLocalHarnessLine,readProviderChoices,signedInProviders} from '../core/agent/index.ts';
import {signInScript} from '../platform/electron/src/modules/agent-runtime/provider-sign-in.ts';

// The provider Fox's Agent answers with (core/agent/model-providers.ts): each provider maps to S, M and L models, chat
// uses M, the choice reaches every Harness on its own per-turn switch, and signing in happens in the Agent itself.

// Providers and tiers -------------------------------------------------------------------------------------------------
assert.equal(CHAT_TIER,'M');
for(const provider of PROVIDERS)assert.deepEqual(Object.keys(provider.tiers),['S','M','L'],`${provider.id} has three tiers`);
assert.deepEqual(agentProviders('hermes').map(p=>p.id),['chatgpt','anthropic','opencode-go','openrouter','gemini']);
assert.deepEqual(agentProviders('claude-code').map(p=>p.id),['anthropic']);
assert.deepEqual(agentProviders('codex').map(p=>p.id),['chatgpt']);
assert.equal(providerModel('hermes','opencode-go'),'opencode-go:glm-5.3','Hermes Agent takes an ACP "provider:model" choice');
assert.equal(providerModel('hermes','chatgpt','S'),'openai-codex:gpt-6-luna');
assert.equal(providerModel('claude-code','anthropic','L'),'opus','Claude Code takes its own aliases');
assert.equal(providerModel('openclaw','anthropic'),'anthropic/claude-sonnet-5','OpenClaw takes "provider/model"');
assert.equal(providerModel('codex','chatgpt'),'gpt-5.6-terra');
assert.equal(providerModel('claude-code','chatgpt'),null,'an Agent cannot use a provider it does not support');
assert.deepEqual(providerSignIn('hermes','anthropic'),['auth','add','anthropic']);
assert.deepEqual(providerSignIn('codex','chatgpt'),['login']);
assert.equal(providerSignIn('openclaw','anthropic'),null);

// Signed in, as the Agent lists its models ----------------------------------------------------------------------------
assert.deepEqual(signedInProviders('hermes',[{id:'opencode-go:deepseek-v4-flash'},{id:'openai-codex:gpt-5.6-terra'}]),['chatgpt','opencode-go']);
assert.deepEqual(signedInProviders('openclaw',[{id:'anthropic/claude-sonnet-5'}]),['anthropic']);
assert.equal(signedInProviders('hermes',[]),null,'nothing listed says nothing');
assert.equal(signedInProviders('pi',[{id:'anthropic/x'}]),null);

// The person's choice -------------------------------------------------------------------------------------------------
let saved=chooseProvider(null,'hermes','anthropic');
assert.deepEqual(saved,{version:1,choices:{hermes:'anthropic'}});
assert.equal(chosenModel(saved,'hermes'),'anthropic:claude-sonnet-5','chat uses the M tier');
assert.equal(chosenModel(saved,'openclaw'),null,'another Agent keeps its own default');
assert.throws(()=>chooseProvider(saved,'claude-code','opencode-go'),/cannot use that provider/);
saved=chooseProvider(saved,'hermes',null);
assert.deepEqual(saved.choices,{},'null returns to the Agent\'s own setting');
assert.deepEqual(readProviderChoices({version:1,choices:{hermes:'nope','claude-code':'chatgpt',pi:'gemini',x:'anthropic'}}).choices,{pi:'gemini'},'unknown or unsupported choices are dropped');

// Each Harness's own per-turn switch -----------------------------------------------------------------------------------
const turn={system:'Be Fox.',prompt:'hi'};
const args=(id:Parameters<typeof localHarnessInvocation>[0],model:string|null)=>localHarnessInvocation(id,turn,null,{model}).args;
assert.deepEqual(args('codex','gpt-5.6-terra').slice(0,7),['exec','--json','--skip-git-repo-check','--sandbox','read-only','--model','gpt-5.6-terra']);
assert.ok(!args('codex',null).includes('--model'),'no choice: the Agent\'s own default');
assert.deepEqual(args('claude-code','sonnet').slice(args('claude-code','sonnet').indexOf('--model'),args('claude-code','sonnet').indexOf('--model')+2),['--model','sonnet']);
assert.deepEqual(args('pi','anthropic/claude-sonnet-5').slice(3,7),['--provider','anthropic','--model','claude-sonnet-5']);
assert.deepEqual(args('openclaw','anthropic/claude-sonnet-5').slice(-4,-2),['--model','anthropic/claude-sonnet-5']);
assert.deepEqual(localHarnessInvocation('hermes',turn,null,{model:'anthropic:claude-sonnet-5'}).acp,{prompt:'Be Fox.\n\nhi',model:'anthropic:claude-sonnet-5'});

// Hermes Agent's API server takes the provider and model explicitly for one request.
assert.deepEqual(hermesRequestModel('openrouter:anthropic/claude-sonnet-5'),{provider:'openrouter',model:'anthropic/claude-sonnet-5'});
assert.deepEqual(hermesRequestModel(null),{});

// Hermes Agent switches its ACP session before the prompt -------------------------------------------------------------
const hermes=(model:string,listed:string[])=>{
 const state=localHarnessStream({prompt:'hi',model});
 const line=(value:unknown)=>readLocalHarnessLine('hermes',state,JSON.stringify(value));
 line({jsonrpc:'2.0',id:1,result:{protocolVersion:1}});
 line({jsonrpc:'2.0',id:2,result:{sessionId:'s1',models:{currentModelId:'opencode-go:deepseek-v4-flash',availableModels:listed.map(modelId=>({modelId,name:modelId}))}}});
 return {state,line,sent:()=>state.outbox.splice(0).map(text=>JSON.parse(text))};
};
{
 const {state,line,sent}=hermes('anthropic:claude-sonnet-5',['anthropic:claude-sonnet-5','opencode-go:deepseek-v4-flash']);
 assert.deepEqual(sent(),[{jsonrpc:'2.0',id:4,method:'session/set_model',params:{sessionId:'s1',modelId:'anthropic:claude-sonnet-5'}}]);
 line({jsonrpc:'2.0',id:4,result:{}});
 assert.deepEqual(sent().map(m=>m.method),['session/prompt'],'the prompt follows the switch');
 assert.equal(state.error,null);
}
{
 const {sent}=hermes('anthropic:claude-sonnet-5',['opencode-go:deepseek-v4-flash']);
 assert.deepEqual(sent().map(m=>m.method),['session/prompt'],'a provider it is not signed in to: its own default answers');
}
{
 const {state,line,sent}=hermes('anthropic:claude-sonnet-5',[]);
 sent();line({jsonrpc:'2.0',id:4,error:{code:-32601,message:'Method not found'}});
 assert.deepEqual(sent().map(m=>m.method),['session/prompt'],'a Hermes Agent too old to switch answers with its own default');
 assert.equal(state.error,null);
}
{
 const {state,line,sent}=hermes('anthropic:claude-sonnet-5',['anthropic:claude-sonnet-5']);
 sent();line({jsonrpc:'2.0',id:4,error:{code:-32602,message:'No credentials for anthropic'}});
 assert.equal(state.error,'No credentials for anthropic');assert.equal(state.done,true);
}

// Sign-in opens the Agent's own command in Terminal --------------------------------------------------------------------
const mac=signInScript('darwin',{command:'/Users/alex/.local/bin/hermes',prefix:[],title:'Hermes Agent'},['auth','add','anthropic']);
assert.equal(mac.extension,'.command');assert.match(mac.text,/^#!\/bin\/sh\n'\/Users\/alex\/\.local\/bin\/hermes' 'auth' 'add' 'anthropic'\n/);
const windows=signInScript('win32',{command:'C:\\Users\\alex\\hermes.exe',prefix:[],title:'Hermes Agent'},['auth','add','it"s']);
assert.equal(windows.extension,'.cmd');assert.match(windows.text,/"C:\\Users\\alex\\hermes\.exe" "auth" "add" "it""s"\r\n/);assert.match(windows.text,/pause/);

console.log('PASS model providers: S/M/L tiers per provider, chat on M, each Agent\'s own per-turn switch (Codex, Claude Code, pi, OpenClaw, Hermes Agent\'s API server and its ACP session/set_model with its fallbacks), signed-in providers from the Agent\'s own list, the saved choice and sign-in in the Agent\'s own command');
