// What a Fox turn on the person's own Agent used and how fast it answered (contracts/harness-services.ts HarnessUsage):
// the usage each Harness reports, read the same way for all of them, never estimated. Hermes Agent's ACP `session/prompt`
// result carries `usage` totals since its session's agent was built (acp_adapter/server.py `Usage`, 0.21.3) and its
// `usage_update` the context (`used`/`size`, a `cost` only when an Agent sends one); OpenClaw's `/v1/responses` carries
// OpenAI-style `usage` per response (toOpenAiResponsesUsage, 2026.9.8). Shared rules only; the host reads the streams.
// Kept ES-compatible for JavaScriptCore and Jint.
import type {HarnessUsage} from '../../contracts/harness-services.ts';

const record=(value:unknown):Record<string,any>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,any>:{};
const count=(value:unknown)=>typeof value==='number'&&Number.isFinite(value)&&value>=0?Math.min(Math.round(value),1e12):undefined;
const TOKENS=['inputTokens','outputTokens','totalTokens','cachedTokens','reasoningTokens'] as const;
const pick=(...values:unknown[])=>{for(const value of values){const n=count(value);if(n!==undefined)return n;}return undefined;};
function usage(parts:Partial<Record<typeof TOKENS[number],number|undefined>>&{cost?:unknown;context?:unknown}):HarnessUsage|null {
 const out:HarnessUsage={};
 for(const key of TOKENS)if(parts[key]!==undefined)out[key]=parts[key];
 const cost=record(parts.cost),amount=typeof cost.amount==='number'&&Number.isFinite(cost.amount)&&cost.amount>=0?cost.amount:null;
 if(amount!==null&&typeof cost.currency==='string'&&/^[A-Z]{3}$/.test(cost.currency))out.cost={amount,currency:cost.currency};
 const context=record(parts.context),used=count(context.used),size=count(context.size);
 if(used!==undefined&&size)out.context={used,size};
 if(out.totalTokens===undefined&&(out.inputTokens!==undefined||out.outputTokens!==undefined))out.totalTokens=(out.inputTokens??0)+(out.outputTokens??0);
 return Object.keys(out).length?out:null;
}
/** A usage as it crosses into the page and the World's records: known fields, bounded numbers. */
export function readHarnessUsage(value:unknown):HarnessUsage|null {
 const v=record(value),parts:Record<string,unknown>={cost:v.cost,context:v.context};
 for(const key of TOKENS)parts[key]=count(v[key]);
 return usage(parts);
}

/** ACP `session/prompt` result `usage` (camelCase on the wire; snake_case accepted): totals for the session so far. */
export function acpPromptUsage(result:unknown):HarnessUsage|null {
 const u=record(record(result).usage);
 return usage({inputTokens:pick(u.inputTokens,u.input_tokens),outputTokens:pick(u.outputTokens,u.output_tokens),totalTokens:pick(u.totalTokens,u.total_tokens),
  cachedTokens:pick(u.cachedReadTokens,u.cached_read_tokens),reasoningTokens:pick(u.thoughtTokens,u.thought_tokens)});
}
/** An ACP `usage_update` session update: the context now and, when the Agent sends one, the session's cost so far. */
export function acpUsageUpdate(update:unknown):HarnessUsage|null {
 const u=record(update);
 return u.sessionUpdate==='usage_update'?usage({context:{used:u.used,size:u.size},cost:u.cost}):null;
}
/** One turn's share of session totals: `current` less `previous`; totals that went down (the Agent's session was built
 * again: a restart, a model switch) are this turn's own. The context is the current one, never a difference. */
