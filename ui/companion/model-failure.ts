// Only known provider failures become local recovery guidance. Never echo keys or URLs.
export function modelFailure(error){
 const text=String(error?.message||error||'').toLowerCase();
 const configure='[Change model connection](#fox-action=open.model)';
 // Worldlet provides no model (owner decision 2026-10-05): with no Codex sign-in and no key of their own, Fox has none.
 if(/codex_local_missing|runs on an ai on this computer/.test(text))return {code:'no_local_model',message:'Fox runs on your own AI Agent, and none is ready yet. Choose one and sign it in to a provider in Settings, under Agent.\n\n'+configure};
 if(/insufficient_quota|insufficient (?:balance|credits|funds)|credit balance|billing_hard_limit|quota exceeded|usage limit|exceeded your.*quota|payment required/.test(text))return {code:'quota',message:'Your model provider has no available usage or credit for this request. Check your plan or balance with that provider, or use another connection.\n\n'+configure};
 if(/invalid_api_key|incorrect api key|invalid api key|authentication(?:error| failed)|unauthorized|http 401|status(?: code)?[: =]+401|no api key|api key.*(?:missing|not set)|no model.*configured/.test(text))return {code:'authentication',message:'Your model connection needs attention. Sign in to the provider again, in your Agent or in Settings, under Agent.\n\n'+configure};
 if(/model_not_found|model.*(?:not supported|does not exist|not available|do not have access)|unsupported model/.test(text))return {code:'model',message:'This model is not available to your account. Choose another provider in Settings, under Agent. If this is a managed workspace, its admin may need to allow it; Worldlet cannot change that account control.\n\n'+configure};
 if(/rate_limit|rate limit|too many requests|http 429/.test(text))return {code:'rate_limit',message:'Your model provider is limiting requests right now. Wait a little, then send your message again. You can also choose another connection.\n\n'+configure};
 if(/connection(?:error| error)|connecterror|network (?:error|unreachable)|offline|name resolution|failed to fetch/.test(text))return {code:'network',message:'Fox could not reach its model service, so this reply did not finish. Check your internet connection, then send it again. Your saved conversations are kept.\n\n'+configure};
 // A reply that took too long (Hermes or the model provider stopped waiting) is not an internet or connection
 // problem: the model was slow, often on a long research step. Say so, and what to do.
 if(/timed? out|timeout|took too long/.test(text))return {code:'timeout',message:'Fox’s model took too long to answer, so this reply stopped. This usually means the model was slow, not that your internet or model connection broke. Send it again, or ask for one smaller step at a time. Your saved conversations are kept.\n\n'+configure};
 return null;
}
