// The companion panel's Phone page and the World page's half of phone pairing (platform/web/README.md): pairing by QR
// code, the paired state, the Center sent to the host, and a phone chat line reaching Fox as the person's message.
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {pageErrors,worldUrl,openCompanionPanel,waitForWorld} from './browser-test.ts';
const browser=await chromium.launch({args:['--allow-file-access-from-files']});
try{
 const page=await browser.newPage({viewport:{width:1280,height:850},reducedMotion:'reduce'}),errors=pageErrors(page);
 await page.addInitScript(()=>{const w=window as any;w.calls=[];w.pairing={state:'none'};w.agentPairing={state:'none'};w.webPairing={state:'none'};w.localPairing={state:'none'};w.worldPairing={state:'none'};Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async(text:string)=>{w.copied=text;}}});
  w.webkit={messageHandlers:{worldlet:{async postMessage(b){w.calls.push(b);
  if(b.action==='snapshot')return {workspaceId:'phone-fixture',revision:0,sources:[],knowledge:[],worldItems:[],connections:[],onboarding:{completed:true},sampleEnabled:false,cloudConsent:true};
  if(b.action==='modelStatus')return {available:true,cloudAllowed:true};
  if(b.action==='phonePair'&&b.kind==='web'){const link='https://worldlet.ai/open/#v=1&s=AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8&n=Studio+Mac';if(b.operation==='start')w.webPairing={state:'waiting',link};if(b.operation==='end'){w.webPairing={state:'none'};w.worldPairing={state:'none'};}if(b.operation==='background')w.webPairing={state:'paired',link,phone:{name:'Chrome on Mac',version:'web'},seenAt:Date.now()};return w.webPairing;}
  if(b.action==='phonePair'&&b.kind==='local'){const link='http://127.0.0.1:47630/open/#v=1&s=AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8&n=Studio+Mac';if(b.operation==='start')w.localPairing={state:'waiting',link};if(b.operation==='end')w.localPairing={state:'none'};if(b.operation==='background')w.localPairing={state:'paired',link,phone:{name:'Chrome on Mac',version:'web'},seenAt:Date.now()};return w.localPairing;}
  if(b.action==='phonePair'&&b.kind==='world'){if(b.operation==='open'&&w.worldPairing.state==='none')w.worldPairing={state:'waiting',link:'https://worldlet.ai/world/2026.1015.1/#v=1&s=AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8&n=Studio+Mac&m=room'};return w.worldPairing;}
  if(b.action==='phonePair'&&b.kind==='agent'){if(b.operation==='start')w.agentPairing={state:'waiting',link:'worldlet://agent?v=1&s=AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8&n=Studio+Mac'};if(b.operation==='end')w.agentPairing={state:'none'};return w.agentPairing;}
  if(b.action==='phonePair'){if(b.operation==='start')w.pairing={state:'waiting',link:'worldlet://pair?v=1&s=AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8&n=Studio+Mac'};if(b.operation==='end'){w.pairing={state:'none'};setTimeout(()=>w.dispatchEvent(new CustomEvent('worldlet:phone-status',{detail:w.pairing})));}return w.pairing;}
  if(b.action==='phonePublish')return {sent:true};
  if(b.action==='agentChat'){w.worldletAgentEvent(b.id,{type:'progress',name:'read_mail'});w.worldletAgentEvent(b.id,{type:'delta',text:'Hello '});await new Promise(r=>setTimeout(r,400));w.worldletAgentEvent(b.id,{type:'delta',text:'from'});await new Promise(r=>setTimeout(r,400));return {message:'Hello from Fox.'};}
  return {ok:true};
 }}}};});
 await page.goto(worldUrl());await waitForWorld(page);
 // The Center goes to the host for the phone, shaped by agent/app.
 await page.waitForFunction(()=>(window as any).calls.some(c=>c.action==='phonePublish'));
 const published=await page.evaluate(()=>(window as any).calls.find(c=>c.action==='phonePublish'));
 assert.equal(published.slot,'attention');assert.deepEqual([published.value.v,published.value.now,published.value.later],[1,[],[]]);
 // Pairing from the panel.
 await openCompanionPanel(page,'Mobile');
 const panel=page.locator('#companionInfo');
 const phone=panel.locator('[data-section=Mobile]');await phone.getByRole('button',{name:'Pair phone',exact:true}).click();
 await phone.getByText('Scan with your phone').waitFor();
 const qr=phone.locator('.companion-phone-qr svg');await qr.waitFor();
 assert.equal(await phone.locator('.companion-phone-qr').getAttribute('aria-label'),'Pairing code for the Worldlet phone app');
 const size=await qr.boundingBox();assert(size&&size.width>=150&&Math.abs(size.width-size.height)<2,'the QR code is square and large enough to scan');
 await page.screenshot({path:'/tmp/phone-pairing-qr.png'});
 // The host reports the phone's first poll.
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('worldlet:phone-status',{detail:{state:'paired',phone:{name:'Kelvin’s iPhone',version:'1.0'},seenAt:Date.now(),push:{platform:'apns'}}})));
 await phone.getByText('Paired with Kelvin’s iPhone').waitFor();await phone.getByText('Active now').waitFor();await phone.getByText('Notifications on').waitFor();
 // Paired, Fox's Phone button steps aside (owner Order 2026-10-11).
 const phoneButton=page.locator('.companion-side .companion-phone-button');
 assert.equal(await phoneButton.getAttribute('hidden'),'','a paired phone hides the Phone button');
 await page.screenshot({path:'/tmp/phone-pairing-paired.png'});
 await phone.getByRole('button',{name:'Unpair',exact:true}).click();await phone.getByRole('button',{name:'Pair phone',exact:true}).waitFor();
 await phoneButton.waitFor();// unpaired (the host reports the change, as its relay does), the Phone button is back
 // One status read for Fox's Phone button as the World starts, one for the panel, then pairing and unpairing.
 assert.deepEqual(await page.evaluate(()=>(window as any).calls.filter(c=>c.action==='phonePair'&&!c.kind).map(c=>c.operation)),['status','status','start','end']);
 // Another computer (platform/web/README.md#another-computers-agent): its code is text to copy, then the paired laptop.
 await phone.getByRole('button',{name:'Pair another computer',exact:true}).click();
 await phone.locator('.companion-phone-code').getByText('worldlet://agent?v=1&s=',{exact:false}).waitFor();
 await phone.getByRole('button',{name:'Copy code',exact:true}).waitFor();
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('worldlet:agent-pair-status',{detail:{state:'paired',phone:{name:'Laptop',version:'2026.10.8'},seenAt:Date.now()}})));
 await phone.getByText('Paired with Laptop · Active now').waitFor();
 await phone.getByRole('button',{name:'Pair phone',exact:true}).waitFor();
 await phone.locator('.companion-phone-computers').getByRole('button',{name:'Unpair',exact:true}).click();
 await phone.getByRole('button',{name:'Pair another computer',exact:true}).waitFor();
 assert.deepEqual(await page.evaluate(()=>(window as any).calls.filter(c=>c.action==='phonePair'&&c.kind==='agent').map(c=>c.operation)),['status','start','end']);
 // Any web browser (platform/web/README.md#web): on this computer one button makes a link this app serves itself and opens
 // it; another device's browser gets a link to copy. Once a browser opened one, Run in background appears, and Turn off
 // ends both.
 const web=phone.locator('.companion-phone-browser');
 await web.getByText('On this computer').waitFor();await web.getByText('On another device').waitFor();
 await web.getByRole('button',{name:'Open in browser',exact:true}).click();
 await page.waitForFunction(()=>(window as any).calls.some(c=>c.action==='phonePair'&&c.kind==='local'&&c.operation==='open'));
 await web.getByRole('button',{name:'Cancel',exact:true}).waitFor();
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('worldlet:local-pair-status',{detail:{state:'paired',link:'http://127.0.0.1:47630/open/#v=1&s=x',phone:{name:'Chrome on Mac',version:'web'},seenAt:Date.now()}})));
 await web.getByText('Opened in Chrome on Mac · Active now').waitFor();
 await web.getByRole('button',{name:'Copy link',exact:true}).click();
 await web.getByRole('button',{name:'Link copied',exact:true}).waitFor();
 assert.equal(await page.evaluate(()=>(window as any).copied),'https://worldlet.ai/open/#v=1&s=AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8&n=Studio+Mac','another device gets the relay link');
