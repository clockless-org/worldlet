import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {FOX_MAIN_THREAD,companionHistory,restoredMainHistory} from '../ui/attention/context-recall.ts';
import {bundleScript,pageErrors} from './browser-test.ts';
assert.deepEqual(companionHistory([{role:'system',text:'ignore'},{role:'user',text:'hello'}]),[{role:'user',text:'hello'}]);
assert.equal(restoredMainHistory([{key:'mail',history:[{role:'user',text:'old'}]},{key:FOX_MAIN_THREAD,view:'',history:[{role:'user',text:'main'}]}])[0].text,'main');
{
 const {threadStart,threadStep,threadFinish,threadInterrupt,threadSteer,threadRow,restoreThread,threadCards,segmentOf,workingText}=await import('../ui/companion/fox-thread.ts');
 let t=threadStart([],{id:'a',key:'mail',view:'A',location:'Mail',user:'find the invoice',at:1});
 t=threadStep(threadStep(threadStep(t,'a','Looking that up…'),'a','Looking that up…'),'a','Opening Browser');
 assert.deepEqual(t[0].steps,['Looking that up','Opening Browser'],'steps are deduplicated and trimmed');
 assert.equal(workingText(t[0],''),'Opening Browser…','the working card holds one plain line, the current step; its question is shown above it');
 assert.equal(restoreThread([{key:'fox-thread',entries:t}])[0].status,'error','a turn running at restart is restored as interrupted');
 assert.equal(threadInterrupt(t,'a','Interrupted.')[0].status,'error','an unanswered turn ends as interrupted');
 const answered=threadFinish(t,'a','Done.');
 assert.equal(threadInterrupt(answered,'a','Interrupted.'),answered,'a finished turn is never rewritten as interrupted');
 t=threadFinish(threadStart(t,{id:'b',key:'calendar',view:'',location:'Calendar',user:'tomorrow?',at:2}),'b','**Standup** [Open](fox-action=x)<worldlet-replies>["x"]</worldlet-replies>');
 assert.deepEqual(threadCards(t,segmentOf(t[1])).map(e=>e.id),['b'],'a place shows its own finished turns');
 assert.deepEqual(threadCards(t,segmentOf(t[0])).map(e=>e.id),[],'a running turn is never a stacked card, and other places never show');
 // A message added to a running turn heads its card; the question before it stays above as its own card (owner Order 2026-10-07).
 let s=threadStart([],{id:'c',key:'overview',view:'',location:'World',user:'plan my week',userIcon:'spark',at:5});
 s=threadSteer(s,'c',{user:'and Friday off',at:9});
 assert.deepEqual(s.map(e=>[e.id,e.user,e.status,e.text]),[['c:asked:9','plan my week','done',''],['c','and Friday off','working','']]);
 assert.equal(s[1].userIcon,undefined,'the added words carry no action icon');assert.equal(s[0].userIcon,'spark');
 assert.deepEqual(threadCards(s,segmentOf(s[0])).map(e=>e.id),['c:asked:9'],'the earlier question is a stacked card while Fox works');
 assert.equal(threadSteer(threadFinish(s,'c','Done.'),'c',{user:'late',at:10}).length,2,'a finished turn takes no addition');
 assert.equal(restoreThread([threadRow(s)])[0].user,'plan my week','the question card survives a restart');
}
const bundle=await bundleScript({entryPoints:['ui/companion/companion-ai.ts'],globalName:'Fixture'});
const browser=await chromium.launch();
try{
 const page=await browser.newPage();const errors=pageErrors(page);
 await page.route('http://localhost/**',route=>route.fulfill({body:'<!doctype html>'}));await page.goto('http://localhost/');
 await page.setContent('<main class="notion-world" style="height:800px"><div class="notion-top"></div><dialog id="notionDialog"></dialog><section id="notionContent" hidden></section><div><div class="notion-shortcuts"></div><form><input id="notionInput"><button id="notionSend"></button><button id="trigger"></button></form></div><span id="status"></span></main>');
 await page.addScriptTag({content:bundle});
 await page.evaluate(()=>{
  const w=window as any;w.turns=[];w.analytics=[];w.saved=[];w.executed=[];w.holds={};
  w.fox=w.Fixture.createCompanionAI(async()=>({}),{
   request:async()=>({ok:true,json:async()=>({configured:false})}),
   nativeCall:async(action,body)=>{if(action==='openWorld')w.openedWorld=(w.openedWorld||0)+1;if(action==='usageEvent')w.analytics.push(body);if(action==='conversationRecall'){if(body?.rows)w.saved=body.rows;return w.saved;}return {};},
   modelOptions:async()=>{if(w.failModel)throw Error('Model unavailable');return {provider:'agent',setup:!!w.minimal};},
   runAgent:async body=>{w.turns.push(body);if(body.text.startsWith('wait'))await new Promise(resolve=>w.holds[body.text]=resolve);if(body.text.includes('fail'))throw Error('Agent stopped unexpectedly');return {message:'Reply to '+body.text};}
  })({chatRoute:()=>w.directRoute?{run:async()=>({message:'Direct coding reply'})}:null,button:document.querySelector('#trigger'),input:document.querySelector('#notionInput'),status:document.querySelector('#status'),execute:async(name,args)=>{w.executed.push({name,args});if(name==='automate_browser'&&args.operation==='open')w.view('browser','site');return {ok:true};},foxPageHeld:()=>!!w.foxPageHeld,onSubmit:()=>{}});
  w.view=(key,id)=>{const content=document.querySelector('#notionContent') as HTMLElement;content.hidden=false;content.dataset.sourceId=id;content.innerHTML='<h1>'+id+'</h1>';w.fox.setContext({key,title:key,detail:id});};
 });
 await page.evaluate(()=>{(window as any).view('mail','A');});
 // A place with no conversation yet says what Fox can do there; it is not a turn.
 assert.equal(await page.locator('#companionDialogue').isVisible(),true,'entering a context immediately shows dialogue without hover');
 assert.match(await page.locator('#worldConversation').textContent(),/“A”/,'empty context names the current selection');
 assert.equal(await page.locator('.companion-asked').isVisible(),false,'a greeting has no question line');
 assert.equal(await page.evaluate(()=>(window as any).turns.length),0,'ambient copy never invokes the model');
 await page.evaluate(()=>{const w=window as any;const done=document.createElement('button');done.textContent='Done';w.fox.setGuide({text:'Reminders is connected as Apple Reminders. Fox reads it on demand and checks it in the background.',actions:[done],takeover:true});});
 assert.match(await page.locator('#worldConversation').textContent(),/Reminders is connected/,'reproduce the reported connection receipt');
 await page.evaluate(()=>{(window as any).view('calendar','B');});
 assert.match(await page.locator('#worldConversation').textContent(),/“B”/,'navigation clears a source-less connection guide');
 assert.equal(await page.getByRole('button',{name:'Done',exact:true}).isVisible(),false,'old guide actions disappear too');
 await page.evaluate(()=>{const w=window as any;w.view('mail','A');w.fox.setGuide({text:'Same-Applet stale receipt',takeover:true});w.view('mail','A2');});
 assert.doesNotMatch(await page.locator('#worldConversation').textContent(),/stale receipt/,'content-only navigation clears guides');
 await page.evaluate(()=>{const w=window as any;w.fox.setGuide({text:'Review before sending',priority:true,takeover:true});w.view('mail','A');});
 // A guide belongs to its view's thread: it waits there while the person is elsewhere.
 assert.doesNotMatch(await page.locator('#worldConversation').textContent(),/Review before sending/,'another view shows its own thread, not this view\'s approval');
 await page.evaluate(()=>{(window as any).view('mail','A2');});
 assert.match(await page.locator('#worldConversation').textContent(),/Review before sending/,'explicit approval is not discarded by navigation');
 await page.evaluate(()=>{const w=window as any;w.fox.setGuide(null,{forget:true});w.view('mail','A');});
 await page.evaluate(async()=>{const w=window as any;await w.fox.submit('first');w.view('calendar','B');w.fox.hidePreview();});
 assert.equal(await page.locator('#companionDialogue').isVisible(),true,'context dialogue stays visible after dismissal');
 assert.match(await page.locator('#worldConversation').textContent(),/“B”/);
 assert.doesNotMatch(await page.locator('#worldConversation').textContent(),/Reply to first/);
 await page.evaluate(async()=>{await (window as any).fox.submit('second');});
 const turns=await page.evaluate(()=>(window as any).turns.map(t=>({history:t.history,context:t.context})));
 assert.equal(turns[0].context.thread,FOX_MAIN_THREAD);assert.equal(turns[1].context.thread,FOX_MAIN_THREAD);
 assert.equal(turns[1].context.view.id,'B');assert.equal(turns[1].history[0].text,'first');
 await page.evaluate(()=>{const w=window as any;w.view('mail','A');});
 assert.match(await page.locator('#worldConversation').textContent(),/Reply to first/,'returning restores only this context reply');
 await page.evaluate(()=>{const w=window as any;w.pending=w.fox.submit('wait A');});
 await page.waitForFunction(()=>(window as any).holds['wait A']);
 await page.evaluate(()=>{(window as any).fox.setGuide({text:'Suspended old connection receipt',takeover:true});});
 await page.evaluate(()=>{const w=window as any;w.view('explore','X');w.view('mail','C');});
 assert.equal(await page.evaluate(()=>(window as any).turns.at(-1).signal.aborted),false,'content navigation does not cancel the main conversation');
 assert.equal(await page.evaluate(()=>(window as any).fox.contextSnapshot().view.id),'C','environment updates immediately');
 assert.equal(await page.locator('#companionDialogue').isVisible(),true,'new context remains visible while another context is working');
 assert.match(await page.locator('.companion-thread-running').textContent(),/Still working · mail/,'a turn running in another place is named here');
 assert.doesNotMatch(await page.locator('#worldConversation').textContent(),/wait A/,'its working card stays in its own place');
 const blocked=await page.evaluate(async()=>{const w=window as any;return w.turns.at(-1).execute('move_view',{direction:'next'});});
 assert.match(blocked.error,/changed views/);
 // Fox's page held for its task (the task picture-in-picture window, #1175) is not the person's
 // selection: Fox's steps on it continue after the person moves on; relative UI actions do not.
 const held=await page.evaluate(async()=>{
  const w=window as any,turn=w.turns.at(-1),step=()=>turn.execute('automate_browser',{operation:'snapshot'});
  const before=await step();w.foxPageHeld=true;
  const after=await step(),moved=await turn.execute('move_view',{direction:'next'});w.foxPageHeld=false;
  return {before,after,moved};
 });
 assert.match(held.before.error,/changed views/,'a page step after the person moved on is refused');
 assert.equal(held.after.ok,true,'Fox\'s step on its held page continues');
 assert.match(held.moved.error,/changed views/,'relative UI actions are still refused while Fox\'s page is held');
 // On the desktop Companion the held page shows beside Fox, so its steps do not reopen the World.
 const away=await page.evaluate(async()=>{
  const w=window as any,turn=w.turns.at(-1);document.documentElement.classList.add('desktop-companion');w.foxPageHeld=true;
  const before=w.openedWorld||0,step=await turn.execute('automate_browser',{operation:'snapshot'});
  w.foxPageHeld=false;document.documentElement.classList.remove('desktop-companion');
  return {step,opened:(w.openedWorld||0)-before};
 });
 assert.equal(away.step.ok,true);assert.equal(away.opened,0,'Fox\'s step on its held page stays on the desktop');
 await page.evaluate(async()=>{const w=window as any;await w.turns.at(-1).execute('read_content',{id:'A'});w.holds['wait A']();await w.pending;});
 assert.doesNotMatch(await page.locator('#worldConversation').textContent(),/Reply to wait A/,'late reply cannot appear on C');
 await page.evaluate(async()=>{const w=window as any;w.view('explore','D');await w.fox.submit('continue');});
 assert.ok(await page.evaluate(()=>(window as any).turns.at(-1).history.some(h=>h.text==='Reply to wait A')),'completed off-screen turns stay in the main conversation');
 const saved=await page.evaluate(()=>(window as any).saved);
 assert.equal(restoredMainHistory(saved).at(-1).text,'Reply to continue','shared history survives persistence');
 await page.evaluate(()=>{const w=window as any;w.pending=w.fox.submit('wait queue');});
 await page.waitForFunction(()=>(window as any).holds['wait queue']);
 await page.evaluate(async()=>{const w=window as any;await w.fox.submit('this one');w.view('mail','E');w.holds['wait queue']();await w.pending;});
 assert.equal(await page.locator('#notionInput').inputValue(),'this one','queued relative request remains a draft after its target changes');
 await page.evaluate(()=>{const w=window as any;w.view('mail','G');w.fox.setGuide({text:'Choose a vault first',takeover:true});w.pending=w.fox.submit('wait guide');});
 await page.waitForFunction(()=>(window as any).holds['wait guide']);
 assert.equal(await page.evaluate(()=>(window as any).turns.at(-1).context.setup),'Choose a vault first','the guide set aside for a turn is its setup context');
 await page.evaluate(async()=>{const w=window as any;w.fox.setGuide(null);w.holds['wait guide']();await w.pending;await w.fox.submit('after guide');});
 assert.equal(await page.evaluate(()=>(window as any).turns.at(-1).context.setup),'','a guide closed during a turn is not resent to later turns');
 // Natural order (owner decision): the person's next message supersedes an earlier guide for good.
 await page.evaluate(()=>{const w=window as any;w.fox.setGuide({text:'Okay, it stays open.',takeover:true});w.pending=w.fox.submit('wait resume');});
 await page.waitForFunction(()=>(window as any).holds['wait resume']);
 await page.evaluate(async()=>{const w=window as any;w.holds['wait resume']();await w.pending;});
 assert.doesNotMatch(await page.locator('#worldConversation').textContent(),/stays open/,'a guide the person talked past never returns in front');
 assert.match(await page.locator('#worldConversation').textContent(),/Reply to wait resume/,'the newest line, Fox\'s reply, is in front');
 // A choice asked during a turn is part of that turn: its own reply joins the thread above it.
 await page.evaluate(()=>{const w=window as any;w.pending=w.fox.submit('wait review');});
 await page.waitForFunction(()=>(window as any).holds['wait review']);
 await page.evaluate(async()=>{const w=window as any;const send=document.createElement('button');send.type='button';send.textContent='Send';w.fox.setGuide({text:'Review this email before sending.',actions:[send],takeover:true});w.holds['wait review']();await w.pending;});
 assert.match(await page.locator('#worldConversation').textContent(),/Review this email before sending/,'the turn\'s pending choice stays in front of its own reply');
 // An action reads as an action: its icon and title, never the prompt behind it (#952).
 await page.evaluate(async()=>{const w=window as any;w.fox.setGuide(null,{forget:true});await w.fox.ask('Summarize the video currently open using its available transcript.',{displayText:'Summarize',icon:'spark'});});
 assert.equal(await page.locator('.companion-asked').textContent(),'Summarize','the question line shows the action title, not its prompt');
 assert.equal(await page.locator('.companion-asked .companion-user-icon svg').count(),1,'an action shows its icon');
 assert.equal(await page.evaluate(()=>(window as any).turns.at(-1).text),'Summarize the video currently open using its available transcript.','Fox still receives the full request');
 assert.equal(await page.evaluate(()=>(window as any).saved.find(r=>r.key==='fox-thread').entries.at(-1).userIcon),'spark','the saved thread keeps the action mark');
 // A choice in Fox's card is the person's reply: the reply icon and the choice's name.
 await page.evaluate(()=>{const w=window as any,choose=document.createElement('button');choose.type='button';choose.textContent='Not yet';choose.onclick=()=>w.fox.setGuide({text:'Okay, it stays open.',takeover:true});w.fox.setGuide({text:'Mark it done?',actions:[choose],takeover:true});});
 await page.getByRole('button',{name:'Not yet',exact:true}).click();
 await page.waitForFunction(()=>/stays open/.test(document.querySelector('#worldConversation')?.textContent||''));
 assert.equal(await page.locator('.companion-asked').textContent(),'Not yet','the answer card shows the choice as the person\'s reply');
 assert.equal(await page.locator('.companion-asked .companion-user-icon svg').count(),1,'a choice shows the reply icon');
 // A choice that asks Fox sends its name as the person's line, with the reply icon.
 await page.evaluate(()=>{const w=window as any,hello=document.createElement('button');hello.type='button';hello.textContent='Say hello';hello.onclick=()=>{void w.fox.ask('Hello');};w.fox.setGuide({text:'Want to check the model?',actions:[hello],takeover:true});});
 await page.getByRole('button',{name:'Say hello',exact:true}).click();
 await page.waitForFunction(()=>/Reply to Hello/.test(document.querySelector('#worldConversation')?.textContent||''));
 assert.equal(await page.locator('.companion-asked').textContent(),'Say hello');
 assert.equal(await page.evaluate(()=>(window as any).saved.find(r=>r.key==='fox-thread').entries.at(-1).userIcon),'reply');
 // Typing after pressing a choice that asked nothing is the person's own words.
 await page.evaluate(()=>{const w=window as any,cancel=document.createElement('button');cancel.type='button';cancel.textContent='Cancel';cancel.onclick=()=>w.fox.setGuide(null);w.fox.setGuide({text:'Anything else?',actions:[cancel],takeover:true});});
 await page.getByRole('button',{name:'Cancel',exact:true}).click();
 await page.evaluate(async()=>{const w=window as any;const input=document.querySelector('#notionInput') as HTMLInputElement;input.value='typed after cancel';await w.fox.submit();});
 await page.waitForFunction(()=>/Reply to typed after cancel/.test(document.querySelector('#worldConversation')?.textContent||''));
 assert.equal(await page.locator('.companion-asked').textContent(),'typed after cancel');
 assert.equal(await page.locator('.companion-asked .companion-user-icon').count(),0,'typed words carry no action mark');
 await page.evaluate(()=>{const w=window as any;w.fox.setGuide(null,{forget:true});w.pending=w.fox.submit('wait fail');});
 await page.waitForFunction(()=>(window as any).holds['wait fail']);
 await page.evaluate(async()=>{const w=window as any;w.view('calendar','H');w.holds['wait fail']();await w.pending;});
 assert.match(await page.locator('#worldConversation').textContent(),/Agent stopped unexpectedly/,'a failed turn reports its error after navigation');
 // A stopped turn that fails after the next turn started touches only its own card: the new
 // turn keeps working and the phone is not told it finished.
 await page.evaluate(()=>{const w=window as any;w.live=[];document.querySelector('.notion-world').addEventListener('worldlet:fox-live',(e:any)=>w.live.push(e.detail));w.pending=w.fox.submit('wait fail stale');});
 await page.waitForFunction(()=>(window as any).holds['wait fail stale']);
 await page.evaluate(()=>{const w=window as any;document.body.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));w.pendingNext=w.fox.submit('wait next');});
 await page.waitForFunction(()=>(window as any).holds['wait next']);
 await page.evaluate(async()=>{const w=window as any;w.holds['wait fail stale']();await w.pending;});
 const stale=await page.evaluate(()=>{const w=window as any,next=w.live.find(e=>e.user==='wait next');return {nextStatus:w.saved.find(r=>r.key==='fox-thread')?.entries?.find(e=>e.user==='wait next')?.status,nextDone:w.live.some(e=>e.id===next?.id&&e.done),staleDone:w.live.filter(e=>e.user==='wait fail stale'&&e.done).length,working:document.querySelector<HTMLElement>('#worldConversation').dataset.working,asked:document.querySelector('.companion-asked')?.textContent};});
 assert.deepEqual(stale,{nextStatus:'working',nextDone:false,staleDone:1,working:'true',asked:'wait next'},'a stopped turn failing late never marks the running turn failed or done');
 await page.evaluate(async()=>{const w=window as any;w.holds['wait next']();await w.pendingNext;});
 assert.match(await page.locator('#worldConversation').textContent(),/Reply to wait next/);
 // A stopped turn whose answer arrives later is finished as interrupted, never left working.
 await page.evaluate(()=>{const w=window as any;w.pending=w.fox.submit('wait stopped');});
 await page.waitForFunction(()=>(window as any).holds['wait stopped']);
 await page.evaluate(async()=>{const w=window as any;document.body.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));w.holds['wait stopped']();await w.pending;});
 const stopped=await page.evaluate(()=>(window as any).saved.find(r=>r.key==='fox-thread')?.entries?.find(e=>e.user==='wait stopped'));
 assert.equal(stopped?.status,'error','a stopped turn is saved as interrupted, not working');
 assert.match(stopped.text,/interrupted/);
 await page.evaluate(async()=>{const w=window as any;w.minimal=true;await w.fox.submit('setup question');});
 assert.deepEqual(await page.evaluate(()=>({context:(window as any).turns.at(-1).context,history:(window as any).turns.at(-1).history})),{context:{},history:[]},'setup cannot receive private view or main transcript');
 for(const viewport of [{width:375,height:812},{width:812,height:375}]){
  await page.setViewportSize(viewport);await page.emulateMedia({reducedMotion:'reduce',colorScheme:'dark'});
  await page.evaluate(async()=>{const w=window as any;w.view('notes','Fresh note');if(!w.freshAsked){w.freshAsked=true;w.minimal=false;await w.fox.submit('fresh');}w.fox.sync();});
  assert.equal(await page.locator('#companionDialogue').isVisible(),true);
  assert.match(await page.locator('#worldConversation').textContent(),/Reply to fresh/);
 }
 // One card per turn. Beside a reader or Applet the tall column always shows earlier turns
 // as separate cards above the front card; in the world they wait behind it as a deck and
 // expand upward. Other places never show; a running turn is one card that
  // becomes its answer. Each turn asks about something else, since turns on one topic stack (#2171).
 await page.setViewportSize({width:1280,height:800});await page.emulateMedia({reducedMotion:'reduce',colorScheme:'light'});
 await page.evaluate(async()=>{const w=window as any;w.minimal=false;w.view('mail','T');await w.fox.submit('plan a weekend trip to Tokyo');await w.fox.submit('compare electric bikes under 2000 dollars');});
 assert.match(await page.locator('#worldConversation').textContent(),/Reply to compare electric bikes under 2000 dollars/);
 assert.equal(await page.locator('.companion-asked').textContent(),'compare electric bikes under 2000 dollars','the front card shows the question it answers');
 assert.equal(await page.locator('#companionDialogue').getAttribute('data-pages'),'1','a turn is one card, never pages');
 assert.equal(await page.locator('.companion-thread-card').count(),2,'one separate card per earlier turn, with the greeting that was answered');
 assert.match(await page.locator('.companion-thread-card').first().textContent(),/“T”/,'the greeting the person answered moved up into the history');
 assert.equal(await page.locator('.companion-thread-card').first().locator('.companion-thread-user').count(),0,'a greeting card has no question');
 assert.match(await page.locator('.companion-thread-card').last().textContent(),/plan a weekend trip to Tokyo[\s\S]*Reply to plan a weekend trip to Tokyo/,'beside a reader, earlier turns show above without asking');
 const [olderFade,newerFade]=await page.locator('.companion-thread-card').evaluateAll(cards=>cards.map(c=>c.style.getPropertyValue('--age')));
 assert.deepEqual([olderFade,newerFade],['1','0'],'older cards step further back');
 assert.equal(await page.locator('.companion-earlier').isVisible(),false,'nothing to unfold when history already shows');
 assert.equal(await page.locator('.companion-deck').isVisible(),false);
 assert.doesNotMatch(await page.locator('.companion-thread-list').textContent(),/Reply to first/,'other places\' turns never show here');
 assert.doesNotMatch(await page.locator('.companion-thread-list').textContent(),/steps?\b/,'cards show no step counts');
 await page.evaluate(()=>{const w=window as any;w.pending=w.fox.submit('wait thread');});
 await page.waitForFunction(()=>(window as any).holds['wait thread']);
 assert.equal(await page.locator('.companion-asked').textContent(),'wait thread','the working card shows the question');
 assert.match(await page.locator('#worldConversation').textContent(),/…\s*$/,'and the step in progress');
 assert.equal(await page.locator('#worldConversation li').count(),0,'steps are plain lines, not a bulleted list');
 assert.equal(await page.locator('#worldConversation').getAttribute('data-working'),'true','the step line is set apart from real replies');
 await page.evaluate(()=>{(window as any).view('calendar','U');});
 assert.match(await page.locator('.companion-thread-running').textContent(),/Still working · mail/);
 await page.evaluate(()=>{(window as any).view('mail','T');});
 assert.equal(await page.locator('.companion-asked').textContent(),'wait thread','returning shows the running card again');
 await page.evaluate(async()=>{const w=window as any;w.holds['wait thread']();await w.pending;});
 assert.match(await page.locator('#worldConversation').textContent(),/Reply to wait thread/,'the card becomes the answer');
 assert.equal(await page.locator('.companion-deck').getAttribute('data-depth'),'1');
 // After a long pause, the place's last turn is still the card, faded under a gradient, never replayed as "Welcome back".
 assert.equal(await page.locator('#worldConversation').getAttribute('data-stale'),'false','a fresh line does not fade');
 await page.evaluate(()=>{const w=window as any;w.realNow=Date.now;Date.now=()=>w.realNow()+3*3600e3;w.view('calendar','U');w.view('mail','T');});
 assert.match(await page.locator('#worldConversation').textContent(),/Reply to wait thread/);
 assert.doesNotMatch(await page.locator('#worldConversation').textContent(),/Welcome back/);
 assert.equal(await page.locator('#worldConversation').getAttribute('data-stale'),'true','an old line fades');
 assert.equal(await page.locator('.companion-deck').getAttribute('data-depth'),'1');
 await page.evaluate(()=>{const w=window as any;Date.now=w.realNow;w.view('calendar','U');w.view('mail','T');});
 // Turns about one thing are one stack (#2171): the greeting and the short question that answers it share a topic, shown
 // as its newest turn under the topic's name and count; the name opens it into one card per turn, the greeting first.
 await page.evaluate(async()=>{const w=window as any;w.view('docs','D');await w.fox.submit('docs one');await w.fox.submit('docs two');});
 assert.equal(await page.locator('.companion-thread-card.is-topic-stack').count(),1,'the answered greeting and its follow-up stack as one topic');
 assert.match(await page.locator('.companion-topic-head').textContent(),/^docs one2$/,'the stack is named by its question and counts its turns');
 assert.match(await page.locator('.companion-thread-card.is-topic-stack').textContent(),/Reply to docs one/,'the stack shows its newest turn');
 // This fixture loads no stylesheet, so Fox's unstyled sprite lies over the list; the styled head is clicked in fox-chat-fold-check.
 await page.locator('.companion-topic-head').evaluate((head:HTMLButtonElement)=>head.click());
 assert.equal(await page.locator('.companion-thread-card').count(),2,'opened, one card per turn');
 assert.match(await page.locator('.companion-thread-card').first().textContent(),/“D”/,'the answered greeting first');
 assert.equal(await page.locator('.companion-topic-head').getAttribute('aria-expanded'),'true');
 await page.locator('.companion-topic-head').evaluate((head:HTMLButtonElement)=>head.click());
 assert.equal(await page.locator('.companion-thread-card.is-topic-stack').count(),1,'its name folds it back to one stack');
 await page.evaluate(()=>{(window as any).view('mail','T');});
 // At world level the bubble can be dismissed; hover and click then bring back the same
 // card: this place's last turn, never a greeting or an old guide.
 await page.mouse.move(5,5);
 await page.evaluate(async()=>{const w=window as any;(document.querySelector('#notionContent') as HTMLElement).hidden=true;w.fox.setContext({key:'overview',title:'World',detail:''});await w.fox.submit('suggest a quiet cafe nearby');await w.fox.submit('world question');});
 // In the world, earlier turns wait behind the front card with a clear handle; scrolling up
 // or a click unfolds them upward as separate cards, and the handle folds them again.
 assert.equal(await page.locator('.companion-thread-list').isVisible(),false,'in the world earlier turns stay folded');
 assert.equal(await page.locator('.companion-deck').getAttribute('data-depth'),'1');
 assert.equal(await page.locator('.companion-earlier').textContent(),'Expand','a quiet Expand handle opens the whole conversation');
 await page.locator('#worldConversation').hover();await page.mouse.wheel(0,-120);
 await page.waitForFunction(()=>document.querySelector<HTMLElement>('#companionDialogue').dataset.expanded==='true');
 assert.match(await page.locator('.companion-thread-list').textContent(),/This is your world[\s\S]*suggest a quiet cafe nearby/,'scrolling up unfolds earlier turns, the answered greeting first');
 assert.equal(await page.locator('.companion-earlier').textContent(),'Fold');
 await page.locator('.companion-earlier').click();
 assert.equal(await page.locator('#companionDialogue').getAttribute('data-expanded'),'false','the handle folds them again');
 await page.locator('#worldConversation').click();
 assert.equal(await page.locator('#companionDialogue').getAttribute('data-expanded'),'true','a click on the card unfolds too');
 // With motion on, folding and unfolding are animated and still settle.
 await page.emulateMedia({reducedMotion:'no-preference'});
 await page.locator('.companion-earlier').click();
 assert.equal(await page.locator('#companionDialogue').getAttribute('data-expanded'),'true','folding animates before the column closes');
 await page.waitForFunction(()=>document.querySelector<HTMLElement>('#companionDialogue').dataset.expanded==='false');
 await page.locator('.companion-earlier').click();
 assert.ok(await page.locator('.companion-thread-list').evaluate(c=>c.getAnimations().length>0),'unfolding animates the bounded reading surface');
 // Reversing while motion is active must honor the latest click, with no stale
 // fold completion closing an already reopened history.
 await page.locator('.companion-earlier').evaluate((button:HTMLButtonElement)=>{button.click();button.click();button.click();button.click();});
 await page.waitForFunction(()=>document.querySelector('.companion-thread-list').getAnimations().length===0);
 assert.equal(await page.locator('#companionDialogue').getAttribute('data-expanded'),'true','rapid reversals settle open');
 const historyBeforeFold=await page.locator('.companion-thread-list').textContent();
 await page.locator('.companion-thread-list').evaluate(list=>{(window as any).retainedHistoryCard=list.firstElementChild;});
 await page.locator('.companion-earlier').click();
 await page.waitForFunction(()=>document.querySelector<HTMLElement>('#companionDialogue').dataset.expanded==='false');
 await page.locator('.companion-earlier').click();
 assert.equal(await page.locator('.companion-thread-list').textContent(),historyBeforeFold,'folding preserves message content');
 assert.ok(await page.locator('.companion-thread-list').evaluate(list=>list.firstElementChild===(window as any).retainedHistoryCard),'reopening retains history DOM');
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.keyboard.press('Escape');
 assert.equal(await page.locator('#companionDialogue').getAttribute('data-expanded'),'false','Esc folds the thread');
 await page.mouse.move(5,5);
 await page.evaluate(()=>{const w=window as any;w.fox.setGuide({text:'An old world notice',takeover:true});w.fox.hidePreview(true);});
 assert.equal(await page.locator('#companionDialogue').isVisible(),false);
 await page.locator('.companion-avatar').hover();
 await page.waitForFunction(()=>/Reply to world question/.test(document.querySelector('#worldConversation')?.textContent||''));
 const hovered=await page.locator('#worldConversation').textContent();
 await page.mouse.move(5,5);await page.evaluate(()=>{(window as any).fox.hidePreview(true);});
 await page.locator('#notionInput').click();
 assert.equal(await page.locator('#worldConversation').textContent(),hovered,'starting to type shows the card hovering shows');
 assert.equal(await page.locator('.companion-asked').textContent(),'world question');
 await page.keyboard.press('Escape');
 // Coming back to the world, Fox's last line does not pop up again; hovering Fox still shows it (owner Order 2026-10-07).
 await page.mouse.move(5,5);
 await page.evaluate(()=>{const w=window as any;w.view('mail','T');(document.querySelector('#notionContent') as HTMLElement).hidden=true;w.fox.setContext({key:'overview',title:'World',detail:''});});
 await page.waitForTimeout(50);
 assert.equal(await page.locator('#companionDialogue').isVisible(),false,'returning to the world shows no card');
 await page.locator('.companion-avatar').hover();
 await page.waitForFunction(()=>/Reply to world question/.test(document.querySelector('#worldConversation')?.textContent||''));
 await page.mouse.move(5,5);
 const threadRows=await page.evaluate(()=>(window as any).saved.find(r=>r.key==='fox-thread')?.entries||[]);
 assert.ok(threadRows.some(e=>e.user==='plan a weekend trip to Tokyo'&&e.text==='Reply to plan a weekend trip to Tokyo'),'the thread survives persistence');
 assert.ok(threadRows.some(e=>e.user==='wait A'&&e.key==='mail'),'turns keep the place they were asked in');
 await page.evaluate(()=>{const w=window as any;w.view('overview','world');w.pending=w.fox.submit('wait browser');});
 await page.waitForFunction(()=>(window as any).holds['wait browser']);
 const continued=await page.evaluate(async()=>{const w=window as any,turn=w.turns.at(-1);await turn.execute('automate_browser',{operation:'open',url:'https://fixture.test'});const result=await turn.execute('automate_browser',{operation:'snapshot'});w.holds['wait browser']();await w.pending;return result;});
 assert.equal(continued.ok,true,'Agent browser navigation must permit the next browser step');
 assert.match(await page.locator('#worldConversation').textContent(),/Reply to wait browser/,'Agent-opened Browser receives the final reply');
 await page.evaluate(async()=>{const w=window as any;w.analytics=[];w.failModel=true;await w.fox.submit('test preflight');w.failModel=false;w.directRoute=true;await w.fox.submit('test direct session');});
 assert.deepEqual(await page.evaluate(()=>(window as any).analytics.map(e=>e.event)),['fox_turn_started','fox_turn_failed','fox_turn_started','fox_turn_completed'],'Actual Fox UI reports preflight failure and direct-session completion');
 assert.deepEqual(errors,[]);
 console.log('PASS main Fox conversation: one card per turn (deck, upward expansion, this place only, running card elsewhere, same card on hover and click), turns on one topic stacked, cross-Applet history, current environment, in-flight navigation, target guard, late replies, persistence and queued drafts');
}finally{await browser.close();}
