import assert from 'node:assert/strict';
import {PUSH_BOX_PLACE,PHONE_PUSH_LIMITS,PHONE_DESKTOP_ONLY,phonePush,phoneAttentionPushes,phoneFoxPush,phoneApprovalPush,newPairSecret,boxPlace,openBox,pairKeys,pairLink,readPairLink,sealBox,phoneAttention,phoneConversation,phoneDesktop,phoneLive,readPhoneMessage,phoneActionStatus,phoneApplets,phoneWebAddress,phoneMessageKey,stalePhoneMessage} from '../platform/web/index.ts';
import {phoneWebRecording} from '../platform/host/modules/windows/web.ts';
import {APP_DEFINITIONS} from '../context/applets/catalog.ts';

// What the computer sends the phone and takes from it (platform/web/README.md), without a relay: the pairing link and key
// derivation the iPhone app shares (its Pairing.swift), the sealed boxes, the slot payloads, the phone's messages, the
// websites the phone opens, and what is worth a push. How they travel (the pairing room) is phone-room-check.ts.

// Link and key derivation are deterministic, so the iPhone derives the same id, tokens and key (Swift test vector).
const fixed=Uint8Array.from({length:32},(_,i)=>i);
const vector=await pairKeys(fixed);
assert.equal(vector.id,'5gImJiJSofcAENRFNwk-eA');assert.equal(vector.phoneToken,'AxApQGVeSQppVpdqVBI_Y7_jBE8oBguIZSryG-bwe4I');
assert.equal(vector.desktopToken.length,43);assert.notEqual(vector.desktopToken,vector.phoneToken);
const link=pairLink({secret:fixed,name:'Alex’s Mac'});
assert.match(link,/^worldlet:\/\/pair\?v=1&s=AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8&n=/);
assert.deepEqual(readPairLink(link),{secret:fixed,relay:'https://worldlet.ai',name:'Alex’s Mac'});
assert.equal(readPairLink(pairLink({secret:fixed,name:'x',relay:'http://127.0.0.1:8787'})).relay,'http://127.0.0.1:8787');
for(const bad of ['https://worldlet.ai','worldlet://pair?v=2&s=AAEC','worldlet://pair?v=1&s=AAEC','worldlet://pair?v=1&s=AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8&r=http://evil.example'])assert.throws(()=>readPairLink(bad));
// A box opens only with its key, pairing and place.
const box=await sealBox(vector,boxPlace('slot','attention'),{hello:'world'});
assert.deepEqual(await openBox(vector,boxPlace('slot','attention'),box),{hello:'world'});
await assert.rejects(openBox(vector,boxPlace('slot','conversation'),box),'a box moved to another slot does not open');
await assert.rejects(openBox(await pairKeys(new Uint8Array(32).fill(9)),boxPlace('slot','attention'),box),'another pairing cannot open it');
// A message sealed for the other direction is dropped, not executed: it does not open as one to the desktop.
await assert.rejects(openBox(vector,boxPlace('to','desktop'),await sealBox(vector,boxPlace('to','phone'),{type:'chat',id:'c2',text:'moved'})));
console.log('PASS pairing link, HKDF derivation vector and AES-GCM boxes bound to pairing and place.');