// Run in background (modules/app): only once a browser has opened a link, and the link stays as it was.
await web.getByRole('button',{name:'Run in background',exact:true}).click();
await page.waitForFunction(()=>(window as any).calls.some(c=>c.action==='phonePair'&&c.kind==='local'&&c.operation==='background'));
await web.getByText('Opened in Chrome on Mac · Active now').waitFor();
 await web.getByRole('button',{name:'Turn off',exact:true}).click();
 await web.getByRole('button',{name:'Copy link',exact:true}).waitFor();
 assert.deepEqual(await page.evaluate(()=>(window as any).calls.filter(c=>c.action==='phonePair'&&c.kind==='local').map(c=>c.operation)),['status','start','open','background','end']);
 assert.deepEqual(await page.evaluate(()=>(window as any).calls.filter(c=>c.action==='phonePair'&&c.kind==='web').map(c=>c.operation)),['status','start','end']);
 // The full World on another device (platform/web/README.md#the-world-on-another-device): Open the World opens its link
 // in a browser here, the page says when another device has it open, and that alone lets Worldlet run in background
 // (a computer's browser goes straight on to the World, so the Center's own pairing may never complete).
 await web.getByRole('button',{name:'Open the World',exact:true}).click();
 await page.waitForFunction(()=>(window as any).calls.some(c=>c.action==='phonePair'&&c.kind==='world'&&c.operation==='open'));
 await web.getByRole('button',{name:'Cancel',exact:true}).waitFor();
 assert.equal(await web.getByRole('button',{name:'Run in background',exact:true}).count(),0,'not before a device opened it');
 await page.evaluate(()=>{const w=window as any;w.worldPairing={...w.worldPairing,state:'paired',phone:null,seenAt:Date.now()};window.dispatchEvent(new CustomEvent('worldlet:world-pair-status',{detail:w.worldPairing}));});
 await web.getByText('The full World opened on another device · Active now').waitFor();
 await web.getByRole('button',{name:'Run in background',exact:true}).click();
 await page.waitForFunction(()=>(window as any).calls.some(c=>c.action==='phonePair'&&c.kind==='world'&&c.operation==='background'));
 await web.getByRole('button',{name:'Turn off',exact:true}).click();
 await page.waitForFunction(()=>(window as any).calls.filter(c=>c.action==='phonePair'&&c.kind==='web'&&c.operation==='end').length===2);
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('worldlet:world-pair-status',{detail:{state:'none'}})));
 await web.getByRole('button',{name:'Run in background',exact:true}).waitFor({state:'detached'});
 assert.deepEqual(await page.evaluate(()=>(window as any).calls.filter(c=>c.action==='phonePair'&&c.kind==='world').map(c=>c.operation)),['status','open','background'],'the World is turned off with the browser link');
 await page.keyboard.press('Escape');
 // A chat line from the phone is the person's own message to Fox; an unknown message is taken and ignored.
 assert.equal(await page.evaluate(()=>(window as any).worldletPhoneMessage({type:'chat',id:'c1',text:'What is next?'})),true);
 await page.waitForFunction(()=>(window as any).calls.some(c=>c.action==='agentChat'&&c.text?.includes('What is next?')));
 assert.equal(await page.evaluate(()=>(window as any).worldletPhoneMessage({type:'chat',id:'c1',text:'What is next?'})),true);
 assert.equal(await page.evaluate(()=>(window as any).calls.filter(c=>c.action==='agentChat').length),1,'a repeated delivery runs once');
 assert.equal(await page.evaluate(()=>(window as any).worldletPhoneMessage({type:'run',id:'x'})),true);
 // Attention messages carry the item's id: the host names each delivery (agent/app phoneMessageKey), so Later then
 // Done on one item both settle it, and only the same delivery again is taken once.
 const settles=()=>page.evaluate(()=>(window as any).calls.filter(c=>c.action==='worldItemStatus'&&c.id==='item-7').map(c=>c.status));
 for(const [action,key] of [['later','b:1'],['done','b:2'],['done','b:2']])
  assert.equal(await page.evaluate(([action,key])=>(window as any).worldletPhoneMessage({type:'attention',id:'item-7',action},key),[action,key]),true);
 assert.deepEqual(await settles(),['open','done'],'a second action on the same item is not swallowed; a repeated delivery is');
 // The turn streams to the phone as it runs (its steps and the reply so far), then the finished reply.
 await page.waitForFunction(()=>(window as any).calls.some(c=>c.action==='phonePublish'&&c.slot==='live'&&c.value.done));
 const live=await page.evaluate(()=>(window as any).calls.filter(c=>c.action==='phonePublish'&&c.slot==='live').map(c=>c.value));
 assert(live.some(v=>!v.done&&v.text==='Hello'&&v.steps.length===1),'the partial reply and the step go out while Fox works');
 assert.deepEqual([live.at(-1).user,live.at(-1).text,live.at(-1).item],['What is next?','Hello from Fox.',undefined]);
 assert(live.length<=6,'streaming sends are coalesced');
 // An account that needs the person goes to the phone; the phone's Connect opens its sign-in on the computer.
 await page.evaluate(()=>document.getElementById('notionWorld')!.dispatchEvent(new CustomEvent('worldlet:source-issues',{detail:[{provider:'gmail',title:'Mail',action:'reconnect',run:()=>{(window as any).connected='gmail';}}]})));
 await page.waitForFunction(()=>(window as any).calls.some(c=>c.action==='phonePublish'&&c.value.accounts?.length));
 assert.deepEqual(await page.evaluate(()=>(window as any).calls.findLast(c=>c.action==='phonePublish'&&c.slot==='attention').value.accounts),[{provider:'gmail',title:'Mail',action:'reconnect'}]);
 assert.equal(await page.evaluate(()=>(window as any).worldletPhoneMessage({type:'connect',id:'k1',provider:'gmail'})),true);
 assert.equal(await page.evaluate(()=>(window as any).connected),'gmail');
 // Orders were retired (2026-10-18): one an older phone still sends is taken and does nothing, never a chat line.
 const chats=await page.evaluate(()=>(window as any).calls.filter(c=>c.action==='agentChat').length);
 assert.equal(await page.evaluate(()=>(window as any).worldletPhoneMessage({type:'order',id:'r1',said:'The Mail lamp stays red'})),true);
 await page.waitForTimeout(200);
 assert.equal(await page.evaluate(()=>(window as any).calls.filter(c=>c.action==='agentChat'||c.action==='order').length),chats,'an old Order is neither sent nor a chat line');
 assert.deepEqual(errors,[]);
 console.log('PASS Phone page pairs by QR code, shows the paired phone and unpairs, and pairs another computer by code; the Center and accounts go to the host; phone chat reaches Fox once and streams back; Connect opens sign-in on the computer; an old phone’s Order does nothing.');
}finally{await browser.close();}
