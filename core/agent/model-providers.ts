// Which provider the person's Agent answers with (owner decisions 2026-10-10): the person picks only a provider, never a
// model, and each provider maps to three model tiers, S, M and L. Fox's turns use M. The model always runs in the
// Agent, on the Agent's own sign-in to that provider; Worldlet only names the provider's tier model on the Agent's own
// per-turn switch (Codex `--model`, Claude Code `--model`, pi `--provider`/`--model`, OpenClaw `--model` and its Gateway's
// model header, Hermes Agent's ACP `session/set_model`), so the Agent's own default stays as the person set it.
// Changing a tier's model is an edit to PROVIDERS. Kept ES-compatible for JavaScriptCore and Jint.
import type {LocalHarnessId} from './local-harness.ts';

export type ModelTier='S'|'M'|'L';
/** The tier Fox's conversation uses. */
export const CHAT_TIER:ModelTier='M';

export type ModelProviderId='chatgpt'|'anthropic'|'opencode-go'|'openrouter'|'gemini';
export interface ModelProvider {
 id:ModelProviderId;
 name:string;
 /** What signing in to it means, in the person's words. */
 account:string;
 tiers:Readonly<Record<ModelTier,string>>;
}

/** Model ids as each provider names them (Hermes Agent's catalog, hermes_cli/models_catalog_static.py, 2026-10). */
export const PROVIDERS:readonly ModelProvider[]=[
 {id:'chatgpt',name:'ChatGPT',account:'Your ChatGPT plan',tiers:{S:'gpt-6-luna',M:'gpt-5.6-terra',L:'gpt-6-sol'}},
 {id:'anthropic',name:'Anthropic',account:'Your Claude plan or Anthropic API key',tiers:{S:'claude-haiku-4-5-20251001',M:'claude-sonnet-5',L:'claude-opus-5-5'}},
 {id:'opencode-go',name:'OpenCode Go',account:'Your OpenCode Go subscription',tiers:{S:'deepseek-v4-flash',M:'glm-5.3',L:'kimi-k3'}},
 {id:'openrouter',name:'OpenRouter',account:'Your OpenRouter API key',tiers:{S:'anthropic/claude-haiku-4.5',M:'anthropic/claude-sonnet-5',L:'anthropic/claude-opus-5.5'}},
 {id:'gemini',name:'Google Gemini',account:'Your Gemini API key',tiers:{S:'gemini-3.7-flash',M:'gemini-3.8-flash',L:'gemini-3.1-pro-preview'}}
];
export const isModelProviderId=(value:unknown):value is ModelProviderId=>PROVIDERS.some(provider=>provider.id===value);
export function modelProvider(id:ModelProviderId):ModelProvider {
 const found=PROVIDERS.find(provider=>provider.id===id);
 if(!found)throw Error('Unknown provider.');
 return found;
}

/** How one Agent names a provider and its models. `provider`: the Agent's own provider id; `model`: the id it takes for
 * a tier model; `signIn`: the Agent's own command that signs in to it, run in the person's Terminal, or by Worldlet
 * itself for an Agent in `BACKGROUND_SIGN_IN` (null: it has none Worldlet can name, or the Agent signs in another way). */
interface AgentProvider {provider:string;model:(tier:ModelTier,model:string)=>string;signIn:string[]|null}
const same=(_tier:ModelTier,model:string)=>model;
/** Claude Code's own aliases follow its newest model in each class. */
const CLAUDE_ALIASES:Record<ModelTier,string>={S:'haiku',M:'sonnet',L:'opus'};
const AGENT_PROVIDERS:Readonly<Record<LocalHarnessId,Partial<Record<ModelProviderId,AgentProvider>>>>={
 codex:{chatgpt:{provider:'openai',model:same,signIn:['login']}},
 'claude-code':{anthropic:{provider:'anthropic',model:tier=>CLAUDE_ALIASES[tier],signIn:['auth','login']}},
 // ACP choice ids are "provider:model" (acp_adapter/model_catalog.py encode_model_choice).
 hermes:{
  chatgpt:{provider:'openai-codex',model:(_tier,model)=>'openai-codex:'+model,signIn:['auth','add','openai-codex']},
  anthropic:{provider:'anthropic',model:(_tier,model)=>'anthropic:'+model,signIn:['auth','add','anthropic']},
  'opencode-go':{provider:'opencode-go',model:(_tier,model)=>'opencode-go:'+model,signIn:['auth','add','opencode-go']},
  openrouter:{provider:'openrouter',model:(_tier,model)=>'openrouter:'+model,signIn:['auth','add','openrouter']},
  gemini:{provider:'gemini',model:(_tier,model)=>'gemini:'+model,signIn:['auth','add','gemini']}
 },
 // OpenClaw model refs are "provider/model".
 openclaw:{
  chatgpt:{provider:'openai-codex',model:(_tier,model)=>'openai-codex/'+model,signIn:null},
  anthropic:{provider:'anthropic',model:(_tier,model)=>'anthropic/'+model,signIn:null},
  openrouter:{provider:'openrouter',model:(_tier,model)=>'openrouter/'+model,signIn:null}
 },
 // pi takes the provider and the model as two flags; the pair travels as "provider/model" (piModelArguments).
 pi:{
  chatgpt:{provider:'openai-codex',model:(_tier,model)=>'openai-codex/'+model,signIn:null},
  anthropic:{provider:'anthropic',model:(_tier,model)=>'anthropic/'+model,signIn:null},
  openrouter:{provider:'openrouter',model:(_tier,model)=>'openrouter/'+model,signIn:null},
  gemini:{provider:'google',model:(_tier,model)=>'google/'+model,signIn:null}
 }
};