// The desktop slots: Attention, Fox's conversation and Fox's streaming turn.
const matter={id:'m1',worldItemId:'item-1',worldItemIds:['item-1','item-2'],state:'needsAction',title:'Mail',actionTitle:'Reply',fullAction:'Reply to Ada',fullContext:'She asked for the plan by Friday',when:{clock:'9:30 AM',relative:'in 47m'},signals:[{start:'2026-10-03T16:30:00Z'}],level:4};
const attention:any=phoneAttention({now:[matter,{id:'bad',state:'weird'}],later:[{...matter,worldItemId:'item-3',worldItemIds:undefined,state:'unseen',snoozed:true,level:9}]},Date.parse('2026-10-03T16:00:00Z'));
assert.deepEqual(attention.now,[{id:'item-1',ids:['item-1','item-2'],group:'needsAction',title:'Mail',action:'Reply to Ada',context:'She asked for the plan by Friday',start:'2026-10-03T16:30:00.000Z',when:'9:30 AM · in 47m',level:4,snoozed:false}]);
assert.deepEqual(attention.later.map((i:any)=>[i.id,i.ids,i.group,i.level,i.snoozed]),[['item-3',['item-3'],'unseen',5,true]]);
// The card's brief, the row's time line and the source travel when the desktop has them, and only then.
const briefed=phoneAttention({now:[{...matter,when:{clock:'9:30 AM',relative:'in 47m',factor:'Due tomorrow · 5:00 PM'},summary:'Ada needs **the plan** by Friday.',sources:[{provider:'gmail'}],art:'scene-tennis'}],later:[{...matter,art:'../x'}]},0);
assert.deepEqual([briefed.now[0].fact,briefed.now[0].summary,briefed.now[0].source,briefed.now[0].art],['Due tomorrow · 5:00 PM','Ada needs **the plan** by Friday.','gmail','scene-tennis']);
assert.equal(briefed.later[0].art,undefined,'only a picture name travels');
// Fox's dialogue on the item's card travels with the item: its line, its option and the item's latest turns.
const talked=phoneAttention({now:[{...matter,fox:{say:'Want me to help with the next step?',option:'Help me do it',turns:[{user:'Draft it',text:'',status:'working',step:'Reading the thread…',at:0},{user:'',text:'',status:'done'}]}}],later:[matter]},0);
assert.deepEqual(talked.now[0].fox,{say:'Want me to help with the next step?',option:'Help me do it',turns:[{user:'Draft it',text:'Reading the thread…',working:true,at:'1970-01-01T00:00:00.000Z'}]});
assert.equal(talked.later[0].fox,undefined,'an item without a dialogue sends none');
assert.deepEqual(readPhoneMessage({type:'chat',id:'c',text:'Hi',item:'item-1'}),{type:'chat',id:'c',text:'Hi',item:'item-1'});
assert.deepEqual(readPhoneMessage({type:'option',id:'o',item:'item-1'}),{type:'option',id:'o',item:'item-1'});
assert.equal(readPhoneMessage({type:'option',id:'o'}),null,'an option names its item');
// The conversation slot carries the latest session's user and Fox lines, not tool turns.
const turns=[{id:'a',session:'old',role:'user',text:'old session',createdAt:'2026-10-03T08:00:00Z'},{id:'b',session:'s',role:'user',text:'What is next?',createdAt:'2026-10-03T09:00:00Z'},{id:'c',session:'s',role:'assistant',text:'Reply to Ada.',createdAt:'2026-10-03T09:00:05Z'},{id:'d',session:'s',role:'tool',text:'x',createdAt:'2026-10-03T09:00:06Z'}];
const conversation:any=phoneConversation({turns,busy:false,name:'Fox'},Date.now());
assert.deepEqual(conversation.messages.map((m:any)=>[m.role,m.text]),[['user','What is next?'],['fox','Reply to Ada.']]);
// Fox's streaming turn rides its own slot: the item it was asked about, its latest steps and the reply so far.
const live:any=phoneLive({id:'turn:1',key:'attention:item-1',user:'Draft it',steps:['a','b','c','d','e','f','g'],text:'Dear Ada, ',done:false},Date.now());
assert.deepEqual([live.id,live.item,live.user,live.steps,live.text,live.done],['turn:1','item-1','Draft it',['b','c','d','e','f','g'],'Dear Ada,',false]);
assert.equal(phoneLive({id:'turn:2',key:'world',user:'',steps:[],text:'Hi',done:true},Date.now())?.item,undefined,'a main-conversation turn names no item');
assert.equal(phoneLive({key:'world'},Date.now()),null,'a turn without an id is not sent');
console.log('PASS desktop slots: Attention, Fox’s conversation and Fox’s streaming turn.');

