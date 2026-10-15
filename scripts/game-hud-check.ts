// Native games have separate scenes/actions; websites retain a stable, timber-framed viewport.
import assert from 'node:assert/strict';
import {withBrowser,fileAccess,worldUrl,pageErrors,leaveApplet} from './browser-test.ts';
await withBrowser(fileAccess,async browser=>{
 const page=await browser.newPage({viewport:{width:1500,height:844},reducedMotion:'reduce'}),errors=pageErrors(page);
 page.setDefaultTimeout(15000);
 await page.addInitScript(()=>{(window as any).calls=[];(window as any).webkit={messageHandlers:{worldlet:{async postMessage(b:any){(window as any).calls.push(b);if(b.action==='snapshot')return {workspaceId:'game-hud-check',revision:0,sources:[],knowledge:[],worldItems:[],connections:[],onboarding:{completed:true},sampleEnabled:true};if(b.action==='modelStatus')return {available:false};return {ok:true};}}}};});
 await page.goto(worldUrl());
 await page.waitForFunction(()=>document.querySelector<any>('#notionWorld')?.sceneMetrics?.camera?.settled);
 for(const key of ['game-2048','snake','minesweeper','sudoku']){
  await page.evaluate(k=>location.hash='object=app-'+k,key);
  const panel=page.locator('.game-panel');await panel.waitFor();
  assert.equal(await panel.evaluate(el=>el.classList.contains('ui-applet-surface')),false);
  assert.equal(await page.locator('#notionContent .notion-close').isVisible(),false,'no redundant corner close');
  const board=panel.locator('.game-board');await board.waitFor();
  // The board sits in its theme scene's board region (ui/applets/scene), the painting framing it.
  await page.locator(`.panel-scene .applet-scene[data-applet="${key}"][data-painted=true]`).waitFor();
  const [content,region]=await Promise.all(['#notionContent',`.panel-scene .applet-scene[data-applet="${key}"] .applet-scene-region[data-role=primary]`].map(s=>page.locator(s).boundingBox()));
  assert.ok(Math.abs(content!.x-region!.x)<2&&Math.abs(content!.width-region!.width)<2,key+' on its scene region '+JSON.stringify({content,region}));
  await panel.getByRole('button',{name:'New game',exact:true}).click();
  assert.ok(await panel.evaluate(el=>el.contains(document.activeElement)),'reset returns focus to the game');
  assert.ok(await page.getByRole('button',{name:'Back to previous level'}).isVisible());
  for(const size of [{width:1500,height:844}]){
   await page.setViewportSize(size);await page.waitForTimeout(150);
   const box=(await board.boundingBox())!;assert.ok(box.x>=0&&box.x+box.width<=size.width,'native board fits '+key);
   await panel.getByRole('button',{name:'New game',exact:true}).scrollIntoViewIfNeeded();
  }
  if(process.env.GAME_HUD_SHOTS)await page.screenshot({path:`${process.env.GAME_HUD_SHOTS}/${key}.png`});
 }
 await page.evaluate(()=>location.hash='object=app-random-game');await page.locator('.browser-viewport').waitFor();
 const frame=page.locator('#notionContent');
 // The Random game's page sits in the game booth scene (ui/applets/scene/scene-family.ts): the painting is its frame.
 await page.locator('.panel-scene .applet-scene[data-applet="random-game"][data-painted=true]').waitFor();
 assert.ok(await frame.isVisible(),'the page panel shows in the booth');
 for(const size of [{width:1500,height:844}]){
  await page.setViewportSize(size);await page.waitForTimeout(200);
  const viewport=await page.locator('.browser-viewport').boundingBox();assert.ok(viewport&&viewport.width>100&&viewport.height>100&&viewport.x>=0&&viewport.x+viewport.width<=size.width,'website viewport remains bounded');
  if(process.env.GAME_HUD_SHOTS)await page.screenshot({path:`${process.env.GAME_HUD_SHOTS}/website-${size.width}.png`});
 }
 await leaveApplet(page);
 assert.deepEqual(errors,[]);console.log('PASS four native game HUDs, restart focus, navigation, the game booth around the website at 1500 × 844.');
});
