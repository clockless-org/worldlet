/** One deterministic extraction context for every native host. Time and originals are host facts. */
export function sourceAnalysisRequest(input:{sourceId:string;title:string;text:string;now:string;topics:unknown[]}) {
 if(!input||typeof input.sourceId!=='string'||!input.sourceId||typeof input.title!=='string'||typeof input.text!=='string'||typeof input.now!=='string'||!Number.isFinite(Date.parse(input.now))||!Array.isArray(input.topics))throw Error('Invalid source analysis request.');
 const topics=[...new Set(input.topics.filter((topic):topic is string=>typeof topic==='string'&&topic.trim().length>0))].sort().slice(0,100);
 return {sources:[{sourceId:input.sourceId,title:input.title,text:input.text}],now:input.now,existingTopics:topics};
}
