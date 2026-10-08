/** Persist only a classified reason and retry time, never raw provider errors. */
export function attentionFailure(message:string,now:number){
 if(/worldlet_service_credits|included AI service needs a billing update/i.test(message))return {code:'service_credits',nextAt:now+900};
 // An operator pause lasts until someone resumes it; check back hourly instead of every few minutes.
 if(/worldlet_model_paused|included AI is paused/i.test(message))return {code:'service_paused',nextAt:now+3600};
 // An outdated app stays outdated until it is updated; check back every six hours rather than every few minutes.
 if(/worldlet_update_required|version of Worldlet is out of date/i.test(message))return {code:'update_required',nextAt:now+21600};
 const allowance=/worldlet_(?:daily|monthly)_allowance|included model (?:allowance|.*budget).*used/i.test(message);
 if(!allowance)return {code:'synthesis_failed'};
 const timestamp=message.match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z/);
 const reset=timestamp?Date.parse(timestamp[0])/1000:NaN;
 // An allowance failure will not improve with a two-minute retry loop.
 const nextAt=Number.isFinite(reset)&&reset>now?reset+5:(Math.floor(now/86400)+1)*86400+5;
 return {code:'model_allowance',nextAt};
}
