import assert from 'node:assert/strict';
import {groupAttentionEvents as group,attentionEventRecord as record} from '../core/attention/index.ts';
// Synthetic accounts, merchants and messages only. `thread` adds a shared source record,
// the only evidence that separate messages belong to one incident.
const now=Date.parse('2026-01-10T12:00:00Z'),later='2026-01-11T12:00:00.000Z';
const m=(id:string,{thread,...extra}:any={})=>({id,provider:'gmail',kind:'update',state:'unseen',priority:'normal',
 sources:[{provider:'gmail',id:'msg-'+id,quote:'Synthetic '+id},...(thread?[{provider:'gmail',id:'thread-'+thread,quote:'Synthetic thread'}]:[])],...extra});
const login=(id:string,subject:string,extra={})=>m(id,{title:'New sign-in',event:{topic:'Sign-in alert',subject},...extra});
const pay=(id:string,subject:string,extra={})=>m(id,{title:'Payment received',event:{topic:'payment',subject},...extra});
const cafe=(id:string,extra={})=>pay(id,'Synthetic Cafe',{thread:'cafe',...extra});
const ids=(events:any[])=>events.map(e=>e.members.map((x:any)=>x.id));

let out=group([login('a','ada@example.test',{actionLabel:'Review sign-in',thread:'ada'}),login('b','ADA@example.test ',{actionLabel:'Secure account',thread:'ada'}),login('c','ada@example.test',{actionLabel:'Review sign-in',thread:'ada'})],{now});
assert.equal(out.length,1);assert.equal(out[0].messageCount,3);assert.equal(out[0].sources.length,4);
assert.deepEqual(out[0].actions,['Review sign-in','Secure account']);
console.log('PASS related sign-in alerts that share a source record become one event with every source, count and action');

out=group([login('a','ada@example.test'),login('b','bo@example.test'),cafe('c'),pay('d','Example Books'),cafe('e')],{now});
assert.deepEqual(out.map(e=>e.messageCount),[1,1,2,1]);
assert.deepEqual(ids(out),[['a'],['b'],['c','e'],['d']]);
console.log('PASS different accounts and merchants stay separate even with shared sign-in or payment keywords');

// Masked labels are not identifiers: two accounts with one issuer and last-4, or unrelated
// incidents at one merchant, carry identical labels on separate records and stay separate.
const card4={topic:'Payment declined',subject:'Example Bank card ending 1234'};
out=group([m('acct-1',{event:card4}),m('acct-2',{event:{...card4}}),pay('jan','Synthetic Cafe'),pay('jun','Synthetic Cafe')],{now});
assert.deepEqual(ids(out),[['acct-1'],['acct-2'],['jan'],['jun']]);
assert.equal(new Set(out.map(e=>e.id)).size,4,'Identical labels on unrelated records never share an event ID');
out=group([m('acct-1',{event:card4,thread:'decline'}),m('acct-1b',{event:card4,thread:'decline'}),m('acct-2',{event:card4})],{now});
assert.deepEqual(ids(out),[['acct-1','acct-1b'],['acct-2']]);
console.log('PASS an identical masked label alone never joins separate records; a shared source record still does');

out=group([m('a',{title:'Payment received'}),m('b',{title:'Payment received'}),m('c',{title:'Payment received',kind:'task'})],{now});
assert.equal(out.length,3);
out=group([m('a',{title:'Sign-in'}),m('b',{title:'Sign-in',sources:[{provider:'gmail',id:'msg-a',quote:'Repeat'}]}),m('c',{provider:'notion',sources:[{provider:'notion',id:'msg-a',quote:'Other provider'}]})],{now});
assert.deepEqual(ids(out),[['a','b'],['c']]);
assert.equal(out[0].sources.length,1);
console.log('PASS keywords alone never group; a repeated source record folds only within its provider and kind');

const digest=[{provider:'gmail',id:'digest',quote:'Weekly digest'}];
out=group([login('a','ada@example.test',{sources:digest}),login('b','bo@example.test',{sources:digest}),m('c',{sources:digest})],{now});
assert.equal(out.length,2);assert.ok(out.every(e=>e.members.some(x=>x.event)));
console.log('PASS one digest cannot bridge separate explicit subjects');

const urgent=pay('u','Synthetic Cafe',{state:'needsAction',priority:'urgent',actionLabel:'Dispute charge',thread:'cafe'});
out=group([cafe('c'),urgent,cafe('e')],{now});
assert.deepEqual(ids(out),[['c','e'],['u']]);
out=group([urgent,{...urgent,id:'u2'}],{now});
assert.equal(out.length,1);assert.equal(out[0].priority,'urgent');assert.deepEqual(out[0].actions,['Dispute charge']);
console.log('PASS a separately actionable pressing item stays visible and only exact duplicates fold into it');

