import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {redactDiagnosticText,diagnosticLineCapture} from '../agent/app/index.ts';
import {sendOAuthCallbackPage} from '../platform/host/modules/sources/oauth-callback.ts';
import {createDiagnostics} from '../platform/host/diagnostics.ts';
import {assertOAuthCallback} from './oauth-callback-fixture.ts';
import {withTempDir} from './test-temp.ts';

const synthetic='fixture-private-value';
for(const input of [
 `https://user:${synthetic}@example.com/callback?code=${synthetic}&state=${synthetic}#${synthetic}`,
 `127.0.0.1:1234/callback?%63ode=${synthetic}&state=${synthetic}`,
 `Authorization: Bearer ${synthetic}`,
 ...['code','state','token','access_token','refresh_token','id_token','client_secret','code_verifier'].flatMap(key=>[`${key}=${synthetic}`,JSON.stringify({[key]:synthetic})])
])assert.ok(!redactDiagnosticText(input).includes(synthetic),'diagnostics omit OAuth fields and URL secrets');
assert.equal(redactDiagnosticText('A network request failed (503).'),'A network request failed (503).');
const lines:string[]=[],capture=diagnosticLineCapture(line=>lines.push(line));
capture('Authorization: Bearer ');capture(synthetic+'\n');
capture('https://example.com/callback?co');capture('de='+synthetic+'\n');
capture('token=');capture(synthetic.repeat(4000));capture('\nHealthy again\n');
capture('token='+synthetic); // An incomplete final record must never be flushed as a fragment.
assert.ok(!lines.join('').includes(synthetic));
assert.equal(lines.at(-1),'Healthy again\n');
assert.ok(lines.some(line=>line.includes('omitted')));
await withTempDir('worldlet-diagnostics-',dir=>{
 const diagnostics=createDiagnostics(dir);
 diagnostics.record(new Error(`failed: https://example.com/callback?code=${synthetic}`),'host',`token=${synthetic}`);
 assert.ok(!JSON.stringify(diagnostics.recent()).includes(synthetic));
 assert.ok(!fs.readFileSync(path.join(dir,'logs','diagnostics.jsonl'),'utf8').includes(synthetic));
});

const server=http.createServer((request,response)=>sendOAuthCallbackPage(response,request.url?.startsWith('/declined')?'declined':request.url?.startsWith('/stale')?'stale':'received'));
await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
try{
 const base=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
 for(const status of ['received','declined','stale'])await assertOAuthCallback(await fetch(`${base}/${status}?code=${synthetic}&state=fixture-state`));

}finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
console.log('PASS OAuth safety: fixed callback titles, no reflected parameters, no-store/no-referrer, diagnostic redaction across split and oversized lines');
