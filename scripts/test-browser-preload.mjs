// Loaded with `node --import` into each test:ui check when WORLDLET_TEST_BROWSER names a Chromium: every
// chromium.launch and launchPersistentContext that names no executablePath uses it. A cloud session's image ships an
// older Chromium than this checkout's Playwright downloads, and most checks launch Playwright's own (scripts/test-ui.mjs).
import {chromium} from 'playwright';

const executablePath=process.env.WORLDLET_TEST_BROWSER;
if(executablePath){
 for(const method of ['launch','launchPersistentContext']){
  const original=chromium[method].bind(chromium);
  chromium[method]=method==='launch'
   ?(options={})=>original({...options,executablePath:options.executablePath||executablePath})
   :(dir,options={})=>original(dir,{...options,executablePath:options.executablePath||executablePath});
 }
}
