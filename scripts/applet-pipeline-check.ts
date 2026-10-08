import assert from 'node:assert/strict';
import {appletAnalysisInput,appletAnalysisRefresh,appletAnalysisCommit,appletAnalysisPending} from '../core/applets/index.ts';
import {attentionBatchInput,sourceEvidenceContext,observeAttention,planAttention,attentionCurrent} from '../core/attention/index.ts';
const now=Date.parse('2026-09-28T12:00:00Z')/1000;
const records=[{id:'promo',text:'Your subscription renews tomorrow for $20.',labelIds:['CATEGORY_PROMOTIONS']},{id:'spam',text:'Known spam',allMessagesExcluded:true},{id:'partial',text:'Incomplete mixed thread',allMessagesExcluded:true,partial:true}];
const snapshot=appletAnalysisInput('gmail',records,[],now);
assert.deepEqual(snapshot.context.map(r=>r.id),['promo','partial']);
assert.deepEqual(snapshot.skippedContextIds,['spam']);
assert.equal(records[1].text,'Known spam');
const calendar=[{id:'meeting',text:'Meeting 09:30–10:30',start:'2026-09-29T09:30:00-07:00',end:'2026-09-29T10:30:00-07:00'},{id:'cancelled',text:'Cancelled meeting',cancelled:true},{id:'past',text:'Old meeting',end:'2026-09-27T10:30:00Z'},{id:'day',text:'All day',end:'2026-09-28'}];
assert.deepEqual(appletAnalysisInput('google-calendar',calendar,[],now).context.map(r=>r.id),['meeting','day']);
const result=appletAnalysisCommit({provider:'gmail',records,latest:records,saved:{},items:[],processed:records.map(r=>r.id),now});
assert.equal(appletAnalysisPending(records,result).length,0,'Acknowledged no-findings and skipped records never rerun unchanged');
const pending=appletAnalysisRefresh([records[0]],{analyzed:{promo:'old'}},{promo:'new'});
assert.equal(pending[0].analysisPending,true);
assert.equal(appletAnalysisRefresh([records[0]],{analyzed:{promo:'new'}},{promo:'new'})[0].analysisPending,undefined);
const reg={version:1 as const,provider:'gmail',reader:'source-reader' as const,intervalMinutes:30,freshnessMinutes:1440};
const facts=observeAttention([],reg,[{id:'promo',text:records[0].text,attributes:{analysisPending:true}}],now);
assert.equal(planAttention(facts,{},now,['gmail']),null,'M cannot race unprocessed source revisions');
assert.equal(attentionCurrent([{id:facts[0].id,revision:facts[0].revision}],facts,now,['gmail']),false);
const ready=observeAttention(facts,reg,[{id:'promo',text:records[0].text}],now+1);
assert.ok(planAttention(ready,{},now+1,['gmail']));
const withdrawal=appletAnalysisCommit({provider:'gmail',records:[records[0]],latest:records,saved:{},items:[],processed:['promo'],now,publishedSourceIds:['promo']});
assert.equal(withdrawal.publishRecords.length,1,'Previously published support is rechecked even when S finds no new candidate');
const long='Unrelated marketing copy. '.repeat(400)+'Exact renewal evidence.';
const raw={context:sourceEvidenceContext([{id:'ctx',provider:'gmail',sourceId:'original',text:long},{id:'cal',provider:'google-calendar',sourceId:'meeting',text:'09:30–10:30'}]),appletCandidates:[{sources:[{provider:'gmail',id:'original',quote:'Exact renewal evidence.'}]}],pendingContextIds:['ctx','cal']};
const compact=attentionBatchInput(raw);
assert.equal(compact.context[0].text,'Exact renewal evidence.');
assert.equal(compact.context[0].evidenceExcerpt,true);
assert.equal(compact.context[1].text,'09:30–10:30');
assert.equal(raw.context[0].text,long);
assert.ok(JSON.stringify(compact).length<JSON.stringify(raw).length/5);
// Related (non-pending) records are context: the Center sees their opening, marked partial; pending seeds stay whole.
const {RELATED_CONTEXT_CHARACTERS}=await import('../core/attention/batch-input.ts');
const thread='Thread opening with the real request. '+'Older quoted history. '.repeat(600);
const neighbourhood=attentionBatchInput({pendingContextIds:['seed'],context:sourceEvidenceContext([
 {id:'seed',provider:'gmail',sourceId:'new',text:thread,keys:['thread','opening'],fingerprint:'f',changedAt:1},
 {id:'near',provider:'gmail',sourceId:'old',text:thread,keys:['thread'],fingerprint:'g',changedAt:1},
 {id:'short',provider:'google-calendar',sourceId:'standup',text:'Standup 09:30',keys:['standup']}]),
 checks:[{provider:'gmail',nextAt:1,runId:'r'}],operations:{rows:[]},workflows:{rows:[]},runtimeTasks:{rows:[{id:'attention:center',status:'running'}]},taskReviews:[],userContext:{},timeZone:'UTC'});
