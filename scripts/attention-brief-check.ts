import assert from 'node:assert/strict';
import {attentionBrief} from '../agent/attention/attention-brief.ts';
import {dailyScheduleResult} from '../agent/agent/index.ts';
const page={title:'Annual conference',sourceProvider:'google-calendar',sourceURL:'https://example.com/event',worldItemKind:'event',worldItemSources:[],worldItemSignal:{start:'2026-09-26T09:00:00-07:00',end:'2026-09-26T21:00:00-07:00',location:'Convention Center',summary:'Very long original description. '.repeat(100)}};
const brief=attentionBrief(page);
assert.match(brief,/\*\*When:\*\*/);assert.match(brief,/\*\*Where:\*\* Convention Center/);assert.match(brief,/\[Open original\]\(https:\/\/example.com\/event\)/);
assert.match(brief,/^\*\*Key point:\*\* Very long original description\.$/m);assert.ok(brief.length<350);assert.ok(brief.split('\n\n').length>=4);
const task=attentionBrief({...page,worldItemKind:'task',sourceProvider:'gmail',sourceURL:'javascript:alert(1)',worldItemSignal:{summary:'Please confirm your attendance. '+ 'Repeated detail. '.repeat(100),location:'https://example.com/meeting(a)'}});
assert.match(task,/\*\*Next:\*\* Please confirm your attendance\./);assert.ok(!task.includes('Repeated detail'));assert.ok(!task.includes('javascript:'));assert.match(task,/meeting%28a%29/);
assert.ok(!attentionBrief({...page,worldItemSignal:{start:'invalid'}}).includes('When:'));
// A scheduled result (the morning brief, docs/ATTENTION-CENTER.md#scheduled-results): its brief is the card's first line,
// with no original to open, since it lives in the Journal.
const kept:any=dailyScheduleResult({kind:'plan',day:'2026-10-07',artifact:{id:'art-brief0000001',title:'Plan · Wed, Oct 7',body:'**Today**\n\nA quiet day. Two replies wait for you.'},at:Date.parse('2026-10-07T13:05:00Z'),now:Date.parse('2026-10-07T13:06:00Z')})?.item;
const scheduled=attentionBrief({title:kept.title,sourceProvider:kept.provider,sourceURL:'',worldItemKind:kept.kind,worldItemSources:kept.sources,worldItemSignal:{summary:kept.summary}});
assert.equal(scheduled,'**Today’s prep · Oct 7**\n\n**Key point:** A quiet day.','a scheduled brief: its title and the card’s first point, no source link: '+scheduled);
console.log('PASS bounded evidence summaries, paragraphs, emphasis, dates and safe source links; a scheduled brief has no original to open');