const first=group([cafe('c'),cafe('e')],{now})[0];
assert.equal(first.id,group([cafe('e'),cafe('c'),cafe('e')],{now})[0].id);
assert.notEqual(first.id,group([pay('x','Synthetic Cafe')],{now})[0].id,'The same label on another record is another event');
assert.match(first.id,/^event:[0-9a-z]+$/);
assert.ok(!first.id.includes('Cafe'));
const byThread=group([m('a'),m('b',{sources:[{provider:'gmail',id:'msg-a',quote:'x'}]})],{now})[0];
const grown=group([m('z',{sources:[{provider:'gmail',id:'msg-0',quote:'y'},{provider:'gmail',id:'msg-a',quote:'x'}]}),m('a')],{now,previous:[record(byThread)]})[0];
assert.equal(grown.id,byThread.id);
console.log('PASS event IDs are stable across order, duplicates and new evidence and never contain source text');

const saved=[record(first,'dismissed')];
let again=group([cafe('c'),cafe('e'),{...cafe('e'),id:'e-copy'}],{now,previous:saved})[0];
assert.equal(again.status,'dismissed');assert.equal(again.newEvidence,false);assert.equal(again.messageCount,3);
again=group([cafe('c'),cafe('e'),cafe('f')],{now,previous:saved})[0];
assert.equal(again.status,'open');assert.equal(again.newEvidence,true);assert.equal(again.id,first.id);
out=group([cafe('c'),cafe('e'),pay('other','Synthetic Cafe')],{now,previous:saved});
assert.deepEqual(out.map(e=>e.status),['dismissed','open'],'A dismissed incident never settles an unrelated one with the same label');
console.log('PASS a repeated message keeps a dismissed event dismissed; a new message reopens it');

const nap=[record(first,'open',later)];
again=group([cafe('c'),cafe('e'),cafe('f')],{now,previous:nap})[0];
assert.equal(again.snoozedUntil,later);assert.equal(again.newEvidence,true);
again=group([cafe('c'),cafe('e'),cafe('f',{priority:'high'})],{now,previous:nap})[0];
assert.equal(again.snoozedUntil,undefined);
again=group([cafe('c')],{now:Date.parse(later)+1,previous:nap})[0];
assert.equal(again.snoozedUntil,undefined);assert.equal(again.status,'open');
out=group([cafe('c'),cafe('e'),pay('other','Synthetic Cafe')],{now,previous:nap});
assert.deepEqual(out.map(e=>e.snoozedUntil),[later,undefined],'A snooze never hides an unrelated incident with the same label');
console.log('PASS a snooze holds for routine new evidence, breaks for pressing evidence and expires on time');

again=group([cafe('c',{snoozedUntil:later}),cafe('e',{snoozedUntil:later}),{...cafe('e'),id:'e-copy'}],{now})[0];
assert.equal(again.snoozedUntil,later);assert.equal(again.newEvidence,false);
again=group([cafe('c',{status:'dismissed'}),cafe('f')],{now})[0];
assert.equal(again.status,'open');assert.equal(again.newEvidence,true);
again=group([cafe('c',{status:'dismissed'}),cafe('e',{status:'done'})],{now})[0];
assert.equal(again.status,'dismissed');
out=group([pay('c','Synthetic Cafe',{status:'dismissed'}),pay('e','Synthetic Cafe')],{now});
assert.deepEqual(out.map(e=>e.status),['dismissed','open']);
console.log('PASS without a saved record, member state stands in for it with the same inheritance rules');

