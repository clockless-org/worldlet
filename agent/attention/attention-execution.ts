import type {AttentionExecutionPlan} from '../../contracts/attention-jobs.ts';
import {agentRequestDeadline} from '../tasks/index.ts';
import {attentionReads} from './attention-reads.ts';

/** Product instructions and budgets supplied to the replaceable executor. */
export function attentionExecution(kind:string,provider?:string):AttentionExecutionPlan {
 if(kind==='collection'){
  if(typeof provider!=='string'||!provider)throw Error('Missing collection provider.');
  return {timeoutSeconds:agentRequestDeadline({action:'world_tool',_background:true}),reads:attentionReads(provider)};
 }
 if(kind!=='synthesis')throw Error('Unknown Attention job kind.');
 return {timeoutSeconds:agentRequestDeadline({action:'chat',monitor:true,_background:true}),prompt:"The current context is not in this message: read it, with existing items and pendingContextIds, using query_world_items, then submit with upsert_world_items, listing every context ID you handled in processedContextIds. Applet candidates are hints, not independent evidence; verify them against source facts. Process every finding, including Calendar, through the model using supplied userContext, current source facts and prior user decisions. Produce title, reason and summary under the shared attention content contract; never copy or truncate original long titles. Use concise Markdown bullets with bold key facts in summary. The card does not display the short reason. Make its summary self-contained: explain what happened, connect related messages, explain why it matters to this user and give the next useful step where supported. Expand the useful meaning of the reason without repeating the title or inventing missing facts. Do not add a heading for a single simple fact. Include upcoming confirmed Calendar commitments that are not already saved, with grounded, concise copy. Coming Up is for actual commitments, not merely dated invitations. Unaccepted invitations and opportunities the user has not decided to pursue belong in Worth Knowing (kind=update); a real required response or obligation belongs in Do Something (kind=task). Group related evidence for the same obligation, but keep distinct obligations separate. Keep exact time and full address in dedicated fields, and extract a short locationName. Rewrite legacy items without attentionContentVersion using their existing IDs. Output only new findings and existing items whose content this context changes. An item marked unchanged is already saved and current: omit it unless this context changes it, and never re-output it just to restate it. Omitting an item never removes it. Identify important source findings and synthesize useful cross-source opportunities or corrections. Reuse existing IDs, including dismissed and completed items. Review affected saved suggestions. Do not infer free time from a bounded calendar list, another person's availability from their return, a booking from inventory, or future weather from current conditions. Distinguish evidence from assumptions in the summary. Facts from provider conversations are the person's own recent conversations with another Agent they brought into Worldlet, where You is the person. From them surface only open loops that still matter now: something the person or that Agent said would be done and is not done yet, a reply or decision the person is waiting for from someone, a dated plan, booking or deadline, or a matter raised again and again without an outcome. Own such an item with provider conversations and quote the conversation. Skip settled matters, questions already answered, code details and small talk. Submit an empty items list when there is nothing useful. This is one bounded pass, not a conversation."};
}

/** Follow-up reads use host-validated collection receipts, never arbitrary tool arguments. */
export function attentionFollowupReads(provider:string,records:{id?:unknown}[]):{provider:string;id:string}[]{
 if(provider!=='notion')return [];
 const seen=new Set<string>(),reads:{provider:string;id:string}[]=[];
 for(const row of records){
  const id=row?.id;
  if(typeof id!=='string'||!id.trim()||seen.has(id))continue;
  seen.add(id);reads.push({provider,id});if(reads.length===5)break;
 }
 return reads;
}
