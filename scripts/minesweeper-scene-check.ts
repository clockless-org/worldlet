/** Live Minesweeper controls remain usable when distributed around a projected board. */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {MINE_FIELDS,newMineState,actOnMine} from '../core/games/index.ts';
import {bundleScript,withBrowser,pageErrors} from './browser-test.ts';
const script=await bundleScript({stdin:{contents:"export {createGameApplet,mountAppletScene} from './ui/applets/index.ts';export {createMinesweeper} from './ui/games/minesweeper.ts';",resolveDir:process.cwd(),loader:'ts'},globalName:'Games'});
const css=(await Promise.all(['dist/WorldletWeb/worldlet-ui.css','ui/applets/scene/applet-scene.css'].map(p=>readFile(p,'utf8')))).join('\n');
const model=actOnMine(newMineState(MINE_FIELDS.compact),0,'dig',0,()=>0),mine=[...model.mines][0];
await withBrowser(async browser=>{
 const page=await browser.newPage({viewport:{width:1500,height:844},reducedMotion:'reduce'}),errors=pageErrors(page);
 await page.route('http://mines.test/',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><title>Mines scene fixture</title>'}));await page.goto('http://mines.test/');
 await page.setContent('<style>'+css+'#notionWorld{position:fixed;inset:0}.panel-scene{position:absolute;inset:0}#notionContent{position:absolute;z-index:30}</style><main id="notionWorld"><div class="panel-scene"></div><section id="notionContent" class="notion-content" data-template="game"></section></main>');await page.addScriptTag({content:script});
 await page.evaluate(()=>{
  const w=window as any,world=document.getElementById('notionWorld')!,content=document.getElementById('notionContent')!;
  const pixel='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jM1sAAAAASUVORK5CYII=';
  w.scene=w.Games.mountAppletScene(document.querySelector('.panel-scene'),'minesweeper',{shell:world,source:{background:pixel,registration:{imageSize:[1500,844],sha256:'0'.repeat(64),regions:[{id:'main',role:'primary',rect:[.3,.3,.4,.4],quad:[[.08,0],[.92,0],[1,1],[0,1]],material:'board'},{id:'heading',role:'secondary',rect:[.35,.05,.3,.1],material:'board'},{id:'toolbar',role:'secondary',rect:[.32,.17,.36,.06],material:'board'},{id:'controls',role:'secondary',rect:[.33,.8,.34,.15],material:'board'}],companion:[.02,.9,.25,.06]}}});world.dataset.panelScene='minesweeper';Math.random=()=>0;w.game=w.Games.createGameApplet('minesweeper','Minesweeper');content.append(w.game.element);w.game.setScene(w.scene);
 });
 const cells=page.locator('.mines-cell'),board=page.locator('.mines-board'),time=page.locator('.game-metric[data-metric=time] strong');
 assert.equal(await cells.count(),30);assert.equal(await page.locator('.game-region').count(),3);assert.equal(await time.innerText(),'00:00');
 await page.getByRole('button',{name:'Flag',exact:true}).click();await cells.last().click();assert.equal(await cells.last().getAttribute('data-state'),'flag');assert.equal(await page.locator('.game-metric[data-metric=mines] strong').innerText(),'9');
 await cells.last().click({button:'right'});assert.equal(await cells.last().getAttribute('data-state'),'closed');await page.getByRole('button',{name:'Reveal',exact:true}).click();await cells.first().click();assert.equal(await cells.first().getAttribute('data-state'),'open');
 await page.waitForFunction(()=>document.querySelector('.game-metric[data-metric=time] strong')?.textContent!=='00:00');
 await cells.nth(mine).click();assert.equal(await board.getAttribute('data-state'),'lost');assert.match(await page.locator('.game-hint').innerText(),/Boom/);const ended=await time.innerText();await page.waitForTimeout(1100);assert.equal(await time.innerText(),ended,'terminal time freezes');
 await page.getByRole('button',{name:'New game',exact:true}).click();assert.equal(await time.innerText(),'00:00');await cells.first().click();
 for(let i=0;i<30;i++)if(!model.mines.has(i)&&await cells.nth(i).getAttribute('data-state')==='closed')await cells.nth(i).click();
 assert.equal(await board.getAttribute('data-state'),'won');assert.match(await page.locator('.game-hint').innerText(),/Cleared in/);assert.ok(await page.evaluate(()=>Number(localStorage.getItem('worldlet-game-best:minesweeper:compact')))>0);assert.equal(await page.evaluate(()=>localStorage.getItem('worldlet-game-best:minesweeper')),null,'compact score does not overwrite classic');
 await page.getByRole('combobox',{name:'Board size'}).selectOption('classic');assert.equal(await cells.count(),100);await cells.last().focus();await page.keyboard.press('f');assert.equal(await cells.last().getAttribute('data-state'),'flag');await page.keyboard.press('ArrowLeft');assert.equal(await cells.nth(98).evaluate(e=>e===document.activeElement),true);
 await page.evaluate(()=>{const w=window as any;w.game.setScene(null);w.scene.destroy();});assert.equal(await page.locator('.game-panel .game-header').count(),1);assert.equal(await page.locator('.game-panel .game-footer').count(),1);assert.equal(await cells.count(),100);
 await page.evaluate(()=>{const w=window as any;w.game.dispose();w.game.element.remove();w.paints=0;w.timerGame=w.Games.createMinesweeper({status(){w.paints++;},best:{get:()=>0,set(){}}});document.body.append(w.timerGame.element);w.timerGame.element.querySelector('button').click();});
 await page.waitForFunction(()=>(window as any).paints>2);const stopped=await page.evaluate(()=>{const w=window as any;w.timerGame.dispose();return w.paints;});await page.waitForTimeout(1100);assert.equal(await page.evaluate(()=>(window as any).paints),stopped,'disposed board repaints nothing even if still connected');
 assert.deepEqual(errors,[]);console.log('PASS Minesweeper scene: projected input, mode/keyboard flags, live/frozen timer, win/loss/reset, isolated best, board-size switching and disposal at 1500 × 844');
});