/** The providers `agent` can answer with, in PROVIDERS order. */
export function agentProviders(agent:LocalHarnessId):ModelProvider[] {
 const own=AGENT_PROVIDERS[agent]??{};
 return PROVIDERS.filter(provider=>own[provider.id]);
}
/** The model id `agent` takes for `provider`'s `tier`, or null when it cannot use that provider. */
export function providerModel(agent:LocalHarnessId,provider:ModelProviderId,tier:ModelTier=CHAT_TIER):string|null {
 const own=AGENT_PROVIDERS[agent]?.[provider];
 return own?own.model(tier,modelProvider(provider).tiers[tier]):null;
}
/** Agents whose sign-in command Worldlet runs itself, with no Terminal (owner decision 2026-10-11): it opens the
 * person's browser on its own and ends when they approve. Claude Code's `claude auth login` (2.1.40 and later). */
export const BACKGROUND_SIGN_IN:readonly LocalHarnessId[]=['claude-code'];
/** Claude Code's own sign-in state: `claude auth status --json` prints `loggedIn`; null when it says nothing usable. */
export const CLAUDE_CODE_STATUS=['auth','status','--json'];
export function claudeCodeLoggedIn(output:string):boolean|null {
 try{const value=JSON.parse(output.trim());return typeof value?.loggedIn==='boolean'?value.loggedIn:null;}catch{return null;}
}
/** The arguments of `agent`'s own sign-in command for `provider`, or null. */
export function providerSignIn(agent:LocalHarnessId,provider:ModelProviderId):string[]|null {
 return AGENT_PROVIDERS[agent]?.[provider]?.signIn??null;
}
/** Which providers `agent` is signed in to, from the models it lists ("provider:model" for Hermes Agent, "provider/model"
 * for OpenClaw); null when its list says nothing about providers (an Agent with one provider, or none listed yet). */
export function signedInProviders(agent:LocalHarnessId,listed:readonly {id:string}[]):ModelProviderId[]|null {
 if(agent!=='hermes'&&agent!=='openclaw'||!listed.length)return null;
 const separator=agent==='hermes'?':':'/',prefixes=new Set(listed.map(model=>model.id.split(separator)[0]));
 return agentProviders(agent).filter(provider=>prefixes.has(AGENT_PROVIDERS[agent][provider.id]!.provider)).map(provider=>provider.id);
}
/** Hermes Agent's API server takes a chosen "provider:model" as an explicit `provider` and `model` for one request. */
export function hermesRequestModel(model:string|null):{provider:string;model:string}|{} {
 const at=model?model.indexOf(':'):-1;
 return model&&at>0?{provider:model.slice(0,at),model:model.slice(at+1)}:{};
}
/** pi's `--provider` and `--model` for a "provider/model" id. */
export function piModelArguments(model:string):string[] {
 const at=model.indexOf('/');
 return at>0?['--provider',model.slice(0,at),'--model',model.slice(at+1)]:['--model',model];
}

// The person's choice --------------------------------------------------------------------------------------------------

/** Where the choice is kept: the World's agent settings, which follow the person with the World. */
export const PROVIDER_SETTING='model-provider';
/** Per Agent, the provider chosen for it; an Agent with none answers with its own default. */
export type ProviderChoices={version:1;choices:Partial<Record<LocalHarnessId,ModelProviderId>>};
export function readProviderChoices(value:unknown):ProviderChoices {
 const raw=value&&typeof value==='object'&&!Array.isArray(value)?(value as Record<string,any>).choices:null,choices:ProviderChoices['choices']={};
 if(raw&&typeof raw==='object')for(const [agent,provider] of Object.entries(raw))
  if(agent in AGENT_PROVIDERS&&isModelProviderId(provider)&&AGENT_PROVIDERS[agent as LocalHarnessId][provider])choices[agent as LocalHarnessId]=provider;
 return {version:1,choices};
}
/** `provider` null returns `agent` to its own default. */
export function chooseProvider(value:unknown,agent:LocalHarnessId,provider:ModelProviderId|null):ProviderChoices {
 const next=readProviderChoices(value);
 if(provider!==null&&!AGENT_PROVIDERS[agent]?.[provider])throw Error('This Agent cannot use that provider.');
 if(provider)next.choices[agent]=provider;else delete next.choices[agent];
 return next;
}
/** The model `agent`'s turns use at `tier` under the saved choice, or null for the Agent's own default. */
export function chosenModel(value:unknown,agent:LocalHarnessId,tier:ModelTier=CHAT_TIER):string|null {
 const provider=readProviderChoices(value).choices[agent];
 return provider?providerModel(agent,provider,tier):null;
}
/** Worldlet's own background work (Applet analysis, Attention checks, Applet tasks) when no provider is chosen: the
 * chat-tier model of the provider the Agent's own default already uses (`ownProvider`, the Agent's id for it), so
 * Worldlet picks a model every account of that provider accepts. The Agent's own default model can be one a sign-in
 * in its credential pool refuses (gpt-6-astra on a ChatGPT plan: HTTP 400 on every Applet analysis, 2026-10-11).
 * Null keeps the Agent's own default (a provider Worldlet does not know). The Agent's settings are never changed. */
export function backgroundModel(value:unknown,agent:LocalHarnessId,ownProvider:string|null):string|null {
 const chosen=chosenModel(value,agent);
 if(chosen)return chosen;
 const own=AGENT_PROVIDERS[agent]??{};
 const provider=PROVIDERS.find(item=>!!ownProvider&&own[item.id]?.provider===ownProvider);
 return provider?providerModel(agent,provider.id):null;
}
