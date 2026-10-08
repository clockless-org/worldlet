// Messages (iMessage on a Mac): the shared rules the host follows for imsg's JSON, then the Applet in the World
// page with a mocked host. Opening it says which permission is missing and checks again on return, conversations
// open as cards, a conversation reads as bubbles with its files, new messages arrive while it is open, and only
// Send sends (once per click), also to a new person. The pinned imsg archive's checksum is checked too.
// Real chat.db reading, the permissions themselves and delivery need a signed-in Mac; this does not claim them.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {messagesConversation,messagesConversationTitle,messagesLine,messagesOutgoingText,messagesRecipient,messagesSendFailure,messagesSnippet,validSentMessageId} from '../core/applets/index.ts';
import {withBrowser,fileAccess,pageErrors,worldUrl} from './browser-test.ts';

const pin=JSON.parse(readFileSync(new URL('../platform/electron/distribution/imsg.json',import.meta.url),'utf8'));
assert.match(pin.sha256,/^[0-9a-f]{64}$/,'imsg is pinned by SHA-256');
assert.equal(pin.source,`https://github.com/openclaw/imsg/releases/download/v${pin.version}/imsg-macos.zip`,'the official release archive');
assert.ok(!pin.files.some((file:string)=>file.includes('bridge-helper')),'the IMCore bridge helper is not shipped');

assert.equal(messagesRecipient(' +1 (415) 555-0100 '),'+14155550100');
assert.equal(messagesRecipient('Alex@Example.com'),'alex@example.com');
for(const bad of ['','12','not a number','+1 415; rm -rf','a@b','x'.repeat(300),42])assert.equal(messagesRecipient(bad),null,String(bad));
assert.equal(messagesOutgoingText('Hi\r\nthere'),'Hi\nthere');
for(const bad of ['   ','\u0007bell','x'.repeat(10_001),null])assert.equal(messagesOutgoingText(bad),null,String(bad));
assert.equal(messagesConversationTitle('Tennis club',['+1'],'chat1'),'Tennis club');
assert.equal(messagesConversationTitle('',['+14155550100'],'+14155550100'),'+14155550100');
assert.equal(messagesConversationTitle(null,['a','b','c','d','e'],'chat9'),'a, b, c +2');
assert.equal(messagesSnippet('Line one\nline two',true),'You: Line one line two');
assert.ok(messagesSnippet('x'.repeat(200),false).endsWith('…'));
// imsg's chat list item: a one-to-one chat takes the Contacts name, a group keeps its own name or its people.
const direct={id:7,guid:'iMessage;-;+14155550100',identifier:'+14155550100',name:'+14155550100',display_name:'',contact_name:'Alex Chen',participants:['+14155550100'],is_group:false,last_message_at:'2026-10-05T20:00:00Z'};
assert.deepEqual(messagesConversation(direct),{guid:'iMessage;-;+14155550100',chat:7,title:'Alex Chen',participants:['+14155550100'],at:Date.parse('2026-10-05T20:00:00Z'),group:false});
assert.equal(messagesConversation({...direct,contact_name:''})?.title,'+14155550100');
assert.equal(messagesConversation({...direct,is_group:true,display_name:'Tennis',contact_name:'Alex Chen',participants:['a','b']})?.title,'Tennis');
assert.equal(messagesConversation({...direct,is_group:true,display_name:'',participants:['a','b']})?.title,'a, b');
for(const bad of [null,{...direct,id:0},{...direct,id:'7'},{...direct,guid:''}])assert.equal(messagesConversation(bad),null);
// imsg's message: text, the sender's Contacts name, files; attachment marks and tapbacks are not words.
const said={id:41,guid:'G1',is_from_me:false,sender:'+14155550100',sender_name:'Alex Chen',text:'Look ￼',created_at:'2026-10-05T20:01:00Z',attachments:[{filename:'~/Library/Messages/Attachments/ab/IMG_1.heic',transfer_name:'IMG_1.heic',mime_type:'image/heic',total_bytes:2048,missing:false}]};
assert.deepEqual(messagesLine(said),{id:'G1',row:41,fromMe:false,sender:'Alex Chen',text:'Look',at:Date.parse('2026-10-05T20:01:00Z'),attachments:[{name:'IMG_1.heic',mime:'image/heic',bytes:2048,missing:false,file:'~/Library/Messages/Attachments/ab/IMG_1.heic'}]});
assert.equal(messagesLine({...said,is_from_me:true})?.sender,'','my own messages have no sender');
assert.equal(messagesLine({...said,text:'￼',attachments:[]}),null,'nothing to show');
assert.equal(messagesLine({...said,is_reaction:true}),null,'a tapback is not a message');
assert.equal(messagesLine({...said,attachments:[{transfer_name:'gone.pdf',missing:true}]})?.attachments[0].missing,true);
// Only a send Messages never started may be sent again without checking Messages.
assert.equal(messagesSendFailure({code:-32603,data:{disposition:'not_started',retry_safe:true,detail:'Messages automation failed with AppleScript error -1743.'}}),'automation');
assert.equal(messagesSendFailure({code:-32603,data:{disposition:'not_started',retry_safe:true,detail:'Messages automation failed with AppleScript error -1728.'}}),'not-sent');
assert.equal(messagesSendFailure({code:-32001,data:{disposition:'may_have_completed',retry_safe:false,detail:'AppleScript error -1743.'}}),'unconfirmed','after dispatch even -1743 is unconfirmed');
assert.equal(messagesSendFailure({code:-32004,data:{disposition:'still_in_flight'}}),'unconfirmed');
assert.equal(messagesSendFailure({code:-32002,data:{retryable:true}}),'full-disk');
assert.equal(messagesSendFailure({code:-32602,data:'unknown chat'}),'not-sent');
assert.equal(messagesSendFailure({code:-1,data:null}),'unconfirmed','imsg ending mid-send is unconfirmed');
assert.ok(validSentMessageId(crypto.randomUUID())&&!validSentMessageId('../x')&&!validSentMessageId(''));

