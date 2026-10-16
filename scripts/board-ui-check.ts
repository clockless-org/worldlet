import assert from 'node:assert/strict';
import fs from 'node:fs';
import {resolveBoard,readBoardDefinition} from '../core/board/index.ts';
import type {ServicePreset} from '../contracts/service-presets.ts';
import {withBrowser,bundleScript,pageErrors} from './browser-test.ts';

const preset:ServicePreset={id:'metrics',name:'Metrics',provider:'posthog',read:{operation:'query',query:'SELECT 1'},createdAt:'2026-10-15T12:00:00Z',updatedAt:'2026-10-15T12:00:00Z'};
const definition=readBoardDefinition({title:'Product board',tabs:[{id:'overview',title:'Overview',blocks:[
 {id:'count',title:'Installs',kind:'number',preset:'metrics',field:'installed',goodAtLeast:100},
 {id:'funnel',title:'Conversion',kind:'funnel',preset:'metrics',steps:[{field:'visited',label:'Visited'},{field:'installed',label:'Installed'}]},
 {id:'trend',title:'Daily installs',kind:'trend',preset:'metrics',x:'day',y:'installed'},
 {id:'list',title:'Recent changes',kind:'list',preset:'metrics',fields:['day']},
 {id:'missing',title:'Disconnected source',kind:'number',preset:'missing'},
 ]},{id:'empty',title:'Later',blocks:[]}]});
