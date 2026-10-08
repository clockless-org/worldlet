// Only known provider failures become local recovery guidance. Never echo keys or URLs.
export function modelFailure(error){
 const text=String(error?.message||error||'').toLowerCase();
 const configure='[Change model connection](#fox-action=open.model)';
 // The model service no longer serves this release (its owner set a minimum app version).
 if(/worldlet_update_required|version of worldlet is out of date/.test(text))return {code:'update_required',message:'This version of Worldlet is out of date, so Worldlet’s included AI no longer answers it. Update Worldlet to keep talking with Fox. Your world and conversations are kept.\n\n[Update Worldlet](#fox-action=app.update)'};
 // The operator paused the included AI (models/README.md, MODEL_PAUSED): say so plainly instead of
 // the raw 503 or a connection hint, since nothing on this computer is wrong.
 if(/worldlet_model_paused|included ai is paused/.test(text))return {code:'paused',message:'Worldlet’s included AI is paused right now, so Fox can’t answer. Nothing is wrong on your computer, and your conversations and connections are kept. You can connect your own model to keep going.\n\n'+configure};
 if(/worldlet_monthly_allowance|included monthly model allowance|model allowance for this month/.test(text))return {code:'included_allowance',message:'This month’s included Worldlet model allowance is used. It resets at the start of the next UTC month. You can connect your own model to continue.\n\n'+configure};
 if(/worldlet_daily_allowance|included model (?:request )?allowance/.test(text))return {code:'included_allowance',message:'Today’s included Worldlet model allowance is used. It resets at 00:00 UTC. You can wait for the reset or connect your own model to continue.\n\n'+configure};
 if(/worldlet_rate_limit|worldlet is receiving too many requests/.test(text))return {code:'rate_limit',message:'Worldlet is receiving too many requests. Wait a minute, then try again.\n\n'+configure};
 // Worldlet provides no model (owner decision 2026-10-05): with no Codex sign-in and no key of their own, Fox has none.
 if(/codex_local_missing|runs on an ai on this computer/.test(text))return {code:'no_local_model',message:'Fox runs on an AI on your own computer, and none is connected yet. Sign in to Codex on this computer, use an Agent such as Claude Code or Hermes Agent, or add your own API key in Settings, under Model.\n\n'+configure};
 if(/insufficient_quota|insufficient (?:balance|credits|funds)|credit balance|billing_hard_limit|quota exceeded|usage limit|exceeded your.*quota|payment required/.test(text))return {code:'quota',message:'Your model provider has no available usage or credit for this request. Check your plan or balance with that provider, or use another connection.\n\n'+configure};
 if(/invalid_api_key|incorrect api key|invalid api key|authentication(?:error| failed)|unauthorized|http 401|status(?: code)?[: =]+401|no api key|api key.*(?:missing|not set)|no model.*configured/.test(text))return {code:'authentication',message:'Your model connection needs attention. Check or replace the API key, or sign in again if you use Codex.\n\n'+configure};
 if(/model_not_found|model.*(?:not supported|does not exist|not available|do not have access)|unsupported model/.test(text))return {code:'model',message:'This model is not available to your account. For Codex, open model connection and choose Check available models. If this is a managed ChatGPT workspace, its admin may need to allow Codex Local; Worldlet cannot change that account control. For an API provider, select a model your account can use.\n\n'+configure};
 if(/rate_limit|rate limit|too many requests|http 429/.test(text))return {code:'rate_limit',message:'Your model provider is limiting requests right now. Wait a little, then send your message again. You can also choose another connection.\n\n'+configure};
 if(/connection(?:error| error)|connecterror|network (?:error|unreachable)|offline|name resolution|failed to fetch/.test(text))return {code:'network',message:'Fox could not reach its model service, so this reply did not finish. Check your internet connection, then send it again. Your saved conversations are kept.\n\n'+configure};
 // A reply that took too long (Hermes or the model provider stopped waiting) is not an internet or connection
 // problem: the model was slow, often on a long research step. Say so, and what to do.
 if(/timed? out|timeout|took too long/.test(text))return {code:'timeout',message:'Fox’s model took too long to answer, so this reply stopped. This usually means the model was slow, not that your internet or model connection broke. Send it again, or ask for one smaller step at a time. Your saved conversations are kept.\n\n'+configure};
 return null;
}
