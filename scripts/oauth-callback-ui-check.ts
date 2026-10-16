import assert from 'node:assert/strict';
import http from 'node:http';
import {sendOAuthCallbackPage} from '../platform/electron/src/modules/sources/oauth-callback.ts';
import {withBrowser} from './browser-test.ts';
// Browser-specific CSP coverage belongs to the UI suite; fast CI needs no Chromium installation.
const server=http.createServer((_request,response)=>sendOAuthCallbackPage(response,'received'));
await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
try{
 const base=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
 await withBrowser(async browser=>{
  const page=await browser.newPage(),errors:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(`${base}/callback?code=fixture-code&state=fixture-state#fixture-token`);
  assert.equal(await page.title(),'Worldlet sign-in');
  assert.equal(page.url(),base+'/callback','the CSP permits removing the current callback query and fragment');
  assert.deepEqual(errors,[]);
 });
}finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
console.log('PASS OAuth callback in Chromium: fixed title and working CSP remove the query and fragment');
