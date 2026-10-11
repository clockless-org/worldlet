import {chromium,type Browser,type BrowserContext,type LaunchOptions,type Page} from 'playwright';
import {build,type BuildOptions} from 'esbuild';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

// Shared UI fixtures use an installed Windows browser and the normal Playwright
// runtime elsewhere. Metal is a Mac-only renderer choice, not a fixture contract.
// Every page of this browser waits for the World to finish starting when it loads the built World (waitForWorld).
export async function launchTestBrowser(options:LaunchOptions={}){
 const browser=await chromium.launch({...(process.platform==='win32'?{channel:'msedge'}:{}),...options,
  args:[...(process.platform==='darwin'?['--use-angle=metal']:[]),...(options.args||[])]});
 const newContext=browser.newContext.bind(browser);
 browser.newContext=async(...args)=>worldPages(await newContext(...args));
 return browser;
}
// The World's startup ends when its loader (#worldStartup) is gone, has become the setup pages, or says it failed;
// the check's own assertions take it from there. The Mac release host starts the World far slower than a Linux
// cloud host, four checks at a time: checks that waited only for their own elements timed out while it was still
// starting (fox-artifact-size on Mac RC, owner request 2026-10-05), so the wait is one shared, generous step.
export const WORLD_READY_TIMEOUT_MS=120000;
export async function waitForWorld(page:Page,timeout=WORLD_READY_TIMEOUT_MS){
 // A locator wait polls from Playwright's own world, so a page's fake clock (page.clock) cannot stall it.
 try{await page.locator('#worldStartup:not([data-phase=setup]):not([data-failed=true])').waitFor({state:'detached',timeout});}
 catch(error){
  const phase=await page.locator('#worldStartupPhase').textContent({timeout:1000}).catch(()=>null);
  throw new Error(`The World had not finished starting after ${timeout/1000} s${phase?` (its loader says "${phase}")`:''}`,{cause:error});
 }
}
// Pages that load the built World (worldUrl, with any query or hash) wait for its startup after goto and reload.
const isWorld=(url:string)=>{try{const u=new URL(url),w=new URL(worldUrl());return u.protocol==='file:'&&u.pathname===w.pathname;}catch{return false;}};
const watched=new WeakSet<Page>();
function worldPage(page:Page){
 if(watched.has(page))return page;watched.add(page);
 for(const name of ['goto','reload'] as const){
  const original=(page[name] as (...args:unknown[])=>Promise<unknown>).bind(page);
  (page as any)[name]=async(...args:unknown[])=>{const response=await original(...args);if(isWorld(page.url()))await waitForWorld(page);return response;};
 }
 return page;
}
// The checks measure the default look, frosted glass included, so every page asks for full transparency whatever the
// host says: a Mac with no graphics acceleration (CI's hosted runners) reports Reduce Transparency, which turns the
// glass off (ui/components/hud.css) and failed every material check there.
export async function fullTransparency(page:Page){
 try{await (await page.context().newCDPSession(page)).send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-transparency',value:'no-preference'}]});}
 catch{/* a browser without the Chrome DevTools Protocol keeps the host's setting */}
 return page;
}
function worldPages(context:BrowserContext){
 context.on('page',worldPage);
 const newPage=context.newPage.bind(context);
 context.newPage=async()=>worldPage(await fullTransparency(await newPage()));
 return context;
}
// Chromium's fake camera and microphones, with the host's audio devices left alone: --disable-audio-input/output
// make the audio service use its fake audio manager, so no check opens the host's real default input or output.
// (Mac RC 2026.1004.2792: AirPods in their case became 02's default input and getUserMedia on the fake devices
// still hung four minutes in CoreAudio, then failed with NotReadableError.)
export const fakeMedia=['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--disable-audio-input','--disable-audio-output'];
// Lets a page loaded from file:// read the built UI's other files.
export const fileAccess:LaunchOptions={args:['--allow-file-access-from-files']};
// Launches the test browser, runs the check and always closes the browser, as try/finally did.
export async function withBrowser<T>(options:LaunchOptions|((browser:Browser)=>Promise<T>),run?:(browser:Browser)=>Promise<T>):Promise<T>{
 if(typeof options==='function'){run=options;options={};}
 const browser=await launchTestBrowser(options);
 try{return await run!(browser);}finally{await browser.close();}
}
// The page's uncaught errors (and, with console, its console errors) in the order they happen.
export function pageErrors(page:Page,{console:consoleErrors=false}={}):string[]{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 if(consoleErrors)page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 return errors;
}
export const fileUrl=(...parts:string[])=>pathToFileURL(path.resolve(...parts)).href;
// The built World UI (npm run build:native-ui).
export const worldUrl=()=>fileUrl('dist/WorldletWeb/index.html');
// Bundles UI source in memory into one script text for page.addScriptTag or setContent (an IIFE unless options say otherwise).
export async function bundleScript(options:BuildOptions):Promise<string>{
 return (await build({bundle:true,write:false,format:'iife',...options})).outputFiles![0].text;
}
// Settings beside Fox opens the companion panel, one list of sections (owner request 2026-10-10), on Your Agent or the
// section last chosen; the checks that read another page name it by its old tab name or its section id.
export const SETTINGS_BUTTON='.companion-side .companion-panel-button';
export const COMPANION_SECTION:Record<string,string>={Profile:'fox',Energy:'model',History:'history',Mobile:'phone',Feedback:'feedback'};
export async function openCompanionPanel(page:Page,tab='Profile'){
 await page.locator(SETTINGS_BUTTON).click();
 const panel=page.locator('#companionInfo');await panel.waitFor();
 await panel.locator('.companion-settings-list [aria-current=true]').waitFor({timeout:5000});
 if(tab!=='Settings')await openCompanionSection(page,tab);
}
/** Chooses a section in the companion panel's list: an old tab name (Profile, Mobile, …) or a section id. */
export async function openCompanionSection(page:Page,section:string){
 const id=COMPANION_SECTION[section]??section;
 await page.locator(`#companionInfo .companion-settings-list [data-setting="${id}"]`).click();
 await page.locator(`#companionInfo .companion-settings-list [data-setting="${id}"][aria-current=true]`).waitFor();
}
// Leaves the open Applet the way a person does: Back in its top bar, or on a website page, whose toolbar's Back and
// Forward move through the page's own history, World beside Fox (owner request 2026-10-06).
export async function leaveApplet(page:Page){
 if(await page.locator('.browser-toolbar>.browser-back[data-web-page]').count())await page.locator('.fox-action-left [data-slot=home]').click();
 else await page.getByRole('button',{name:'Back to previous level'}).click();
}
