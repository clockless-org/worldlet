import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {BACKGROUND_SIGN_IN,CHAT_TIER,claudeCodeLoggedIn,PROVIDERS,hermesRequestModel,agentProviders,backgroundModel,chooseProvider,chosenModel,localHarnessInvocation,localHarnessStream,providerModel,providerSignIn,readLocalHarnessLine,readProviderChoices,signedInProviders} from '../agent/gate/index.ts';
import {backgroundSignIn,signInOnce,signInScript} from '../platform/host/modules/agents/provider-sign-in.ts';

// The provider Fox's Agent answers with (agent/gate/model-providers.ts): each provider maps to S, M and L models, chat
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
// Background work with no provider chosen names the chat-tier model of the provider the Agent's own default uses: a
// Hermes default of gpt-6-astra, refused by a ChatGPT-plan sign-in in its pool, failed every Applet analysis (2026-10-11).
assert.equal(backgroundModel({},'hermes','openai-codex'),'openai-codex:gpt-5.6-terra');
assert.equal(backgroundModel(saved,'hermes','openai-codex'),'anthropic:claude-sonnet-5','a chosen provider wins');
assert.equal(backgroundModel({},'hermes','nous'),null,'a provider Worldlet does not know keeps the Agent’s own model');
assert.equal(backgroundModel({},'hermes',null),null);
assert.equal(backgroundModel({},'codex','openai-codex'),null,'only an Agent that names that provider');
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

{
 // The Agent's own provider, its sign-in counted as exhausted: Hermes lists only its current model there, which the
 // account refuses (gpt-6-astra, Applet analysis every hour on one Mac, 2026-10-12); the background model is tried.
 const state=localHarnessStream({prompt:'hi',model:'openai-codex:gpt-5.6-terra'});
 const line=(value:unknown)=>readLocalHarnessLine('hermes',state,JSON.stringify(value));
 const sent=()=>state.outbox.splice(0).map(text=>JSON.parse(text));
 const listed=['openai-codex:gpt-6-astra','openrouter:deepseek/deepseek-v4-flash'];
 line({jsonrpc:'2.0',id:2,result:{sessionId:'s1',models:{currentModelId:'openai-codex:gpt-6-astra',availableModels:listed.map(modelId=>({modelId,name:modelId}))}}});
 assert.deepEqual(sent(),[{jsonrpc:'2.0',id:4,method:'session/set_model',params:{sessionId:'s1',modelId:'openai-codex:gpt-5.6-terra'}}]);
 line({jsonrpc:'2.0',id:4,result:{}});
 assert.deepEqual(sent().map(m=>m.method),['session/prompt']);
 // Refused: its own default answers, as when the switch was not tried.
 const refused=localHarnessStream({prompt:'hi',model:'openai-codex:gpt-5.6-terra'});
 const say=(value:unknown)=>readLocalHarnessLine('hermes',refused,JSON.stringify(value));
 say({jsonrpc:'2.0',id:2,result:{sessionId:'s1',models:{currentModelId:'openai-codex:gpt-6-astra',availableModels:listed.map(modelId=>({modelId,name:modelId}))}}});
 refused.outbox.splice(0);say({jsonrpc:'2.0',id:4,error:{code:-32602,message:'Cannot switch'}});
 assert.equal(refused.error,null);assert.deepEqual(refused.outbox.splice(0).map(text=>JSON.parse(text).method),['session/prompt']);
 // Another provider it does not list still leaves its own default.
 const other=localHarnessStream({prompt:'hi',model:'anthropic:claude-sonnet-5'});
 readLocalHarnessLine('hermes',other,JSON.stringify({jsonrpc:'2.0',id:2,result:{sessionId:'s1',models:{currentModelId:'openai-codex:gpt-6-astra',availableModels:listed.map(modelId=>({modelId,name:modelId}))}}}));
 assert.deepEqual(other.outbox.splice(0).map(text=>JSON.parse(text).method),['session/prompt']);
}

// Sign-in opens the Agent's own command in Terminal --------------------------------------------------------------------
const mac=signInScript('darwin',{command:'/Users/alex/.local/bin/hermes',prefix:[],title:'Hermes Agent'},['auth','add','anthropic']);
assert.equal(mac.extension,'.command');assert.match(mac.text,/^#!\/bin\/sh\n'\/Users\/alex\/\.local\/bin\/hermes' 'auth' 'add' 'anthropic'\n/);
const windows=signInScript('win32',{command:'C:\\Users\\alex\\hermes.exe',prefix:[],title:'Hermes Agent'},['auth','add','it"s']);
assert.equal(windows.extension,'.cmd');assert.match(windows.text,/"C:\\Users\\alex\\hermes\.exe" "auth" "add" "it""s"\r\n/);assert.match(windows.text,/pause/);

console.log('PASS model providers: S/M/L tiers per provider, chat on M, each Agent\'s own per-turn switch (Codex, Claude Code, pi, OpenClaw, Hermes Agent\'s API server and its ACP session/set_model with its fallbacks), signed-in providers from the Agent\'s own list, the saved choice and sign-in in the Agent\'s own command');

// Claude Code signs in again from Worldlet with no Terminal (owner decision 2026-10-11): `claude auth login`, run by
// Worldlet, and `claude auth status --json` for whether it is signed in.
assert.deepEqual(providerSignIn('claude-code','anthropic'),['auth','login']);
assert.deepEqual(BACKGROUND_SIGN_IN,['claude-code']);
assert.equal(claudeCodeLoggedIn('{"loggedIn":true,"authMethod":"oauth_token"}'),true);
assert.equal(claudeCodeLoggedIn('{"loggedIn":false}\n'),false);
assert.equal(claudeCodeLoggedIn('Not JSON'),null);
console.log('PASS Claude Code sign-in from Worldlet');
// Its sign-in page opens by itself at most once per launch, and a Sign in click while it is open shares it.
{
 // A Node script stands in for `claude`, so the check runs the same on Windows (no shell scripts there).
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'worldlet-claude-sign-in-')),log=path.join(dir,'runs.txt'),script=path.join(dir,'claude.cjs');
 fs.writeFileSync(script,`require('fs').appendFileSync(${JSON.stringify(log)},process.argv.slice(2).join(' ')+'\\n');setTimeout(()=>{},300);\n`);
 const install={id:'claude-code' as const,title:'Claude Code',command:process.execPath,prefix:[script],configured:true},env={PATH:process.env.PATH??''};
 assert.equal(signInOnce(install,env),true);
 await backgroundSignIn(install,['auth','login'],env,new AbortController().signal);
 assert.equal(signInOnce(install,env),false,'not again in this launch');
 assert.deepEqual(fs.readFileSync(log,'utf8').trim().split('\n'),['auth login'],'one sign-in page, shared');
 fs.rmSync(dir,{recursive:true,force:true});
 console.log('PASS Claude Code sign-in opens by itself once per launch');
}