const {collectMatters}=await import('../ui/attention/matter-activities.ts');
const thread={provider:'gmail',id:'thread-1',quote:'Synthetic thread'};
const page=(id:string,sources:any[],extra={})=>[id,{id,worldItemId:'item-'+id,sourceProvider:'gmail',worldItemKind:'update',worldItemStatus:'open',worldItemSources:sources,worldItemSignal:{},...extra}];
const pages=new Map<string,any>([page('p1',[thread]),page('p2',[thread,{provider:'gmail',id:'thread-2',quote:'Follow-up'}]),page('p3',[{provider:'gmail',id:'thread-3',quote:'Other'}])] as any);
const sections=[{entity:'app',id:'mail-place',moduleId:'gmail',title:'Mail',children:['p1','p2','p3']}];
const signal=(pageId:string,actionLabel:string,state='unseen')=>({id:'activity:'+pageId+':0',pageId,kind:'updates',state,priority:'normal',actionLabel});
const cards=collectMatters({sections,pages,activities:[signal('p1','Read'),signal('p2','Reply','needsAction'),signal('p3','Read')],current:null,currentSpace:null,depth:0,now});
assert.equal(cards.length,2);
const card=cards.find(c=>c.eventId);
assert.equal(card.worldItemId,'item-p2');assert.deepEqual(card.worldItemIds,['item-p2','item-p1']);
assert.equal(card.signalCount,2);assert.equal(card.sourceCount,2);assert.deepEqual(card.actions,['Reply','Read']);
assert.ok(cards.some(c=>c.worldItemId==='item-p3'&&!c.eventId));
console.log('PASS the shared Attention owner shows one card per event and keeps members, sources and actions');
// #915: the later duplicate leads ('-' sorts before ':' in its ID), yet the card keeps the earliest place.
const twins=new Map<string,any>([page('d',[thread]),page('e',[{provider:'gmail',id:'thread-e',quote:'Other'}]),page('d-copy',[thread])] as any);
const placed=collectMatters({sections:[{...sections[0],children:['d','e','d-copy']}],pages:twins,activities:['d','e','d-copy'].map(id=>signal(id,'Read')),current:null,currentSpace:null,depth:0,now});
assert.deepEqual(placed.map(c=>c.worldItemIds||[c.worldItemId]),[['item-d-copy','item-d'],['item-e']],'A duplicate never moves its item behind an equal row');
console.log('PASS a folded card keeps its earliest member\'s place, whichever member leads');

for(const status of ['done','dismissed']){
 const original=m('settled',{status}),duplicate={...m('copy'),sources:original.sources};
 const merged=group([original,duplicate],{now})[0];
 assert.equal(merged.status,status,'A cluster merge retains settlement for repeated old evidence');
 assert.equal(merged.newEvidence,false);
}
console.log('PASS settled members suppress an open duplicate of the same old event');
for(const status of ['done','dismissed']){
 const settledPages=new Map<string,any>([page('p1',[thread],{worldItemStatus:status}),page('p2',[thread])] as any);
 const project=()=>collectMatters({sections,pages:settledPages,activities:[signal('p2','Read')],current:null,currentSpace:null,depth:0,now});
 assert.equal(project().length,0,'UI projection consults settled pages even without their active signals');
 settledPages.get('p2').worldItemSources.push({provider:'gmail',id:'new-message',quote:'New material event'});
 assert.equal(project().length,1,'New source evidence remains independently eligible');
}
console.log('PASS active UI projection retains historical settlement while admitting new evidence');

// #687: the explicit event identity travels extraction → validation → storage → projection → cards.
const {processedAttentionContent}=await import('../core/attention/attention-content.ts');
const {validateWorldItem}=await import('../core/items/world-item-validation.ts');
const {prepareWorldItem}=await import('../core/items/world-item-state.ts');
const {queryWorldItems}=await import('../core/items/world-item-projection.ts');
const {projectWorldItems,refreshItemPage}=await import('../core/items/world-items.ts');
const alert=(id:string,quote:string,event?:any,extra={})=>({id,provider:'gmail',kind:'update',title:'Card payment declined',reason:'Your card may need attention',summary:'A synthetic payment was declined.',
 occurredAt:'2026-01-09T08:00:00Z',sources:[{provider:'gmail',id:'msg-'+id,quote}],...(event?{event}:{}),...extra});
