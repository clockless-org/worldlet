import assert from 'node:assert/strict';
import {conversationTopics,topicTitle,TOPIC_PAUSE_MS} from '../core/companion/index.ts';
// Earlier turns in one place group into topics (owner Order 2026-10-08): turns about one thing are one
// stack, a turn about something else starts the next, a long pause starts a new one, and short follow-ups
// stay with the topic they answer. Fictional turns; no model.
const at=(minutes:number)=>Date.UTC(2026,9,8,3)+minutes*60000;
let n=0;const turn=(user:string,text:string,minutes:number)=>({id:'t'+(++n),user,text,at:at(minutes)});
const turns=[
 turn('OpenClaw 的社区在哪些平台上比较活跃？','OpenClaw 的社区主要在 Discord、Reddit 和 GitHub Discussions。',0),
 turn('那排序就是 Discord，然后 Reddit，GitHub Discussions？','对，按活跃程度大致是 Discord、Reddit、GitHub Discussions。',1),
 turn('为什么？','Discord 上每天的讨论最多。',2),
 turn('今天给 Connie Chan 发了邀请吗','还没有，邀请邮件在草稿里等你确认。',3),
 turn('好','我会等你确认后再发。',4),
 turn('再详细一点','邀请里写了 Worldlet 的演示时间。',4),
 turn('What did I read on X today about agents?','You read Josh Elman on world building and two posts about agent memory.',5),
 turn('Summarize the agent memory posts','Both argue agents need durable memory outside the context window.',6),
 turn('邀请邮件的草稿发给我看看','这是给 Connie Chan 的邀请草稿。',6+TOPIC_PAUSE_MS/60000+1),
];
const topics=conversationTopics(turns);
assert.deepEqual(topics.map(t=>t.turns.map(x=>x.id)),[['t1','t2','t3'],['t4','t5','t6'],['t7','t8'],['t9']],JSON.stringify(topics.map(t=>t.turns.map(x=>x.user))));
assert.equal(topics[0].id,'t1','a topic keeps its first turn\'s id as it grows');
assert.equal(topics[0].title,'OpenClaw 的社区在哪些平台上比较活跃？','its name is its first question');
assert.equal(topicTitle([{id:'a',user:'',text:'Welcome back. Want to pick up where you left off?',at:0}]),'Welcome back. Want to pick up where you…','a line Fox said first names it, on one short line');
assert.equal(conversationTopics([]).length,0);
// Turns with no times (restored from an older archive) group by their words only.
assert.equal(conversationTopics([{id:'a',user:'Plan my trip to Tokyo next week',text:'Here is a Tokyo plan.',at:0},{id:'b',user:'Add a day trip from Tokyo to Nikko',text:'Added Nikko.',at:0}]).length,1);
console.log('PASS conversation topics: same-subject turns stack, another subject or a 30-minute pause starts a new stack, short follow-ups stay, named by the first question.');
