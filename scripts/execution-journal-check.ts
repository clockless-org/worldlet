import assert from 'node:assert/strict';
import {journalEntry,journalPayload,executionEvent} from '../core/items/index.ts';
const payload=journalPayload({api_key:'secret',headers:{Authorization:'Bearer secret',Cookie:'session'},url:'https://host/?code=abc&token=xyz',text:'Bearer abc123',deep:[{password:'secret'}]});
assert(!JSON.stringify(payload).includes('secret'));assert(!JSON.stringify(payload).includes('abc123'));assert(!JSON.stringify(payload).includes('xyz'));
for(const kind of ['run.started','run.succeeded','run.failed','run.cancelled','run.interrupted','tool.requested','tool.result','tool.failed','harness.event','model.requested','model.result','model.interrupted','ui.command']){
 const entry=journalEntry({id:'id-1',runId:'run-1',at:100,kind,payload:{text:'Original'}});
 assert.deepEqual(executionEvent(entry.event),entry.event);assert.equal(entry.event.data.payloadRef,'execution/id-1.json');assert.deepEqual(entry.payload,{text:'Original'});
}
assert.throws(()=>journalEntry({id:'../escape',runId:'one',at:1,kind:'run.started'}));
assert.throws(()=>journalEntry({id:'windows:bad',runId:'one',at:1,kind:'run.started'}));
assert(String(journalPayload('a'.repeat(100_000))).endsWith('[TRUNCATED]'));
console.log('PASS execution journal payload redaction, bounded attachment projection, portable identities and event variants');

const model=journalEntry({id:'model-1',runId:'run-1',kind:'model.result',at:2,payload:{payload:{model:'fixture',usage:{prompt_tokens:12,completion_tokens:3}}}});
assert.equal(model.event.data.inputTokens,12);assert.equal(model.event.data.outputTokens,3);
assert(!('inputTokens' in journalEntry({id:'model-2',runId:'run-1',kind:'model.result',at:2}).event.data));
assert(!JSON.stringify(journalPayload({result:'{"api_key":"hidden-secret"}'})).includes('hidden-secret'));
const included='ab'.repeat(32);
for(const body of [{includedToken:included,includedURL:'https://example.test'},{args:{reply:{ok:true,includedToken:included}}},{result:JSON.stringify({ok:true,includedToken:included})},{text:JSON.stringify({nested:JSON.stringify({sessionToken:included})})}])
 assert(!JSON.stringify(journalPayload(body)).includes(included),'included model credentials are redacted from journal payloads');
assert.deepEqual(journalPayload({usage:{input_tokens:3,output_tokens:4}}),{usage:{input_tokens:3,output_tokens:4}});
assert.deepEqual(journalPayload({private_key:'pk-hidden',privateKey:'pk2',signing_key:'sk-hidden',signingKey:'sk2',public_key:'shown'}),{private_key:'[REDACTED]',privateKey:'[REDACTED]',signing_key:'[REDACTED]',signingKey:'[REDACTED]',public_key:'shown'},'private and signing keys are redacted; public keys are not');
assert.equal(journalEntry({id:'tool-1',runId:'run-1',kind:'tool.result',at:2,payload:{result:{error:'failed'}}}).event.kind,'tool.failed');

// CASA readiness (#1677): credentials written as text, not only as JSON keys, never persist.
const marker='fixture-nonfunctional-secret';
for(const text of [`refresh_token=${marker}`,`password=${marker}`,`{'refresh_token': '${marker}'}`,`DB_PASSWORD: ${marker}`,`client_secret: "${marker}"`,`Authorization: Bearer ${marker}`,`ya29.${marker}`,`1//0${marker}`,`-----BEGIN PRIVATE KEY-----\n${marker}\n-----END PRIVATE KEY-----`])
 assert(!JSON.stringify(journalPayload({note:text,nested:[{text}]})).includes(marker),text);
assert.equal(journalPayload(`refresh_token=${marker}`),'refresh_token=[REDACTED]');
const prose='Your password was changed. The token count rose to 1,200 tokens: fine. max_tokens=300';
assert.equal(journalPayload(prose),prose,'ordinary prose and token counts are kept');
console.log('PASS execution journal redacts credentials written as text and keeps ordinary prose');