export function usageSince(previous:HarnessUsage|null,current:HarnessUsage|null):HarnessUsage|null {
 if(!current)return null;
 if(!previous)return current;
 const restarted=TOKENS.some(key=>(current[key]??0)<(previous[key]??0));
 const parts:Record<string,unknown>={context:current.context};
 for(const key of TOKENS)if(current[key]!==undefined)parts[key]=restarted?current[key]:current[key]!-(previous[key]??0);
 if(current.cost)parts.cost=restarted||!previous.cost||previous.cost.currency!==current.cost.currency||current.cost.amount<previous.cost.amount?current.cost:{amount:current.cost.amount-previous.cost.amount,currency:current.cost.currency};
 return usage(parts);
}
/** An OpenAI-style `usage` object (`/v1/responses`: `input_tokens`, `output_tokens`, their `_details`). */
export function responsesUsage(value:unknown):HarnessUsage|null {
 const u=record(value);
 return usage({inputTokens:pick(u.input_tokens,u.prompt_tokens),outputTokens:pick(u.output_tokens,u.completion_tokens),totalTokens:pick(u.total_tokens),
  cachedTokens:pick(record(u.input_tokens_details).cached_tokens),reasoningTokens:pick(record(u.output_tokens_details).reasoning_tokens)});
}
/** Two usages together (a turn's tool rounds, a thread's turns); the later context wins; costs add in one currency. */
export function addHarnessUsage(a:HarnessUsage|null,b:HarnessUsage|null):HarnessUsage|null {
 if(!a||!b)return a??b??null;
 const parts:Record<string,unknown>={context:b.context??a.context};
 for(const key of TOKENS)if(a[key]!==undefined||b[key]!==undefined)parts[key]=(a[key]??0)+(b[key]??0);
 if(a.cost&&b.cost&&a.cost.currency===b.cost.currency)parts.cost={amount:a.cost.amount+b.cost.amount,currency:a.cost.currency};
 else parts.cost=a.cost&&b.cost?undefined:a.cost??b.cost;
 return usage(parts);
}
const short=(n:number)=>n<1000?String(n):n<10_000?(n/1000).toFixed(1).replace(/\.0$/,'')+'k':n<1e6?Math.round(n/1000)+'k':(n/1e6).toFixed(1).replace(/\.0$/,'')+'M';
const money=({amount,currency}:{amount:number;currency:string})=>(currency==='USD'?'$':'')+(amount<0.01?amount.toFixed(4):amount.toFixed(2))+(currency==='USD'?'':' '+currency);
/** One quiet line: "1.2k tokens · $0.004"; `detail` adds the parts ("in 1,000 · out 200 · cached 50"). Empty when
 * nothing was reported. */
export function harnessUsageLabel(value:HarnessUsage|null,{detail=false}:{detail?:boolean}={}):string {
 if(!value||value.totalTokens===undefined&&!value.cost)return '';
 const head=[value.totalTokens!==undefined?short(value.totalTokens)+' tokens':'',value.cost?money(value.cost):''].filter(Boolean).join(' · ');
 if(!detail)return head;
 const parts=[['in',value.inputTokens],['out',value.outputTokens],['cached',value.cachedTokens],['reasoning',value.reasoningTokens]].filter(([,n])=>typeof n==='number').map(([name,n])=>`${name} ${Number(n).toLocaleString('en-US')}`);
 if(value.context)parts.push(`context ${Math.round(value.context.used/value.context.size*100)}% full`);
 return parts.length?head+' ('+parts.join(' · ')+')':head;
}

/** A turn's timings for the World's Fox timing record (core/diagnostics/fox-timing.ts allowlist; logs/fox-timing.jsonl,
 * and only buckets in `fox_timing`): `sessionMs` opening the thread's session (near 0 once warmed), `firstTextMs`
 * from send to the first word of the reply, and the reported tokens. */
export function harnessTurnTimings({sessionMs,firstTextMs,usage:used}:{sessionMs?:number;firstTextMs?:number|null;usage?:HarnessUsage|null}):Record<string,number> {
 const out:Record<string,number>={};
 const put=(key:string,value:unknown)=>{const n=count(value);if(n!==undefined)out[key]=n;};
 put('sessionMs',sessionMs);put('firstTextMs',firstTextMs);
 if(used){put('input_tokens',used.inputTokens);put('output_tokens',used.outputTokens);put('reasoning_tokens',used.reasoningTokens);put('cache_read_tokens',used.cachedTokens);}
 return out;
}
