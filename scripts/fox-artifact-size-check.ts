import assert from 'node:assert/strict';
import {withBrowser,fileAccess,pageErrors,worldUrl} from './browser-test.ts';
// Fox's artifacts have a size (owner decisions 2026-10-06 and 2026-10-07): a small or medium one sits above Fox, who stays in the
// middle; a large one takes the main stage while Fox and the conversation stand in the right-hand column.
// Fox may name the size; otherwise tables, charts and long bodies are large. The card's own control
// switches between them. Over an Applet it is a small card in the top-right corner. Bundled UI with a faked native bridge; fictional turns, no model or account.
// Usage: node scripts/fox-artifact-size-check.ts [screenshot directory]
const shots=process.argv[2];
const shot=async(page,name:string)=>{if(shots)await page.screenshot({path:shots+'/'+name+'.png'});};
const short='The **TAC** lab is the cheapest and fits the deadline.';
const table='**Cheapest that fits** TAC, two to three weeks.\n\n## Labs\n\n| Lab | Price | Weeks |\n| --- | --- | --- |\n| TAC Security | $540 | 2–3 |\n| Leviathan | $1,500 | 3–4 |\n| DEKRA | $4,500 | 4–6 |';
await withBrowser(fileAccess,async browser=>{
 const page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'});page.setDefaultTimeout(15000);
 const errors=pageErrors(page);
 await page.addInitScript(({short,table})=>{
  const artifacts={short:{title:'Which CASA lab',body:short,chart:null,size:null,actions:null},table:{title:'Three CASA labs',body:table,chart:null,size:null,actions:null}};
  (window as any).webkit={messageHandlers:{worldlet:{async postMessage(b){
   if(b.action==='snapshot')return {workspaceId:'x',revision:0,sources:[],knowledge:[],connections:[],onboarding:{completed:true},sampleEnabled:false,cloudConsent:true};
   if(b.action==='modelStatus')return {available:true,cloudAllowed:true};
   if(b.action==='foxPreferences')return {model:{name:'M',ready:true},cloudConsent:true,autoSync:true};
   if(b.action==='agentChat'){const args=artifacts[b.text];if(args){(window as any).lastArtifact=await (window as any).worldletAgentTool(b.id,{id:'a-'+b.text,name:'show_artifact',args});return {message:'Here it is.'};}return {message:'Short answer to '+b.text};}
   if(b.action==='cloudRequest')return {status:200,body:{configured:false,authorized:false}};
   return {ok:true};
  }}}};
 },{short,table});
 await page.goto(worldUrl());
 await page.locator('.companion-avatar').waitFor();
 const world=page.locator('#notionWorld'),card=page.locator('#foxArtifact'),dialogue=page.locator('#companionDialogue');
 const ask=async(text:string)=>{await page.locator('#notionInput').click();await page.locator('#notionInput').fill(text);await page.locator('#notionInput').press('Enter');await card.waitFor({state:'visible'});await dialogue.getByText('Here it is.',{exact:true}).waitFor();};
 const boxes=async()=>{await page.waitForTimeout(150);return {art:await card.boundingBox(),fox:await dialogue.boundingBox()};};

 await ask('short');
 assert.equal(await card.getAttribute('data-size'),'small','A short answer is a small artifact');
 assert.equal(await world.getAttribute('data-fox-lane'),'false','A small artifact keeps Fox in the middle');
 let {art,fox}=await boxes();
 assert.ok(art.y+art.height<=fox.y,'The small card sits above Fox '+JSON.stringify({art,fox}));
 assert.ok(art.width<=470,'The small card is narrow '+JSON.stringify(art));
 assert.equal(await card.locator('.fox-artifact-origin').textContent(),'From this conversation');
 await shot(page,'artifact-small');
 const smallWidth=art.width;

 // The size control grows a card a step at a time.
 await card.getByRole('button',{name:'Make artifact larger'}).click();
 assert.equal(await card.getAttribute('data-size'),'medium');
 assert.equal(await world.getAttribute('data-fox-lane'),'false','A medium artifact keeps Fox in the middle');
 ({art,fox}=await boxes());
 assert.ok(art.y+art.height<=fox.y&&art.width>smallWidth,'The medium card is wider, above Fox '+JSON.stringify({art,fox}));
 await shot(page,'artifact-medium');

 await card.getByRole('button',{name:'Make artifact larger'}).click();
 assert.equal(await card.getAttribute('data-size'),'large');
 await page.waitForFunction(()=>(document.querySelector('#notionWorld') as HTMLElement).dataset.foxLane==='true');
 ({art,fox}=await boxes());
 assert.ok(art.x+art.width<=fox.x,'The large card ends left of Fox '+JSON.stringify({art,fox}));
 assert.ok(art.height>500,'The large card uses the window height '+JSON.stringify(art));
 await shot(page,'artifact-large');

 await card.getByRole('button',{name:'Make artifact smaller'}).click();
 await page.waitForFunction(()=>(document.querySelector('#notionWorld') as HTMLElement).dataset.foxLane==='false');
 assert.equal(await card.getAttribute('data-size'),'medium');

 await ask('table');
 assert.equal(await card.getAttribute('data-size'),'medium','A small table is a medium artifact unless Fox says otherwise');
 assert.equal(await page.evaluate(()=>(window as any).lastArtifact?.size),'medium','Fox learns the size it got');
 await card.getByRole('button',{name:'Make artifact larger'}).click();
 await page.waitForFunction(()=>(document.querySelector('#notionWorld') as HTMLElement).dataset.foxLane==='true');
 await shot(page,'artifact-table-large');

 // Over an Applet the artifact is a small card in the top-right corner, at the head of Fox's column (owner Order 2026-10-07).
 await page.evaluate(()=>{location.hash='object=app-stripe';});
 await page.waitForFunction(()=>(document.querySelector('#notionWorld') as HTMLElement).dataset.depth==='object');
 await ask('short');
 ({art,fox}=await boxes());
 assert.ok(art.x+art.width>1440-40&&art.y<80,'The artifact sits in the top-right corner over an Applet '+JSON.stringify(art));
 assert.ok(art.x>=1440-Math.max(1440/3,464),'It stays in Fox\'s column and leaves the Applet in view '+JSON.stringify(art));
 assert.ok(art.y+art.height<=fox.y,'It sits above Fox\'s words '+JSON.stringify({art,fox}));
 assert.ok(art.height<=380,'It is a small card '+JSON.stringify(art));
 assert.equal(await card.locator('.fox-artifact-size').isVisible(),false,'The corner card has no size control');
 await shot(page,'artifact-in-applet');
 await page.evaluate(()=>{location.hash='';});
 await page.waitForFunction(()=>(document.querySelector('#notionWorld') as HTMLElement).dataset.depth!=='object');
 await ask('table');
 await card.getByRole('button',{name:'Make artifact larger'}).click();
 await page.waitForFunction(()=>(document.querySelector('#notionWorld') as HTMLElement).dataset.foxLane==='true');

 // A narrow window has no room for the column: the large card stacks above Fox.
 await page.setViewportSize({width:1100,height:800});
 await page.waitForFunction(()=>(document.querySelector('#notionWorld') as HTMLElement).dataset.foxLane==='false');
 ({art,fox}=await boxes());
 assert.ok(art.y+art.height<=fox.y,'A narrow window stacks the card above Fox '+JSON.stringify({art,fox}));
 await page.setViewportSize({width:1440,height:900});

 await card.getByRole('button',{name:'Close artifact'}).click();
 await card.waitFor({state:'hidden'});
 assert.equal(await world.getAttribute('data-artifact-size'),null,'Closing clears the size');
 await page.waitForFunction(()=>(document.querySelector('#notionWorld') as HTMLElement).dataset.foxLane==='false');
 assert.deepEqual(errors,[]);
 console.log('PASS artifact sizes: small and medium above Fox in the middle, large on the main stage with Fox in the right-hand column, Fox\'s choice or a default from the content, the card\'s own size control, a small card in the top-right corner over an Applet, a narrow window stacking, close clearing the size');
});
