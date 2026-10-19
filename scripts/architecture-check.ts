import assert from 'node:assert/strict';
import {checkEdge,checkSource,checkRepository} from './architecture-boundaries.ts';
checkEdge('ui/world/example.ts','agent/tasks/index.ts');
checkEdge('agent/tasks/example.ts','agent/tasks/runtime-tasks.ts');
for(const source of [
 "import x from '../../agent/tasks/runtime-tasks.ts'",
 "export * from 'agent/tasks/runtime-tasks'",
 "const x=import('agent/tasks/runtime-tasks')",
 "type T=import('agent/tasks/runtime-tasks').T",
 "const x=require('../../agent/tasks/index.ts')",
 "import x = require('../../agent/tasks/index.ts')",
 "const x=import(name)",
 '/// <reference path="../../agent/tasks/index.ts" />',
])assert.throws(()=>checkSource('ui/world/example.ts',source),undefined,source);
assert.throws(()=>checkEdge('agent/gate/example.ts','platform/bridge/index.ts'),/Forbidden/);
// Context imports only itself and contracts; Agent imports Context and contracts (#681).
assert.throws(()=>checkEdge('context/store/example.ts','agent/tasks/index.ts'),/Forbidden/);
assert.throws(()=>checkEdge('context/store/example.ts','agent/index.ts'),/Forbidden/);
checkEdge('agent/tasks/example.ts','context/store/index.ts');
checkEdge('platform/desktop/src/example.ts','agent/index.ts');
assert.throws(()=>checkEdge('ui/world/example.ts','harness/example/agent.ts'),/Forbidden/);
assert.throws(()=>checkSource('contracts/example.ts',"import fs from 'node:fs'"),/pure layer/);
assert.throws(()=>checkSource('agent/gate/example.ts','process.env.TOKEN'),/host global/);
assert.throws(()=>checkSource('ui/world/example.ts','window.chrome.webview.postMessage({})'),/Host bridge/);
assert.throws(()=>checkSource('harness/example/tools.ts',"export {practiceTools} from '../../agent/gate/practice.ts'"),/Forbidden/);
for(const branch of ["state.platform!=='windows'","platform != \"macos\"","platform==='windows'"])assert.throws(()=>checkSource('ui/world/example.ts',branch),/capabilities/,branch);
// api/ reaches into any component for the operations repository; nothing here imports it.
checkEdge('api/build.ts','ui/world/world-layout.ts');
assert.throws(()=>checkEdge('ui/world/example.ts','api/build.ts'),/Forbidden/);
assert.throws(()=>checkEdge('agent/tasks/example.ts','api/checks.ts'),/Forbidden/);
// One way in to Context (#676): UI only reads, and only context/connectors writes Synced.
checkSource('ui/world/example.ts',"import {contextReader} from '../../context/store/index.ts'");
for(const source of [
 "import {contextWriter} from '../../context/store/index.ts'",
 "import {contextWriter as write} from '../../context/store/index.ts'",
 "import * as store from '../../context/store/index.ts'",
 "export * from '../../context/store/index.ts'",
 "import {connectorWriter} from '../../context/connectors/index.ts'",
])assert.throws(()=>checkSource('ui/world/example.ts',source),/UI/,source);
checkSource('agent/gate/example.ts',"import {contextWriter} from '../../context/store/index.ts'");
checkSource('context/connectors/example.ts',"import {syncedWriter} from '../store/index.ts'");
checkSource('platform/host/modules/sources/example.ts',"import {connectorWriter} from '../../../../context/connectors/index.ts'");
for(const file of ['agent/gate/example.ts','context/applets/example.ts','platform/host/modules/sources/example.ts'])
 assert.throws(()=>checkSource(file,`import {syncedWriter} from '${'../'.repeat(file.split('/').length-1)}context/store/index.ts'`),/only context\/connectors writes Synced/,file);
checkRepository();
console.log('PASS resolved layer dependencies, public component APIs, Context reads and writes, exact exceptions and bypass rejection');