const bank={topic:'Payment declined',subject:'Example Bank card ending 1234'};
const extracted=[
 alert('a','Example Bank: a payment on your card ending 1234 was declined.',bank,{sources:[{provider:'gmail',id:'thread-decline',quote:'Example Bank: a payment on your card ending 1234 was declined.'}]}),
 alert('b','',{topic:'payment declined ',subject:'EXAMPLE BANK card ending 1234'},{occurredAt:'2026-01-09T09:30:00Z',sources:[{provider:'gmail',id:'thread-decline',quote:'Example Bank card ending 1234 declined a second payment.'}]}),
 // Another account with the same issuer and last-4, reported in its own message.
 alert('a2','Example Bank: a payment on your card ending 1234 was declined.',{...bank},{occurredAt:'2026-01-09T10:00:00Z'}),
 alert('c','Sample Credit: your card ending 1234 was declined.',{topic:'Payment declined',subject:'Sample Credit card ending 1234'}),
 alert('d','Example Bank card ending 5678 declined a payment.',{topic:'Payment declined',subject:'Example Bank card ending 5678'}),
 alert('e','A payment on a card was declined.',undefined,{dueAt:'2026-01-12'}),
];
const stored=extracted.map(raw=>{
 const item=processedAttentionContent(raw);
 validateWorldItem(item,{start:null,end:null});
 return JSON.parse(JSON.stringify(prepareWorldItem(item,undefined,raw.id,'identity-'+raw.id,'run',new Date(now).toISOString())));
});
assert.deepEqual(stored[0].event,bank);assert.equal(stored[5].event,undefined);
assert.deepEqual(queryWorldItems(stored,[]).items[0].event,bank);
assert.equal(queryWorldItems(stored,[]).items[5].dueAt,'2026-01-12');
const world:any={roots:['root'],pages:[]};projectWorldItems(world,stored);
for(const p of world.pages)refreshItemPage(p,now);
assert.deepEqual(world.pages[0].worldItemSignal.event,bank);
assert.equal(world.pages[0].worldItemSignal.occurredAt,'2026-01-09T08:00:00Z','#691 time fields keep their meaning beside event');
const storedPages=new Map<string,any>(world.pages.map((p:any)=>[p.id,p]));
const storedSections=[{entity:'app',id:'mail-place',moduleId:'gmail',title:'Mail',children:world.pages.map((p:any)=>p.id)}];
const storedSignals=world.pages.flatMap((p:any)=>p.activities.map((a:any,i:number)=>({...a,id:'activity:'+p.id+':'+i,pageId:p.id,state:'unseen'})));
const storedCards=collectMatters({sections:storedSections,pages:storedPages,activities:storedSignals,current:null,currentSpace:null,depth:0,now});
assert.equal(storedCards.length,5);
const folded=storedCards.find((c:any)=>c.eventId);
assert.deepEqual([...folded.worldItemIds].sort(),['a','b']);
assert.ok(storedCards.filter((c:any)=>!c.eventId).every((c:any)=>c.signalCount===1));
assert.equal(folded.signalCount,2);assert.equal(folded.sourceCount,1);
assert.equal(folded.when.relative,'Multiple source times','#691 a folded card keeps each member time');
const twin=storedCards.find((c:any)=>c.worldItemId==='a2');
assert.ok(twin&&!twin.eventId,'Same issuer and last-4 in another message stays its own card');
assert.equal(storedPages.get(twin.pageId).worldItemSignal.occurredAt,'2026-01-09T10:00:00Z');
// Settling the supported event never settles the other account that shares its label.
storedPages.get(folded.pageId).worldItemStatus='dismissed';
const afterDismiss=collectMatters({sections:storedSections,pages:storedPages,activities:storedSignals.filter((a:any)=>a.pageId!==folded.pageId),current:null,currentSpace:null,depth:0,now});
assert.ok(afterDismiss.some((c:any)=>c.worldItemId==='a2'),'Another account with the same masked label remains visible');
assert.ok(!afterDismiss.some((c:any)=>c.worldItemId==='b'),'The dismissed event still settles its supported member');
console.log('PASS a saved event identity reaches collectMatters: a shared record folds one card; the same issuer and last-4 elsewhere, other issuers, masks and keyless items stay separate');

const rejected=(event:any,quote='Example Bank card ending 1234 declined.')=>{
 const raw=alert('x',quote,event);
 assert.throws(()=>processedAttentionContent(raw),/Attention event .*(omit event|must not contain|single-line|topic, subject)/);
 assert.throws(()=>validateWorldItem({...raw,context:'x'},{start:null,end:null}),/Invalid world item: event\./);
};
for(const event of [{topic:'Payment declined'},{topic:'',subject:'Example Bank'},{topic:'Payment declined',subject:'Example Bank',extra:'x'},'Example Bank',
 {topic:'Payment\ndeclined',subject:'Example Bank'},{topic:'x'.repeat(41),subject:'Example Bank'},{topic:'Payment declined',subject:'Example Bank card 4111 1111 1111 1234'},
 {topic:'Payment declined',subject:'https://bank.example.test/card'},{topic:'Sign-in alert',subject:'ada@example.test'},{topic:'Verification code',subject:'Example Bank'},
 {topic:'Payment declined',subject:'Example Bank card ending 9999'},{topic:'Payment declined',subject:'Other Bank card'},{topic:'Payment declined',subject:'1234'}])rejected(event);
rejected(bank,'Sample Credit: your card ending 1234 was declined.');
const masked=processedAttentionContent(alert('y','New sign-in to a***@example.test at Example Mail.',{topic:'Sign-in alert',subject:'Example Mail a***@example.test'}));
assert.equal((masked.event as any).subject,'Example Mail a***@example.test');
console.log('PASS invalid, unmasked, credential-like or ungrounded event identities are rejected with repair guidance');