// The phone's messages are validated: unknown kinds are dropped, text is trimmed.
assert.deepEqual(readPhoneMessage({type:'chat',id:'c1',text:' Hi Fox '}),{type:'chat',id:'c1',text:'Hi Fox'});
assert.equal(readPhoneMessage({type:'run',id:'x',command:'rm -rf'}),null);
assert.deepEqual(readPhoneMessage({type:'attention',id:'item-1',action:'done'}),{type:'attention',id:'item-1',action:'done'});
// Replay: a sealed box can be queued again, also after the desktop restarts. The desktop remembers each delivery by its
// key (phoneMessageKey), and refuses a message sealed more than a week ago.
{
 const sealed=(value:unknown)=>sealBox(vector,boxPlace('to','desktop'),value);
 const done=await sealed({type:'attention',id:'item-1',action:'done'}),later=await sealed({type:'attention',id:'item-1',action:'later'});
 assert.notEqual(await phoneMessageKey({type:'attention',id:'item-1'},done),await phoneMessageKey({type:'attention',id:'item-1'},later),'another action on an item already acted on is a new message');
 assert.equal(await phoneMessageKey({type:'attention',id:'item-1'},later),await phoneMessageKey({type:'attention',id:'item-1'},later),'only an exact replay repeats');
 const once=await sealed({type:'chat',id:'c4',text:'Once'}),again=await sealed({type:'chat',id:'c4',text:'Once'});
 assert.notEqual(once,again);assert.equal(await phoneMessageKey({type:'chat',id:'c4'},once),await phoneMessageKey({type:'chat',id:'c4'},again),'a phone’s retry of one message (sealed again) is taken once');
 assert.equal(stalePhoneMessage({type:'chat',id:'c5',text:'Old',at:new Date(Date.now()-8*86400_000).toISOString()},Date.now()),true,'a message sealed more than a week ago is refused');
 assert.equal(stalePhoneMessage({type:'chat',id:'c6',text:'New',at:new Date().toISOString()},Date.now()),false);
 assert.equal(stalePhoneMessage({at:Math.floor(Date.now()/1000)-8*86400},Date.now()),true,'epoch seconds');
 assert.equal(stalePhoneMessage({type:'chat'},Date.now()),false,'phones that send no time are still taken');
}
assert.equal(readPhoneMessage({type:'chat',id:'c',text:'   '}),null);
assert.deepEqual(readPhoneMessage({type:'connect',id:'k',provider:'gmail'}),{type:'connect',id:'k',provider:'gmail'});
assert.equal(readPhoneMessage({type:'connect',id:'k'}),null);
// Order (owner request 2026-10-06, retired 2026-10-18): an older phone's Order button still sends what was said, never a
// chat line, and the computer drops it; the desktop slot never says `order` now, so the phone apps hide the button.
assert.deepEqual(readPhoneMessage({type:'order',id:'r',said:' Fix the Mail lamp '}),{type:'order',id:'r',said:'Fix the Mail lamp'});
assert.equal((readPhoneMessage({type:'order',id:'r',said:'x'.repeat(5000)}) as any).said.length,4000,'clipped like a chat line');
assert.equal(readPhoneMessage({type:'order',id:'r',said:'  '}),null);
assert.equal(readPhoneMessage({type:'order',id:'r',text:'Fix it'}),null,'an Order carries `said`');
assert.equal(readPhoneMessage({type:'order',said:'Fix it'}),null);
// Websites the phone opens in its own browser (owner request 2026-10-07): the observer's reports come back with the
// phone's time and are kept in the World by the computer's own recording rules.
{
 const now=1791090000,sent={type:'web',id:'w',applet:'youtube',records:[
  {at:now-30,kind:'page',url:'https://m.youtube.com/watch?v=abc',title:'Lo-fi'},
  {at:now-20,kind:'text',url:'https://m.youtube.com/watch?v=abc',text:'Lo-fi beats to relax to'},
  {at:now-10,kind:'input',url:'https://m.youtube.com/results',field:'Search',value:'jazz piano'},
  {at:now-9,kind:'input',url:'https://m.youtube.com/results',field:'Password',value:'hunter2'},
  {at:now-8,kind:'click',url:'https://m.youtube.com/results',label:'Jazz piano live',href:'https://m.youtube.com/watch?v=x&token=abc'},
  {at:now-7,kind:'private',url:'https://m.youtube.com/signin'},{at:now-6,kind:'text',url:'https://m.youtube.com/signin',text:'Enter your password'},
  {at:now-5,kind:'page',url:'https://accounts.google.com/'},{at:now-4,kind:'text',url:'https://accounts.google.com/',text:'Sign in'},
  {at:now-3,kind:'shell',url:'https://m.youtube.com/'},{at:now-2,kind:'text',url:'http://m.youtube.com/',text:'plain'},{at:now-1,kind:'text',text:'no address'}]};
 const message=readPhoneMessage(sent)!;
 assert.equal(message.type,'web');
 assert.equal((message as any).records.length,9,'only the observer\'s shapes on https pages');
 assert.equal(readPhoneMessage({...sent,applet:'../x'}),null);
 assert.equal(readPhoneMessage({...sent,records:[]}),null);
 assert.equal((readPhoneMessage({...sent,records:Array.from({length:400},(_,i)=>({at:now,kind:'click',url:'https://x.com/',label:String(i)}))}) as any).records.length,300);
 assert.equal((readPhoneMessage({...sent,records:[{at:now,kind:'text',url:'https://x.com/',text:'a'.repeat(200000)}]}) as any).records[0].text.length,100000);
 const kept:{visits:any[],records:any[]}={visits:[],records:[]};
 const web=phoneWebRecording((visits,records)=>{kept.visits.push(...visits);kept.records.push(...records);},{now:()=>now});
 web.record(message as any);
 assert.deepEqual([...new Set(kept.visits.map(v=>v.applet))],['phone:youtube'],'its visits say they came from the phone');
 assert.equal(kept.visits[0].site,'m.youtube.com');
 assert.deepEqual(kept.records.map(r=>[r.kind,r.body]),[['page',''],['text','Lo-fi beats to relax to'],['input','jazz piano'],['click','Jazz piano live']],
  'no password field, nothing on a page that showed a password field or on a sign-in host');
 assert.equal(kept.records[0].at,now-30,'at the phone\'s time');
 assert.ok(!JSON.stringify(kept.records).includes('token=abc'),'secret query values are dropped');
 web.record({type:'web',id:'w2',applet:'youtube',records:[{at:now+3600,kind:'click',url:'https://m.youtube.com/',label:'Later'},{at:1,kind:'click',url:'https://m.youtube.com/',label:'Long ago'}]});
 assert.deepEqual(kept.records.slice(-2).map(r=>r.at),[now-7*86400,now],'within the past week, never ahead of now');
}
assert.deepEqual(phoneDesktop({name:'Studio',version:'1.2'},0),{v:1,at:'1970-01-01T00:00:00.000Z',name:'Studio',version:'1.2',push:true,room:true});
assert.ok(!('order' in phoneDesktop({name:'Studio',version:'1.2',order:true} as any,0)),'Orders are retired: the desktop slot never says `order`');
// The Applet world (owner decision 2026-10-03): each item names its home Applet. Only Applets that open on the phone
// go there (owner request 2026-10-07): the person's own first, then the rest, working or holding Now items first.
{
 const site='https://example.com/';
 const world={places:[{key:'gmail',title:'Mail',provider:'gmail',state:'ready',label:'Connected',source:true,url:'https://mail.google.com/mail/u/0/'},{key:'youtube',title:'YouTube',state:'ready',label:'Website',url:'https://www.youtube.com/'},
  {key:'google-calendar',title:'Calendar',provider:'google-calendar',state:'ready',source:true,url:'https://calendar.google.com/'},{key:'notion',title:'Notion',state:'off',source:true,url:'https://www.notion.so/'},
  {key:'apple-notes',title:'Notes',provider:'apple-notes',state:'ready'},{key:'plain',title:'Plain',state:'ready',url:'http://example.com/'},{key:'Bad Key',title:'x',url:site},{key:'gmail',title:'Twice',url:site}],
  now:[{applet:'youtube',text:'YouTube is working on a task…'}],log:[{at:1791090000,text:'Read 3 emails',applet:'gmail'},{at:1791090001,text:'Opened Wordle',site:'x'} as any],
  widgets:[{id:'wgt-abcdefghij',title:'Getty guide'},{id:'bad',title:'x'}],thread:(key:string)=>key==='gmail'?[{user:'Any replies?',text:'Two.',status:'done',at:0}]:[]};
 const value=phoneAttention({now:[{...matter,provider:'gmail'}],later:[{...matter,worldItemId:'item-9',provider:'weather'}],world},0);
 assert.equal(value.now[0].applet,'gmail','an item links to the Applet that reads its provider');
 assert.equal(value.later[0].applet,undefined,'an item whose Applet is not in the World has no link');
 assert.equal(phoneAttention({now:[{...matter,provider:'apple-notes'}],later:[],world},0).now[0].applet,undefined,'nor one whose Applet stays on the computer');
 assert.equal(value.applets!.find(a=>a.key==='youtube')?.url,'https://www.youtube.com/','a tile opens its website');
 assert.ok(!value.applets!.some(a=>a.key==='apple-notes'||a.key==='plain'),'an Applet with no https website stays on the computer');
 assert.deepEqual(value.applets!.map(a=>[a.key,a.section,a.state]),[['widget:wgt-abcdefghij','live','ready'],['youtube','live','busy'],['gmail','live','ready'],['google-calendar','accounts','ready'],['notion','places','off']]);
 assert.equal(value.applets![1].line,'YouTube is working on a task…');
 assert.deepEqual(value.applets![2].recent,[{text:'Read 3 emails',at:'2026-10-04T05:00:00.000Z'}]);
 assert.equal(value.applets![2].fox?.turns[0].text,'Two.','an Applet carries its own thread');
 assert.equal(value.applets![0].widget,'wgt-abcdefghij');
 // The person's own Applets say where they came from, so their tiles carry the same mark as their devices.
 assert.deepEqual(value.applets!.map(a=>a.mine),['page',undefined,undefined,undefined,undefined]);
 assert.deepEqual(phoneApplets({places:[{key:'site-0123456789ab',title:'tldraw',state:'ready',mine:'site'}]}),[],'a place without a website is left out');
 assert.deepEqual(phoneApplets({places:[{key:'youtube',title:'YouTube',state:'busy',url:'https://www.youtube.com/'},{key:'site-0123456789ab',title:'tldraw',state:'ready',mine:'site',url:'https://www.tldraw.com/'},{key:'gmail',title:'Mail',mine:'page',url:'https://mail.google.com/'}],
  widgets:[{id:'wgt-abcdefghij',title:'Getty guide'}],jobs:[{id:'job-0123456789ab',title:'Move',line:'',recent:[]}]}).map(a=>[a.key,a.mine]),
  [['widget:wgt-abcdefghij','page'],['site-0123456789ab','site'],['job-0123456789ab','conversation'],['youtube',undefined],['gmail',undefined]],'their own come first, even before a working one; only a website place is one of their own');
 // What works on the phone, from the catalog (platform/web phoneApplets).
 const apps=APP_DEFINITIONS as any[],phone=(key:string)=>phoneWebAddress(apps.find(a=>a.key===key));
 assert.equal(phone('youtube'),'https://www.youtube.com/');
 assert.equal(phone('gmail'),'https://mail.google.com/mail/u/0/','a scene Applet opens its original website');
 assert.equal(phone('notion'),'https://www.notion.so/','not its sign-in page');
 assert.equal(phone('google-calendar'),'https://calendar.google.com/');
 for(const key of ['apple-notes','messages','codex','meetings','snake','whatsapp','discord','google-docs','browser'])assert.equal(phone(key),undefined,key+' stays on the computer');
 for(const key of PHONE_DESKTOP_ONLY)assert.ok(apps.some(a=>a.key===key),key+' is a catalog Applet');
 assert.equal(phoneWebAddress({key:'site-0123456789ab',mine:'site',fullView:{kind:'web',url:'https://www.tldraw.com/'}}),'https://www.tldraw.com/','their own website always goes');
 assert.equal(phoneWebAddress({key:'wgt-abcdefghij',mine:'page',fullView:{kind:'web',url:'https://x.com/'}}),undefined);
 assert.equal(phoneAttention({now:[matter],later:[]},0).applets,undefined,'no world, no Applets: an older shape');
 assert.equal(phoneApplets({places:Array.from({length:80},(_,i)=>({key:'a'+i,title:'A',url:site}))}).length,48);
 assert.deepEqual(readPhoneMessage({type:'chat',id:'c',text:'Hi',applet:'gmail'}),{type:'chat',id:'c',text:'Hi',applet:'gmail'});
 assert.deepEqual(readPhoneMessage({type:'chat',id:'c',text:'Hi',applet:'../x'}),{type:'chat',id:'c',text:'Hi'});
 assert.deepEqual(readPhoneMessage({type:'applet',id:'o',applet:'gmail',action:'open'}),{type:'applet',id:'o',applet:'gmail',action:'open'});
 assert.equal(readPhoneMessage({type:'applet',id:'o',applet:'gmail',action:'delete'}),null);
 assert.equal(phoneLive({id:'t',key:'object:app-gmail',user:'Any news?',steps:[],text:'',done:false},0)?.applet,'gmail','a turn asked inside an Applet names it');
}
assert.deepEqual(phoneAttention({now:[],later:[],accounts:[{provider:'gmail',title:'Mail',action:'reconnect',run(){}},{provider:'x',action:'login'}]},0).accounts,[{provider:'gmail',title:'Mail',action:'reconnect'}]);
assert.deepEqual(phoneActionStatus('done','update'),{status:'read',later:false});
assert.deepEqual(phoneActionStatus('done','task'),{status:'done',later:false});
assert.deepEqual(phoneActionStatus('later','event'),{status:'open',later:true});
assert.deepEqual(phoneActionStatus('remove','task'),{status:'dismissed',later:false});
console.log('PASS phone messages are validated, replays and stale messages are known, web records are kept by the recording rules, and Applets go to the phone.');

