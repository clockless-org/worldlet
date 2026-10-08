import assert from 'node:assert/strict';
import {withBrowser,fileAccess,pageErrors,worldUrl} from './browser-test.ts';
import path from 'node:path';
import {mkdir} from 'node:fs/promises';
// Fox's chat is one visible thread per context over one session. A thread reads bottom-up
// beside an Applet, can fold to its newest card with the rest behind it as a deck (a
// preference that survives a reload), and it never follows the person into another
// context. Bundled UI with a faked native bridge;
// fictional turns, no model or account.
// Usage: node scripts/fox-chat-fold-check.ts [screenshot directory]
// What would make the earlier turns hard to read over World art (#1652): a mask that fades the
// list, see-through cards without frosting, or text under 4.5:1 contrast on its card. Cards are slightly
// see-through frosted paper (owner Order 2026-10-08): contrast is measured on that paper over black, the worst case.
function threadReadability(list:Element){
 const rgba=(value:string)=>{const n=(value.match(/[\d.]+/g)||[]).map(Number),srgb=value.startsWith('color(');const [r,g,b]=srgb?n.slice(0,3).map(v=>v*255):n.slice(0,3);return {r,g,b,a:n.length>3?n[3]:1};};
 const luminance=({r,g,b}:{r:number;g:number;b:number})=>{const f=(v:number)=>{v/=255;return v<=.03928?v/12.92:Math.pow((v+.055)/1.055,2.4);};return .2126*f(r)+.7152*f(g)+.0722*f(b);};
 const problems:string[]=[],box=list.getBoundingClientRect();
 for(let el:Element|null=list;el&&el.id!=='notionWorld';el=el.parentElement){const style=getComputedStyle(el);if(style.maskImage!=='none'||(style as any).webkitMaskImage&&(style as any).webkitMaskImage!=='none')problems.push('mask on '+el.className);if(Number(style.opacity)<1)problems.push('opacity '+style.opacity+' on '+el.className);}
 const cards=[...list.querySelectorAll<HTMLElement>('.companion-thread-card')].filter(card=>{const r=card.getBoundingClientRect();return r.bottom>box.top&&r.top<box.bottom;});
 if(getComputedStyle(list).visibility!=='hidden'&&!cards.length)problems.push('no card in view');
 for(const card of cards){
  const style=getComputedStyle(card),paper=rgba(style.backgroundColor);
  if(paper.a<1){
   if(paper.a<.85||!/blur/.test(style.backdropFilter))problems.push('see-through card '+style.backgroundColor+' '+style.backdropFilter);
   paper.r*=paper.a;paper.g*=paper.a;paper.b*=paper.a;
  }
  for(const text of [card,...card.querySelectorAll<HTMLElement>('.companion-thread-user,.companion-thread-reply p')]){
   const s=getComputedStyle(text),ink=rgba(s.color),alpha=ink.a*Number(s.opacity);
   const mixed={r:ink.r*alpha+paper.r*(1-alpha),g:ink.g*alpha+paper.g*(1-alpha),b:ink.b*alpha+paper.b*(1-alpha)};
   const [hi,lo]=[luminance(mixed),luminance(paper)].sort((a,b)=>b-a),ratio=(hi+.05)/(lo+.05);
   if(ratio<4.5)problems.push(`contrast ${ratio.toFixed(2)} for “${text.textContent!.trim().slice(0,30)}”`);
  }
 }
 return problems;
}
const shots=path.resolve(process.argv[2]||'output/fox-chat-fold');await mkdir(shots,{recursive:true});
await withBrowser(fileAccess,async browser=>{
 const context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'});
 const page=await context.newPage(),errors=pageErrors(page);page.setDefaultTimeout(15000);
 await page.addInitScript(()=>{
  const w=window as any;w.calls=[];w.holds={};
  w.webkit={messageHandlers:{worldlet:{async postMessage(b){w.calls.push(b);
   if(b.action==='snapshot')return {workspaceId:'chat-fold',revision:0,sources:[],knowledge:[],worldItems:[],connections:[],onboarding:{completed:true},sampleEnabled:false,cloudConsent:true};
   if(b.action==='modelStatus')return {available:true,cloudAllowed:true};
   // The thread persists like the native conversation archive, so a reload restores it.
   if(b.action==='conversationRecall'){if(Array.isArray(b.rows)){localStorage.setItem('fixture-recall',JSON.stringify(b.rows));return {ok:true};}return JSON.parse(localStorage.getItem('fixture-recall')||'[]');}
   // A message added while Fox works joins the running turn (Hermes steering); its reply answers both.
   if(b.action==='agentSteer'){w.steered=[...(w.steered||[]),b.text];return {accepted:true};}
   if(b.action==='agentChat'){
    w.sessions=[...(w.sessions||[]),b.context?.thread];
    if(b.text.startsWith('wait')){w.worldletAgentEvent(b.id,{type:'status',stage:'waiting'});await new Promise(resolve=>w.holds[b.text]=resolve);}
    return {message:'Reply to '+b.text+(w.steered?.length?' and '+w.steered.splice(0).join(', '):'')+'.'+(b.text.startsWith('long')?' Draft prepared for your review, not sent.'+' It covers each of his questions in turn.'.repeat(14)+' Last words.':'')};
   }
   return {ok:true};
  }}}};
 });
 const url=worldUrl();
 const fold=page.locator('.companion-fold'),list=page.locator('.companion-thread-list'),deck=page.locator('.companion-deck'),front=page.locator('#worldConversation'),dialogue=page.locator('#companionDialogue');
 async function enterBrowser(){await page.evaluate(()=>{location.hash='object=app-browser';});await page.locator('#notionContent[data-template=browser]').waitFor();await dialogue.waitFor();}
 async function enterWorld(quiet=true){await page.keyboard.press('Escape');await page.evaluate(()=>{location.hash='';});await page.waitForFunction(()=>document.querySelector<HTMLElement>('#notionWorld')?.dataset.depth==='overview');await page.mouse.move(700,500);
  // Coming back, Fox's last line does not pop up again (owner Order 2026-10-07); hovering Fox shows it.
  if(quiet){await page.waitForTimeout(50);assert.equal(await dialogue.isVisible(),false,'returning to the World pops up no card');}
  await page.locator('.companion-avatar').hover();await dialogue.waitFor();}
 async function type(text:string){
  if(!await page.locator('#notionInput').isVisible())await page.locator('.companion-avatar').click();
  await page.locator('#notionInput').fill(text);await page.locator('#notionInput').press('Enter');
 }
 const idle=(text:string)=>page.waitForFunction(t=>document.querySelector('#notionWorld')?.getAttribute('data-reply-busy')!=='true'&&document.querySelector('#worldConversation')?.textContent.includes('Reply to '+t),text);
 async function ask(text:string){await type(text);await idle(text);}
 const cardTexts=()=>list.locator('.companion-thread-card').allTextContents();
 const top=async(locator:any)=>(await locator.boundingBox())?.y??NaN;
 await page.goto(url);await page.locator('#worldStartup').waitFor({state:'detached'});

 // The World is one context with its own thread.
 await ask('world one');
 assert.equal(await fold.isVisible(),false,'in the world the column toggle does not exist; the world keeps its own History handle');
 await page.keyboard.press('Escape');

 // An Applet is another context: it starts with its own thread, not the World's.
 await enterBrowser();
 assert.doesNotMatch(await dialogue.textContent(),/world one/,'the World thread does not show in an Applet');
 assert.equal(await fold.isVisible(),false,'with nothing earlier there is nothing to collapse');
 for(const text of ['plan a weekend trip to Tokyo','compare electric bikes under 2000 dollars'])await ask(text);

 // A new card pushes the others up and grows in from the bottom, next to Fox.
 await page.emulateMedia({reducedMotion:'no-preference'});
 const beforePush=await top(dialogue.locator('#worldConversation'));
 // Record the grow-in as the product starts it. Sampling getAnimations() after the
 // waitFor round-trip can miss the 320ms animation on a loaded host (#956).
 await page.evaluate(()=>{
  const w=window as any,animate=Element.prototype.animate;w.growMotion=[];
  Element.prototype.animate=function(this:Element,...args:any[]){
   const run=animate.apply(this,args as any);
   if(this.matches('#companionDialogue .companion-asked, #worldConversation'))w.growMotion.push({frames:(run.effect as KeyframeEffect).getKeyframes(),finished:run.finished.then(()=>true,()=>false)});
   return run;
  };
  w.restoreAnimate=()=>{Element.prototype.animate=animate;};
 });
 await type('wait summarize the quarterly budget spreadsheet');
 await page.locator('.companion-asked',{hasText:'wait summarize the quarterly budget spreadsheet'}).waitFor();
 const grow=await page.evaluate(async()=>{
  const w=window as any;w.restoreAnimate();
  return {frames:w.growMotion.map((m:any)=>m.frames),finished:await Promise.all(w.growMotion.map((m:any)=>m.finished))};
 });
 assert.ok(grow.frames.length>0,'the new card grows in from the bottom');
 for(const frames of grow.frames){assert.equal(frames[0].transform,'translateY(14px) scale(0.97)','it grows up from below');assert.equal(Number(frames[0].opacity),0);assert.equal(frames.at(-1).transform,'none');}
 assert.ok(grow.finished.every(Boolean),'the grow-in completes without cancellation');
 await page.waitForFunction(()=>document.querySelectorAll('.companion-thread-card').length===3&&[...document.querySelectorAll('.companion-thread-card, #companionDialogue .companion-asked, #worldConversation')].every(e=>e.getAnimations().length===0));
 const pushed=list.locator('.companion-thread-card',{hasText:'Reply to compare electric bikes under 2000 dollars'});
 assert.ok(await top(pushed)<beforePush,'the previous newest card was pushed up into the thread');
 await page.evaluate(()=>(window as any).holds['wait summarize the quarterly budget spreadsheet']());await idle('wait summarize the quarterly budget spreadsheet');
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.keyboard.press('Escape');await page.mouse.move(700,500);

 // Default: expanded, the whole thread bottom-up: oldest at the top, newest next to Fox.
 assert.equal(await fold.isVisible(),true,'the toggle sits on the chat card');
 assert.equal(await fold.getAttribute('aria-expanded'),'true','expanded by default');
 assert.equal(await fold.getAttribute('aria-controls'),await list.getAttribute('id'));
 assert.equal(await list.isVisible(),true);assert.equal(await deck.isVisible(),false);
 const expandedCards=await cardTexts();
 assert.equal(expandedCards.length,3,'the answered greeting and two earlier turns: '+JSON.stringify(expandedCards));
 assert.match(expandedCards.join('\n'),/This is the Browser[\s\S]*plan a weekend trip to Tokyo[\s\S]*Reply to plan a weekend trip to Tokyo[\s\S]*compare electric bikes under 2000 dollars[\s\S]*Reply to compare electric bikes under 2000 dollars/,'oldest first');
 const tops=await list.locator('.companion-thread-card').evaluateAll(cards=>cards.map(c=>c.getBoundingClientRect().top));
 assert.deepEqual([...tops].sort((a,b)=>a-b),tops,'older cards sit above newer ones');
 assert.ok(tops.at(-1)<await top(dialogue),'the newest card is at the bottom, next to Fox');
 assert.match(await front.textContent(),/Reply to wait summarize the quarterly budget spreadsheet/);
 await page.screenshot({path:path.join(shots,'chat-expanded.png')});

 // Collapse: only the latest message in full, the earlier ones one card edge behind it.
 await fold.click();
 assert.equal(await fold.getAttribute('aria-expanded'),'false');
 assert.equal(await fold.textContent(),'Expand','the collapsed toggle reads Expand');
 assert.match(await fold.getAttribute('aria-label'),/3 earlier/,'and says what waits behind the card');
 assert.equal(await list.isVisible(),false,'earlier messages are not shown in full');
 assert.equal(await deck.isVisible(),true,'a card edge peeks out behind the front card');
 assert.equal(await deck.getAttribute('data-depth'),'1','one card edge peeks out: two cards in all');
 assert.equal(await deck.locator('i').count(),1,'the deck never draws more than one edge');
 assert.match(await front.textContent(),/Reply to wait summarize the quarterly budget spreadsheet/,'the latest message stays whole');
 assert.equal(await page.locator('.companion-asked').textContent(),'wait summarize the quarterly budget spreadsheet');
 assert.match(await page.getByRole('status',{name:'Current reply'}).textContent(),/Reply to wait summarize the quarterly budget spreadsheet/,'assistive technology reads the latest message');
 assert.equal(await page.evaluate(()=>localStorage.getItem('worldlet.companion.chat-folded')),'true','the choice is stored as a UI preference');
 const [deckBox,cardBox]=[await deck.boundingBox(),await dialogue.boundingBox()];
 assert.ok(deckBox&&cardBox&&deckBox.y<cardBox.y&&deckBox.y+deckBox.height>cardBox.y,'the deck edges peek above the front card: '+JSON.stringify({deckBox,cardBox}));
 await page.screenshot({path:path.join(shots,'chat-collapsed.png')});

 // A new message while collapsed takes the front; the previous one joins the stack.
 await type('wait draft a short birthday message for grandma tonight');
 await page.locator('.companion-asked',{hasText:'wait draft a short birthday message for grandma tonight'}).waitFor();
 assert.equal(await list.isVisible(),false,'still collapsed while Fox works');
 assert.equal(await deck.isVisible(),true);
 assert.match(await fold.getAttribute('aria-label'),/4 earlier/,'the previous front card joined the stack');
 await page.waitForFunction(()=>/…\s*$/.test(document.querySelector('#worldConversation')?.textContent||''));
 assert.equal(await front.getAttribute('data-working'),'true','the working line streams on the front card');
 await page.evaluate(()=>(window as any).holds['wait draft a short birthday message for grandma tonight']());await idle('wait draft a short birthday message for grandma tonight');
 assert.equal(await fold.getAttribute('aria-expanded'),'false','a reply does not unfold the column');
 assert.equal(await list.isVisible(),false);
 await page.keyboard.press('Escape');await page.mouse.move(700,500);

 // Clicking the stack expands it again: every message is back.
 await deck.click({position:{x:(deckBox?.width||200)/2,y:4}});
 assert.equal(await fold.getAttribute('aria-expanded'),'true','clicking the stack expands');
 assert.equal(await list.isVisible(),true);
 assert.match((await cardTexts()).join('\n'),/Reply to plan a weekend trip to Tokyo[\s\S]*Reply to compare electric bikes under 2000 dollars[\s\S]*Reply to wait summarize the quarterly budget spreadsheet/,'expanding restores all messages, the former front card included');
 assert.equal(await page.evaluate(()=>localStorage.getItem('worldlet.companion.chat-folded')),'false');

 // With motion allowed, unfolding animates and still settles.
 await page.emulateMedia({reducedMotion:'no-preference'});
 await fold.click();assert.equal(await list.isVisible(),false);
 // Observe the real animation in the click's task, after the product handler. A
 // second driver round-trip can arrive after the 280ms animation has finished.
 // Keep its evidence through completion: missing/cancelled motion must still fail.
 await fold.evaluate(button=>button.addEventListener('click',()=>{
  const animations=document.querySelector('.companion-thread-list')!.getAnimations();
  (window as any).unfoldMotion={
   runs:animations.map(a=>({state:a.playState,frames:(a.effect as KeyframeEffect).getKeyframes(),duration:a.effect!.getTiming().duration})),
   finished:Promise.all(animations.map(a=>a.finished.then(()=>true,()=>false)))
  };
 },{once:true}));
 await fold.click();
 const motion=await page.evaluate(async()=>{
  const evidence=(window as any).unfoldMotion;
  return {runs:evidence.runs,finished:await evidence.finished};
 });
 assert.equal(motion.runs.length,1,'unfolding animates the bounded thread surface');
 const unfold=motion.runs[0];
 assert.equal(unfold.state,'running');
 assert.ok(Number(unfold.duration)>0&&Number(unfold.duration)<=1000,'unfolding is bounded');
 assert.equal(unfold.frames[0].transform,'translateY(24px)','unfolding rises out of the deck');
 assert.equal(Number(unfold.frames[0].opacity),0);
 assert.equal(unfold.frames.at(-1).transform,'none');
 assert.equal(Number(unfold.frames.at(-1).opacity),1);
 assert.deepEqual(motion.finished,[true],'the actual unfold animation completes without cancellation');
 assert.equal(await list.evaluate(e=>e.getAnimations().length),0,'motion evidence survives late observation after settling');
 assert.equal(await list.isVisible(),true,'settling leaves the thread expanded');
 console.log('PASS unfold motion: real click starts upward fade, completes and remains verifiable after settling');
 await page.emulateMedia({reducedMotion:'reduce'});
 // Keyboard: the toggle is an ordinary button.
 await fold.focus();await page.keyboard.press('Enter');
 assert.equal(await fold.getAttribute('aria-expanded'),'false','the keyboard collapses too');

 // The preference and the thread survive a reload.
 await page.reload();await page.locator('#worldStartup').waitFor({state:'detached'});
 await enterBrowser();
 await page.waitForFunction(()=>document.querySelector('#worldConversation')?.textContent.includes('Reply to wait draft a short birthday message for grandma tonight'));
 assert.equal(await fold.getAttribute('aria-expanded'),'false','still collapsed after a reload');
 assert.equal(await list.isVisible(),false);assert.equal(await deck.isVisible(),true);
 await fold.click();
 assert.equal(await list.isVisible(),true);
 assert.match((await cardTexts()).join('\n'),/Reply to plan a weekend trip to Tokyo[\s\S]*Reply to compare electric bikes under 2000 dollars[\s\S]*Reply to wait summarize the quarterly budget spreadsheet/,'expanding after reload restores every message');

 // Back in the World: its own thread, without the Applet's replies.
 await ask('check the morning weather forecast');await page.keyboard.press('Escape');await page.mouse.move(700,500);
 await enterWorld();
 assert.match(await front.textContent(),/Reply to world one/,'hovering Fox in the World shows the World thread');
 assert.doesNotMatch(await dialogue.textContent(),/Reply to (plan|compare|wait|check)/,'the Applet thread stays in the Applet');

 // Re-entering the Applet restores its thread.
 await enterBrowser();
 await page.waitForFunction(()=>/Reply to check the morning weather forecast/.test(document.querySelector('#companionDialogue')?.textContent||''));
 assert.match((await cardTexts()).join('\n'),/Reply to plan a weekend trip to Tokyo[\s\S]*Reply to compare electric bikes under 2000 dollars[\s\S]*Reply to wait summarize the quarterly budget spreadsheet/,'the Applet thread is intact');
 assert.deepEqual([...new Set(await page.evaluate(()=>(window as any).sessions))],['fox-main'],'every context talks to the one Fox session');

 // A long reply that leaves the front for a review card stays readable to its end (#1622):
 // the thread shows its last words, keeps them in view when the card grows, and shows a scroll
 // bar whenever more text waits below.
 await ask('long');
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('worldlet:email-review',{detail:{id:'long-review',practice:true,draft:{from:'me@example.com',to:'sam@example.com',subject:'Re: Numbers',body:'Hi Sam,\n\nThe numbers come tomorrow.'}}})));
 await page.locator('.fox-email-review').waitFor();
 const lastCard=list.locator('.companion-thread-card').last();
 await lastCard.getByText('Last words.',{exact:false}).waitFor();
 const atEnd=()=>list.evaluate(l=>{const card=l.lastElementChild!.getBoundingClientRect(),box=l.getBoundingClientRect();return l.scrollHeight-l.clientHeight-l.scrollTop<=2&&card.bottom<=box.bottom+1;});
 assert.ok(await list.evaluate(l=>l.scrollHeight>l.clientHeight),'the fixture reply is taller than the thread');
 assert.ok(await atEnd(),'the reply above the review is shown to its last words');
 // RC UI review (Mac RC 3109, local-agent-flow): the list's top edge cut through the first line of the
 // reply above the email draft. Read at its end, the first line shown is whole.
 const cutLine=()=>list.evaluate(l=>{const top=l.getBoundingClientRect().top,walker=document.createTreeWalker(l,NodeFilter.SHOW_TEXT),range=document.createRange();for(let node=walker.nextNode();node;node=walker.nextNode()){range.selectNodeContents(node);for(const line of range.getClientRects())if(line.height&&line.top<top-.5&&line.bottom>top+.5)return node.textContent!.trim().slice(0,60);}return '';});
 assert.equal(await cutLine(),'','the top edge of the earlier turns cuts through no line of text');
 await lastCard.evaluate(card=>{(card as HTMLElement).style.fontSize='19px';});
 await page.waitForFunction(()=>{const l=document.querySelector('.companion-thread-list')!;return l.scrollHeight-l.clientHeight-l.scrollTop<=2;});
 assert.ok(await atEnd(),'a card that grows after it was placed keeps its last words in view');
 assert.equal(await cutLine(),'','after the card grows, the first line shown is still whole');
 assert.equal(await list.getAttribute('data-more'),'false');
 await list.evaluate(l=>{l.scrollTop=0;});
 await page.waitForFunction(()=>document.querySelector('.companion-thread-list')?.getAttribute('data-more')==='true');
 assert.equal(await list.evaluate(l=>getComputedStyle(l).scrollbarWidth),'thin','a scroll bar says more text waits below');
 await page.screenshot({path:path.join(shots,'chat-long-reply-review.png')});
 // Earlier turns stay readable over World art at every window size (#1652): the list never
 // fades them into the scenery and every card is opaque paper with normal text contrast,
 // also when the list is scrolled so the top card is cut by its edge, and the history stops
 // under the top-right corner controls instead of running beneath the weather.
 for(const [width,height] of [[1024,700],[1440,900],[1920,1080]]){
  await page.setViewportSize({width,height});
  await list.evaluate(l=>{l.scrollTop=Math.round((l.scrollHeight-l.clientHeight)/2);});
  await page.waitForFunction(()=>document.querySelector('.companion-thread-list')?.getAttribute('data-overflow')==='true');
  const problems=await list.evaluate(threadReadability);
  assert.deepEqual(problems,[],`earlier turns read clearly at ${width}×${height} beside an Applet`);
  const covered=await page.evaluate(()=>{const element=document.querySelector('.companion-thread-list')!,list=element.getBoundingClientRect();if(getComputedStyle(element).visibility==='hidden')return [];return [...document.querySelector('.notion-top')!.children].filter(c=>{const r=c.getBoundingClientRect();return list.height&&r.width&&r.height&&r.left<list.right&&r.right>list.left&&r.bottom>list.top;}).map(c=>c.className);});
  assert.deepEqual(covered,[],`the corner controls (date, weather, sounds, Tutorial) stand clear of the history at ${width}×${height}`);
  await page.screenshot({path:path.join(shots,`chat-history-${width}x${height}.png`)});
 }
 await page.setViewportSize({width:1440,height:900});

 // Fox's card in the World (owner Order 2026-10-07): one width from message to message, folded or expanded;
 // each new message heads the front card, also one added while Fox works on the previous one; and the
 // deck is one card edge behind it. The email review still open keeps Fox's card up.
 await enterWorld(false);
 const worldWidth=async()=>(await dialogue.boundingBox())!.width,width=await worldWidth(),asked=page.locator('.companion-asked');
 await ask('world two');
 assert.equal(await asked.textContent(),'world two','the second message heads the front card');
 assert.match(await front.textContent(),/Reply to world two/);
 assert.equal(await worldWidth(),width,'a new message does not change the card width');
 await ask('long world');
 assert.equal(await worldWidth(),width,'a long reply does not widen the card');
 const edges=await deck.locator('i').evaluateAll(items=>items.filter(i=>getComputedStyle(i).display!=='none').map(i=>({top:i.getBoundingClientRect().top,z:Number(getComputedStyle(i).zIndex)||0,border:getComputedStyle(i).borderTopColor,paper:getComputedStyle(i).backgroundColor})));
 const cardTop=(await dialogue.boundingBox())!.y;
 assert.equal(edges.length,1,'one card edge waits behind the front card: two cards in all (owner Order 2026-10-07)');
 assert.ok(cardTop-edges[0].top>=10,'the card edge steps out at least 10px: '+JSON.stringify({cardTop,edges}));
 await page.screenshot({path:path.join(shots,'world-deck.png')});
 await page.locator('.companion-earlier').click();
 await page.waitForFunction(()=>document.querySelector<HTMLElement>('#companionDialogue')?.dataset.sheet==='true');
 assert.equal(await worldWidth(),width,'expanded, the card keeps its width (no wider reading sheet)');
 await page.keyboard.press('Escape');await page.mouse.move(700,500);
 await type('wait world');await asked.filter({hasText:'wait world'}).waitFor();
 await type('and this too');
 await asked.filter({hasText:'and this too'}).waitFor();
 assert.equal(await page.evaluate(()=>(window as any).steered?.length),1,'the message joined the running turn');
 assert.equal(await front.getAttribute('data-working'),'true','the card still shows Fox working');
 assert.equal(await worldWidth(),width);
 await page.evaluate(()=>(window as any).holds['wait world']());await idle('wait world');
 assert.equal(await asked.textContent(),'and this too','the answer stays under the newest message, never the one before it');
 assert.match(await front.textContent(),/Reply to wait world and and this too/);
 await page.locator('.companion-earlier').click();await list.waitFor();
 // Turns about one thing are one stack (owner Order 2026-10-08): these all talk about the world, so the earlier
 // ones read as one card under the topic's name and count, showing the newest; its name opens it into its turns.
 const head=list.locator('.companion-topic-head');
 assert.equal(await list.locator('.companion-thread-card').count(),1,'one topic, one stack: '+JSON.stringify(await cardTexts()));
 assert.equal(await head.locator('.companion-topic-name').textContent(),'world one','the stack is named by its first question');
 assert.equal(await head.locator('.companion-topic-count').textContent(),'5','and says how many messages it holds (the World\'s greeting and four turns)');
 assert.match((await cardTexts())[0],/wait world$/,'the stack shows its newest message');
 assert.ok(await list.locator('.companion-thread-card.is-topic-stack').evaluate(c=>/,/.test(getComputedStyle(c).boxShadow)),'card edges peek out under the stack');
 await page.screenshot({path:path.join(shots,'world-topic-stack.png')});
 await head.click();
 assert.equal(await head.first().getAttribute('aria-expanded'),'true');
 const worldCards=await cardTexts();
 assert.match(worldCards.at(-1)!,/^wait world$/,'opened, the question before it waits in the stack as its own card: '+JSON.stringify(worldCards));
 assert.match(worldCards.join('\n'),/world two[\s\S]*long world[\s\S]*wait world$/,'oldest first');
 await head.first().click();
 assert.equal(await list.locator('.companion-thread-card').count(),1,'its name folds it again');
 await page.keyboard.press('Escape');
 // A phone-width window keeps the one width inside the window.
 await page.setViewportSize({width:390,height:844});await page.mouse.move(200,300);
 await page.locator('.companion-avatar').click();await dialogue.waitFor();
 const narrow=(await dialogue.boundingBox())!;
 assert.ok(narrow.x>=0&&narrow.x+narrow.width<=390,'the card fits a narrow window: '+JSON.stringify(narrow));
 await page.setViewportSize({width:1440,height:900});
 assert.deepEqual(errors,[]);
 console.log('PASS Fox chat: one session, one visible thread per context (World and Applet kept apart, restored on re-entry and reload); bottom-up thread where a new card pushes the others up; collapse keeps the newest card over a deck, a new message takes the front, the stack or toggle expands, the preference survives reload; in the World the card keeps one width, the newest message (an added one too) heads it and the deck edges read as cards. Screenshots: '+shots);
});
