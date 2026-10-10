/** A coding agent's weekly allowance from its reported rate limits (world-renderer.ts WorldApplet.allowance); null once
 * the report is over five minutes old or has no weekly window. */
export function weeklyQuota(value,now=Date.now()){
 if(value?.observedAt&&now-value.observedAt>300000)return null;
 const buckets=value?.rateLimitsByLimitId ? Object.values<any>(value.rateLimitsByLimitId) : value?.rateLimits?[value.rateLimits]:[];
 const weekly=buckets.flatMap(b=>[b.primary,b.secondary]).filter(w=>w?.windowDurationMins===10080&&Number.isFinite(w.usedPercent)&&Number.isFinite(w.resetsAt)&&w.resetsAt*1000>now);
 if(!weekly.length)return null;
 const w=weekly.reduce((a,b)=>a.usedPercent>b.usedPercent?a:b);
 return {remaining:Math.max(0,Math.min(100,100-w.usedPercent)),resetsAt:w.resetsAt};
}