// Push notifications (platform/web/README.md#push): the computer seals the push whole; only the phone opens it.
{
 const push=phonePush({kind:'attention',title:'  Reply to\nAda  ',body:'She asked for the plan by Friday',open:{item:'item-1'},extra:'dropped'},1791090000000,'p1')!;
 assert.deepEqual(push,{v:1,id:'p1',at:1791090000000,kind:'attention',title:'Reply to Ada',body:'She asked for the plan by Friday',open:{item:'item-1'}});
 const sealed=await sealBox(vector,PUSH_BOX_PLACE,push);
 assert.deepEqual(await openBox(vector,PUSH_BOX_PLACE,sealed),push,'only the phone opens what the computer sealed');
 await assert.rejects(openBox(vector,boxPlace('slot','attention'),sealed),'a push box is bound to its place');
}
// What is worth a push, decided in core (payloads.ts): new Coming Up and Worth Doing items, not Worth Knowing, and none
// on the first snapshot; at most three, the rest in one.
{
 const row=(id:string,state:string,extra:any={})=>({...matter,worldItemId:id,worldItemIds:undefined,state,title:'T '+id,fullContext:'Why '+id,...extra});
 const snap=(now:any[],later:any[]=[])=>phoneAttention({now,later},0);
 const before=snap([row('a','needsAction'),row('k','unseen')],[row('s','needsAction',{snoozed:true}),row('o','event')]);
 assert.deepEqual(phoneAttentionPushes(undefined,before),[],'nothing on the first snapshot');
 assert.deepEqual(phoneAttentionPushes(before,before),[]);
 const after=snap([row('a','needsAction'),row('n','event'),row('w','unseen'),row('s','needsAction'),row('o','event'),row('g','needsAction',{worldItemIds:['g','a']})]);
 assert.deepEqual(phoneAttentionPushes(before,after),[
  {kind:'attention',title:'T n',body:'Why n',open:{item:'n'},act:{attention:'n'},collapse:'n'},
  {kind:'attention',title:'T s',body:'Why s',open:{item:'s'},act:{attention:'s'},collapse:'s'}],
  'new in Now, or back from Later; not Worth Knowing, not one already in Later, not a group holding a known item');
 const many=snap(['1','2','3','4','5'].map(id=>row('x'+id,'event')));
 const pushes=phoneAttentionPushes(snap([]),many);
 assert.deepEqual(pushes.map(p=>[p.title,p.open,p.collapse]),[['T x1',{item:'x1'},'x1'],['T x2',{item:'x2'},'x2'],['T x3',{item:'x3'},'x3'],['And 2 more',{},'attention-more']]);
 assert.equal(pushes[3].body,'T x4 · T x5');assert.ok(!('act' in pushes[3]),'"And N more" has no Done or Later');
 assert.equal(PHONE_PUSH_LIMITS.perCall,3);
 assert.equal(phonePush({kind:'attention',title:'x'.repeat(200),body:'y'.repeat(900),open:{}})!.title.length,80);
 assert.equal(phonePush({kind:'attention',title:'x',body:'y'.repeat(900),open:{}})!.body.length,240);
 assert.equal(phonePush({kind:'spam',title:'x'}),null);assert.equal(phonePush({kind:'fox',title:'  '}),null);
 assert.deepEqual(phonePush({kind:'routine',title:'Morning brief',open:{applet:'../x',conversation:true}},5,'r')!.open,{conversation:true},'a bad Applet key is dropped');
 assert.ok(phonePush({kind:'task',title:'Done'})!.id.length>=16,'a fresh id');
 assert.deepEqual(phoneFoxPush({name:'Fox',text:'Dear Ada,\n\nHere is the plan.',item:'item-1'}),{kind:'fox',title:'Fox',body:'Dear Ada, Here is the plan.',open:{item:'item-1'},act:{reply:true},collapse:'fox'});
 assert.deepEqual(phoneFoxPush({name:'Kit',text:'Done.',applet:'gmail'})!.open,{applet:'gmail'});
 assert.deepEqual(phoneFoxPush({name:'',text:'Done.'})!.open,{conversation:true});
 assert.equal(phoneFoxPush({name:'Fox',text:'  '}),null);
 // The notification's own buttons (platform/web/README.md Push › Actions): one action set, known shapes only.
 assert.deepEqual(phonePush({kind:'attention',title:'x',open:{item:'i1'},act:{attention:' i1 ',reply:true}},5,'a')!.act,{attention:'i1'},'one set, the first that fits');
 assert.deepEqual(phonePush({kind:'fox',title:'x',act:{reply:true}},5,'f')!.act,{reply:true});
 assert.deepEqual(phonePush({kind:'fox',title:'x',act:{approval:'req-1',once:true}},5,'q')!.act,{approval:'req-1',once:true});
 assert.deepEqual(phonePush({kind:'fox',title:'x',act:{approval:'req-1',once:'yes'}},5,'q')!.act,{approval:'req-1'},'Allow once only when offered');
 for(const act of [undefined,{},{reply:'yes'},{attention:'  '},{run:'rm -rf'}])assert.ok(!('act' in phonePush({kind:'fox',title:'x',act},5,'n')!),'no buttons from '+JSON.stringify(act));
 const asks=phoneApprovalPush({id:'exec-7',title:'Run a command',detail:'rm -rf\n./build',choices:['once','always','deny']})!;
 assert.deepEqual(asks,{kind:'fox',title:'Run a command',body:'rm -rf ./build',open:{conversation:true},act:{approval:'exec-7',once:true},collapse:'approval-exec-7'});
 assert.deepEqual(phoneApprovalPush({id:'exec-8',title:'Run',choices:['deny']})!.act,{approval:'exec-8'},'Deny alone when Allow once is not offered');
 assert.equal(phoneApprovalPush({id:'',title:'Run'}),null);assert.equal(phoneApprovalPush({id:'x',title:' '}),null);
 // Each button sends a message the computer takes, the same as the app's own buttons.
 for(const message of [{type:'attention',id:'i1',action:'done'},{type:'attention',id:'i1',action:'later'},{type:'chat',id:'r1',text:'Send it',item:'i1'},
  {type:'chat',id:'r2',text:'Thanks',applet:'gmail'},{type:'chat',id:'r3',text:'Thanks'},{type:'approval',id:'a1',approval:'exec-7',choice:'once'},{type:'approval',id:'a2',approval:'exec-7',choice:'deny'}])
  assert.deepEqual(readPhoneMessage(message),message);
 const sealed=await sealBox(await pairKeys(newPairSecret()),PUSH_BOX_PLACE,phonePush({...phoneApprovalPush({id:'x'.repeat(200),title:'t'.repeat(200),detail:'d'.repeat(900),choices:['once']}),id:'y'.repeat(100)},Date.now()));
 assert.ok(sealed.length<PHONE_PUSH_LIMITS.box,'the longest push with its buttons still fits one sealed box');
}
console.log('PASS push: sealed for the phone alone, and what is worth a push, its limits and its buttons.');