const mac={localDataDeletion:true,curatedSourceRead:true,nativeAppletLaunch:true,nativeCalendar:true,appleNotes:true,appleReminders:true,voiceMemos:true,messages:true,folderManagement:true,backgroundSourceChecks:true,cancellableOrganization:false,deferredBackupRestore:false,cancellableTransferReview:false,browserBookmarks:true,installedAppDetection:true,browserFoxOverlay:true,browserPictureInPicture:true,browserTaskPictureInPicture:false,leadingWindowControls:true,googleSignInStages:true};
await withBrowser(fileAccess,async browser=>{
 const page=await browser.newPage({viewport:{width:1440,height:950},reducedMotion:'reduce'});const errors=pageErrors(page);
 await page.addInitScript(features=>{
  const w=window as any;w.calls=[];w.access='full-disk';w.automation=false;
  const conversations=Array.from({length:6},(_,i)=>({id:'iMessage;-;+1415555010'+i,title:'+1415555010'+i,list:'Message '+i+' · today',modified:1000-i}));
  w.webkit={messageHandlers:{worldlet:{async postMessage(b){w.calls.push(b);
   if(b.action==='snapshot')return {workspaceId:'messages-fixture',hostCapabilities:{version:1,features},sources:[],knowledge:[],connections:[],worldItems:[],onboarding:{completed:true},sampleEnabled:false};
   // Calling through the person's own Agent (ui/companion/fox-call.ts): the host's answer to the Applet's brief.
   if(b.action==='harnessCall'){
    if(b.operation==='prepare')return {ready:true,offer:{id:'call-1',to:b.to,who:b.who||'',behalf:b.behalf,why:b.why,ask:b.ask,from:b.from,opening:''}};
    if(b.operation==='place')return {ok:true,id:'openclaw:w1'};
    return {ok:true};
   }
   if(b.action==='messages'){
    if(b.operation==='permissions')return {awaitingPermission:b.access,appName:'Worldlet Test'};
    if(b.operation==='list')return w.access==='ok'?{connected:true,pages:conversations,scope:'Messages on this Mac'}:{connected:false,pages:[],access:w.access};
    if(b.operation==='thread')return {id:b.id,title:b.id.split(';').pop(),participants:[b.id.split(';').pop()],cursor:42,messages:[{id:'m1',row:41,fromMe:false,sender:'Alex Chen',text:'Are we still on for tennis?',at:Date.now()-60000,attachments:[{name:'court.jpg',mime:'image/jpeg',bytes:2048,missing:false,token:'t1'}]},{id:'m2',row:42,fromMe:true,sender:'',text:'Yes, 7pm.',at:Date.now()-30000,attachments:[]}]};
    // The first wait brings one new message; later waits stay open as the real host's do.
    if(b.operation==='wait'){if(w.arrived||b.after!==42)return new Promise(()=>{});w.arrived=true;await new Promise(r=>setTimeout(r,300));return {cursor:43,messages:[{id:'m3',row:43,fromMe:false,sender:'Alex Chen',text:'Bring the new balls',at:Date.now(),attachments:[]}]};}
    if(b.operation==='attachment')return {shown:true};
    if(b.operation==='send'){if(!w.automation)return {needsAccess:'automation'};return {sent:true,record:{id:b.id,title:b.to||b.chat,text:b.text,status:'sent'}};}
   }
   if(b.action==='foxPreferences')return {model:{ready:true,name:'Fixture'},cloudConsent:false};if(b.action==='modelStatus')return {available:true};if(b.action==='weatherLoad')return null;return {ok:true};
  }}}};
 },mac);
 const calls=(operation:string)=>page.evaluate(op=>(window as any).calls.filter((c:any)=>c.action==='messages'&&c.operation===op),operation);
 await page.goto(worldUrl());
 await page.waitForFunction(()=>!!document.querySelector<HTMLElement>('#notionWorld')?.sceneMetrics);
 await page.evaluate(()=>location.hash='object=app-messages');
 for(let i=0;i<10&&await page.getByRole('button',{name:'Next page'}).isVisible();i++)await page.getByRole('button',{name:'Next page'}).click();
 // Opening Messages without Full Disk Access says so and offers the settings pane.
 await page.getByText(/Worldlet needs Full Disk Access/).waitFor();
 await page.getByRole('button',{name:'Open permission settings',exact:true}).click();
 await page.waitForFunction(()=>(window as any).calls.some((c:any)=>c.operation==='permissions'&&c.access==='full-disk'));
 await page.getByText(/drag the selected Worldlet Test app into Full Disk Access/).waitFor();
 await page.getByRole('button',{name:'Restart Worldlet',exact:true}).waitFor({timeout:5000});
 // Coming back to Worldlet checks again; now the conversations show.
 await page.evaluate(()=>{(window as any).access='ok';window.dispatchEvent(new Event('worldlet:app-active'));});
 // Every conversation shows at once; past the four folios the item area scrolls instead of paging.
 await page.waitForFunction(()=>document.querySelectorAll('.pixi-stage-item').length===6);
 assert.equal(await page.locator('.pixi-open-contents[data-scroll=true]').count(),1);
 assert.equal((await calls('list')).length,2,'returning checks once');
 await page.screenshot({path:'/tmp/worldlet-messages-open.png'});
 // A conversation reads as bubbles; Send needs Automation and keeps the words until it is allowed.
 await page.locator('.pixi-stage-item').first().click();
 await page.getByText('Are we still on for tennis?',{exact:true}).waitFor();
 assert.equal(await page.locator('.messages-bubble[data-from=me]').count(),1);
 await page.getByText('Alex Chen',{exact:false}).first().waitFor();
 // Files show by name and open in Finder only when asked; new messages arrive while the conversation is open.
 await page.getByRole('button',{name:'Show court.jpg in Finder',exact:true}).click();
 await page.waitForFunction(()=>(window as any).calls.some((c:any)=>c.operation==='attachment'&&c.token==='t1'));
 await page.getByText('Bring the new balls',{exact:true}).waitFor();
 assert.deepEqual((await calls('wait')).map((c:any)=>[c.id,c.after]).slice(0,2),[['iMessage;-;+14155550100',42],['iMessage;-;+14155550100',43]],'each wait starts after the last message seen');
 await page.getByRole('textbox',{name:'Message to send',exact:true}).fill('See you there');
 await page.getByRole('button',{name:'Send',exact:true}).click();
 await page.getByText(/Allow Worldlet to use Messages, then press Send again. Nothing was sent./).waitFor();
 await page.getByText(/turn on Messages under Worldlet in Automation/).waitFor();
 assert.equal(await page.getByRole('textbox',{name:'Message to send',exact:true}).inputValue(),'See you there','the words stay');
 await page.evaluate(()=>{(window as any).automation=true;});
 await page.getByRole('textbox',{name:'Message to send',exact:true}).press('Enter');
 await page.getByText('Sent.',{exact:true}).waitFor();
 await page.getByText(/turn on Messages under Worldlet in Automation/).waitFor({state:'detached'});
 assert.equal(await page.getByRole('textbox',{name:'Message to send',exact:true}).inputValue(),'');
 const sends=await calls('send');
 assert.equal(sends.length,2);
 assert.deepEqual(sends.map((c:any)=>[c.chat,c.text]),[['iMessage;-;+14155550100','See you there'],['iMessage;-;+14155550100','See you there']]);
 assert.notEqual(sends[0].id,sends[1].id,'each Send click is its own send');
 await page.screenshot({path:'/tmp/worldlet-messages-focus.png'});
 // One person at a phone number: Fox offers Call. Its card fills in why from the conversation; only its Call dials, and
 // the call then shows live (status, transcript, Hang up) as the host reports it.
 await page.locator('[data-action-id="messages:call"], button:has-text("Call")').first().click();
 await page.getByText('Call +14155550100?',{exact:true}).waitFor();
 const prepare=await page.evaluate(()=>(window as any).calls.find((c:any)=>c.action==='harnessCall'&&c.operation==='prepare'));
 assert.deepEqual([prepare.to,prepare.why,prepare.from],['+14155550100','about your message “Are we still on for tennis?”','Messages']);
 await page.getByRole('textbox',{name:'What to find out',exact:true}).fill('Which court are we on?');
 await page.getByText('It opens with: “Hi, this is an AI assistant calling for the person you’ve been messaging, about your message “Are we still on for tennis?”. Which court are we on?”',{exact:true}).waitFor();
 assert.equal(await page.evaluate(()=>(window as any).calls.some((c:any)=>c.operation==='place')),false,'nothing dials before Call');
 await page.screenshot({path:'/tmp/worldlet-messages-call-confirm.png'});
 await page.locator('.fox-call').locator('xpath=ancestor::*[.//button[normalize-space()="Cancel"]][1]').getByRole('button',{name:'Call',exact:true}).click();
 await page.waitForFunction(()=>(window as any).calls.some((c:any)=>c.operation==='place'&&c.id==='call-1'&&c.ask==='Which court are we on?'));
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('worldlet:harness-call',{detail:{placed:true,who:'',call:{id:'openclaw:w1',direction:'outbound',peer:'+14155550100',startedAt:Date.now(),answeredAt:Date.now(),outcome:'in-progress',live:'talking',transcript:[{speaker:'agent',text:'Hi, this is an AI assistant.',at:1},{speaker:'peer',text:'Court three.',at:2}]}}})));
 await page.getByText(/^On the call with \+14155550100 · 0:0\d$/).waitFor();
 await page.getByText('+14155550100: Court three.',{exact:true}).waitFor();
 await page.screenshot({path:'/tmp/worldlet-messages-call.png'});
 await page.getByRole('button',{name:'Hang up',exact:true}).click();
 await page.waitForFunction(()=>(window as any).calls.some((c:any)=>c.operation==='hangUp'&&c.id==='openclaw:w1'));
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('worldlet:harness-call',{detail:{placed:true,who:'',call:{id:'openclaw:w1',direction:'outbound',peer:'+14155550100',startedAt:Date.now()-65_000,answeredAt:Date.now()-65_000,endedAt:Date.now(),outcome:'completed',transcript:[{speaker:'peer',text:'Court three.',at:2}]}}})));
 await page.getByText('The call to +14155550100 is done (1 min). Last thing they said: “Court three.”',{exact:true}).waitFor();
 await page.screenshot({path:'/tmp/worldlet-messages-call-done.png'});
 // A new message goes to a phone number or email the person types.
 await page.locator('#notionBack').click();
 await page.waitForFunction(()=>document.querySelectorAll('.pixi-stage-item').length===6);
 await page.getByRole('button',{name:'New message',exact:true}).click();
 await page.getByRole('textbox',{name:'To',exact:true}).fill('alex@example.com');
 await page.getByRole('textbox',{name:'Message to send',exact:true}).fill('Hello from my world');
 await page.getByRole('button',{name:'Send',exact:true}).click();
 await page.getByText('Sent to alex@example.com.',{exact:true}).waitFor();
 const last=(await calls('send')).at(-1);
 assert.equal(last.to,'alex@example.com');assert.equal(last.text,'Hello from my world');assert.equal(last.chat,undefined);
 assert.equal(await page.evaluate(()=>(window as any).calls.some((c:any)=>['agentChat','hermesChat','browserShow'].includes(c.action))),false,'reading and sending never go through Fox or a browser');
 assert.deepEqual(errors,[]);
 console.log('PASS Messages: the pinned imsg, shared rules for its JSON and send dispositions, the Full Disk Access prompt and retry, conversation cards, bubbles with names and files, live messages, the Automation prompt before sending, one send per click, Call through the person’s Agent (a brief to confirm, then the call live) and a new message.');
});