assert.equal(neighbourhood.context[0].text,thread,'a pending seed keeps its whole bounded original');
assert.equal(neighbourhood.context[0].evidenceExcerpt,undefined);
assert.equal(Array.from(neighbourhood.context[1].text).length,RELATED_CONTEXT_CHARACTERS);
assert.ok(thread.startsWith(neighbourhood.context[1].text)&&neighbourhood.context[1].evidenceExcerpt===true,'a related record is its exact opening, marked partial');
assert.deepEqual(neighbourhood.context[1].evidenceParts,[neighbourhood.context[1].text]);
assert.equal(neighbourhood.context[2].text,'Standup 09:30');
assert.ok(neighbourhood.context.every(row=>!('keys' in row)&&!('fingerprint' in row)&&!('changedAt' in row)),'planner bookkeeping never reaches the model');
assert.deepEqual(Object.keys(neighbourhood).sort(),['appletCandidates','context','pendingContextIds','taskReviews','timeZone','userContext'],'local check, operation and runtime state never reaches the model');
// Saved items whose inputs are all present, unchanged and not pending are marked so M outputs only new or changed findings.
const marked=attentionBatchInput({pendingContextIds:['mail'],context:[{id:'cal',revision:'r1'},{id:'mail',revision:'r2'}],items:[
 {id:'standup',attentionContentVersion:1,attentionDependencies:[{id:'cal',revision:'r1'}]},
 {id:'stale',attentionContentVersion:1,attentionDependencies:[{id:'cal',revision:'r0'}]},
 {id:'seeded',attentionContentVersion:1,attentionDependencies:[{id:'cal',revision:'r1'},{id:'mail',revision:'r2'}]},
 {id:'legacy',attentionDependencies:[{id:'cal',revision:'r1'}]},
 {id:'absent',attentionContentVersion:1,attentionDependencies:[{id:'gone',revision:'r1'}]}]});
assert.deepEqual(marked.items.filter(i=>i.unchanged).map(i=>i.id),['standup'],'only current, unseeded, versioned items are marked unchanged');
const hosted=attentionBatchInput({pendingContextIds:[],context:[{id:'cal',revision:'r1'}],items:[{id:'standup',attentionContentVersion:1}],itemDependencies:{standup:[{id:'cal',revision:'r1'}]}});
assert.equal(hosted.items[0].unchanged,true,'host-supplied saved dependencies mark model-facing items');
assert.equal('itemDependencies' in hosted,false,'internal dependencies never reach the model');
const full={id:'standup',kind:'event',provider:'google-calendar',title:'Team standup',start:'2026-09-30T09:30:00-07:00',summary:'Long copy',reason:'Why',sources:[{provider:'google-calendar',id:'s',quote:'q'}],attentionContentVersion:1};
assert.deepEqual(attentionBatchInput({pendingContextIds:[],context:[{id:'cal',revision:'r1'}],items:[full],itemDependencies:{standup:[{id:'cal',revision:'r1'}]}}).items[0],
 {id:'standup',kind:'event',provider:'google-calendar',title:'Team standup',start:'2026-09-30T09:30:00-07:00',unchanged:true},'unchanged items carry identity and timing only, not copy to restate');
const {attentionExecution}=await import('../core/attention/attention-execution.ts');
assert.match(attentionExecution('synthesis').prompt!,/Output only new findings and existing items whose content this context changes\. An item marked unchanged/);
console.log('PASS script → S checkpoints → M evidence projection: promotions preserved, deterministic skips, times, revision gating, withdrawals, compact cross-Applet evidence and unchanged-item marking');

// S staging must not enforce M's final-card typography.
const {appletCandidateContent,canonicalSourceQuotes}=await import('../core/applets/index.ts');
const candidate={provider:'gmail',kind:'task',title:'A long source-derived title that exceeds the forty character card limit',reason:'Review this useful source before the upcoming renewal deadline',summary:'Check the renewal terms.',location:'123 Example Avenue',sources:[{provider:'gmail',id:'thread:test',quote:'Renewal   deadline'}]};
const staged=appletCandidateContent(candidate);
assert.equal(staged.location,'123 Example Avenue');
assert.equal(staged.attentionContentVersion,undefined);
assert.equal(staged.attentionReason,candidate.reason);
const original='Renewal\n  deadline';
const normalized=canonicalSourceQuotes([candidate],{'gmail:thread:test':{text:original}});
assert.equal(normalized[0].sources[0].quote,original);
assert.equal(candidate.sources[0].quote,'Renewal   deadline');
assert.equal(canonicalSourceQuotes([candidate],{'gmail:thread:test':{text:'Renewal tomorrow deadline'}})[0].sources[0].quote,candidate.sources[0].quote);
assert.equal(canonicalSourceQuotes([candidate],{'gmail:thread:test':{text:'Renewal\n deadline; Renewal\tdeadline'}})[0].sources[0].quote,candidate.sources[0].quote);
assert.throws(()=>appletCandidateContent({...candidate,title:'x'.repeat(201)}));
console.log('PASS S candidate copy independent of card limits; unique whitespace-only quote recovery, immutable and fail-closed');

const unicodeMail='😀'.repeat(6000)+'a'.repeat(6000);
assert.equal(observeAttention([],reg,[{id:'unicode',text:unicodeMail}],now)[0].text,unicodeMail);
assert.throws(()=>observeAttention([],reg,[{id:'unicode',text:unicodeMail+'x'}],now));
const {attentionOwnerAllowed}=await import('../core/attention/attention-content.ts');
assert.equal(attentionOwnerAllowed('apple-reminders',[{provider:'apple-reminders'}],['gmail'],[{provider:'apple-reminders'}]),true);
assert.equal(attentionOwnerAllowed('invented',[{provider:'invented'}],['gmail'],[{provider:'apple-reminders'}]),false);
assert.equal(attentionOwnerAllowed('apple-reminders',[{provider:'gmail'}],['gmail'],[{provider:'apple-reminders'}]),false);
assert.equal(attentionOwnerAllowed('apple-reminders',[{provider:'apple-reminders'}],['gmail'],[{provider:'apple-reminders'}],'gmail'),false);
console.log('PASS Unicode source retention and grounded observation-provider ownership');