const view=resolveBoard(definition,[preset],{metrics:{records:{provider:'posthog',operation:'query',scope:'Synthetic metrics · Read only',records:[
 {id:'1',title:'Release notes',url:'https://example.com/notes',fields:{visited:1000,installed:120,day:'Monday'}},
 {id:'2',title:'<img src=x onerror=alert(1)>',url:'javascript:alert(1)',fields:{visited:1500,installed:150,day:'Tuesday'}},
 {id:'3',title:'Private-user URL',url:'https://user:password@example.com/',fields:{visited:1600,installed:180,day:'Wednesday'}},
]}}},'2026-10-15T12:00:00Z');
await withBrowser(async browser=>{
 const page=await browser.newPage({viewport:{width:1000,height:1000}}),errors=pageErrors(page,{console:true});
 await page.setContent('<!doctype html><title>Worldlet board settings check</title><main class="native-console"><section class="companion-info-panel" open><div class="companion-info-body" id="fixture"></div></section></main>');
 for(const file of ['ui/companion/companion-panel.css','ui/components/hud.css'])await page.addStyleTag({content:fs.readFileSync(file,'utf8')});
 await page.addStyleTag({content:'.native-console{font:14px system-ui;--ui-font-ui:system-ui;--ui-paper:#fcfaf5;--hud-paper-ink:#203b30;--hud-muted:#5b6b60}.native-console .companion-info-panel{position:relative;inset:auto;transform:none;width:min(900px,calc(100vw - 32px));max-width:none;height:850px;max-height:calc(100vh - 32px);margin:16px auto;display:flex;padding:0;box-sizing:border-box}.companion-settings{width:100%}'});
 await page.addScriptTag({content:await bundleScript({entryPoints:['ui/companion/companion-settings.ts'],globalName:'Settings'})});
 await page.evaluate(async fixture=>{
  const w=window as any;w.calls=[];w.answer={view:fixture,definition:{},revision:1};
  const call=async(action:string,body:any={})=>{w.calls.push({action,...body});if(action==='board'){if(w.slow)return await new Promise(resolve=>w.finish=resolve);return structuredClone(w.answer);}return {};};
  const node=()=>document.createElement('div');
  w.settings=w.Settings.createCompanionSettings({call,host:()=>undefined,pages:{fox:node(),phone:node(),knows:node()},records:{records:node(),showRecords(){}},onShow(){},close(){},openFeedback(){},replayTutorial(){}});
  document.querySelector('#fixture')!.append(w.settings.element);
 },view);
 assert.equal(await page.title(),'Worldlet board settings check');
 assert.equal(await page.evaluate(()=>(window as any).calls.length),0,'constructing settings never reads the board');
 await page.locator('[data-setting="board"]').click();
 await page.getByText('Product board',{exact:true}).waitFor();
 const board=page.locator('.companion-board');
 assert.match(await board.innerText(),/120/);assert.match(await board.innerText(),/12%/);assert.match(await board.innerText(),/Change from previous: \+30/);
 assert.match(await board.innerText(),/No Service preset named/);
 assert.equal(await board.locator('img').count(),0,'provider markup is only text');
 assert.equal(await board.getByRole('link').count(),1,'script and userinfo links are not actionable');
 assert.equal(await board.getByRole('link').getAttribute('rel'),'noopener noreferrer');
 await board.getByText('Show values',{exact:true}).click();
 assert.equal(await board.locator('details[open] td').count(),6);
 await board.getByRole('button',{name:'Later',exact:true}).click();
 await board.getByText('This tab has no blocks yet.',{exact:true}).waitFor();
 assert.equal(await page.evaluate(()=>(window as any).calls.filter(c=>c.action==='board').length),1,'switching tabs never repeats provider reads');
 await board.getByRole('button',{name:'Overview',exact:true}).click();
 await board.getByRole('button',{name:'Refresh board',exact:true}).click();
 await page.waitForFunction(()=>(window as any).calls.filter(c=>c.action==='board').length===2);
 await page.evaluate(()=>{(window as any).answer={error:'World context is no longer allowed.'};});
 await board.getByRole('button',{name:'Refresh board',exact:true}).click();
 await board.getByText('World context is no longer allowed.',{exact:true}).waitFor();
 assert.equal(await board.locator('[data-block]').count(),0,'a whole-board authorization failure clears old values');
 await page.evaluate(()=>{(window as any).answer={view:null};});
 await board.getByRole('button',{name:'Refresh board',exact:true}).click();
 await board.getByText(/No board yet/).waitFor();
 await page.evaluate(()=>{(window as any).slow=true;});
 await board.getByRole('button',{name:'Refresh board',exact:true}).click();
 await page.locator('[data-setting="fox"]').click();
 await page.evaluate(fixture=>{const w=window as any;w.finish({view:fixture});w.slow=false;w.answer={view:fixture};},view);
 assert.equal(await page.locator('.companion-board').count(),0,'a late board response cannot replace the new settings page');
 await page.locator('[data-setting="board"]').click();
 await page.getByText('Product board',{exact:true}).waitFor();
 const calls=await page.evaluate(()=>(window as any).calls.filter(c=>c.action==='board'));
 assert.ok(calls.length>=4);assert.ok(calls.every(c=>JSON.stringify(c)===JSON.stringify({action:'board',operation:'read'})),'all board requests use only the existing read protocol');
 assert.deepEqual(errors,[]);
 const screenshot=process.argv.includes('--screenshot')?process.argv[process.argv.indexOf('--screenshot')+1]:'';
 if(screenshot)await page.screenshot({path:screenshot,fullPage:true});
 await page.setViewportSize({width:390,height:844});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'the board does not overflow the narrow viewport');
 if(screenshot)await page.screenshot({path:screenshot.replace(/\.png$/,'-narrow.png'),fullPage:true});
 await board.locator('[data-block=missing]').scrollIntoViewIfNeeded();
 assert.ok(await board.locator('[data-block=missing]').isVisible(),'the final block remains reachable in the scrolling narrow settings pane');
 assert.ok(await page.evaluate(()=>document.querySelector('.companion-settings-detail')!.scrollTop>0));
 if(screenshot)await page.screenshot({path:screenshot.replace(/\.png$/,'-narrow-scrolled.png'),fullPage:true});
});
console.log('PASS board settings: real settings entry, four resolved block types, read-only protocol, tabs, refresh, empty/error states, unsafe content, navigation race and narrow layout');
