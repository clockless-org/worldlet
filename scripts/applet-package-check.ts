import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {buildAppletRuntime} from './build-applet-runtime.ts';
import {APP_DEFINITIONS} from '../core/applets/catalog.ts';
import {validateAppletRuntimes,appletReadPlan} from '../core/applets/runtime.ts';
import {withTempDir} from './test-temp.ts';
await withTempDir('worldlet-applet-package-',async output=>{
 await buildAppletRuntime(process.cwd(),output);
 const registry=validateAppletRuntimes(JSON.parse(await readFile(path.join(output,'applet-runtime.json'),'utf8')));
 assert.deepEqual(registry.map(r=>r.key),APP_DEFINITIONS.map(a=>a.key));
 for(const app of APP_DEFINITIONS){
  const base=path.join(output,'applets',app.key);
  const authored=JSON.parse(await readFile(path.join(base,'runtime.json'),'utf8'));
  const [loaded]=validateAppletRuntimes([authored]);
  assert.deepEqual(loaded,registry.find(r=>r.key===app.key),'packaged manifest and host registry agree');
  const commands=JSON.parse(await readFile(path.join(base,'commands.json'),'utf8'));
  assert.equal(commands.appletId,app.id);
  assert.ok(commands.commands.some(c=>c.action==='launch'&&c.target==='applet:'+app.key));
  assert.match(await readFile(path.join(base,'applet.md'),'utf8'),/## Runtime/);
  if(loaded.mode==='scheduled')assert.equal(appletReadPlan(loaded,{},1800000000).provider,loaded.provider);
  else assert.throws(()=>appletReadPlan(loaded,{},1800000000));
 }
 console.log(`PASS ${registry.length} Applet packages: descriptions, commands, normalized host registry and scheduled admission`);
});
