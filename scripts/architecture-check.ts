import assert from 'node:assert/strict';
import {checkEdge,checkSource,checkRepository} from './architecture-boundaries.ts';
checkEdge('ui/hud/example.ts','agent/tasks/index.ts');
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
])assert.throws(()=>checkSource('ui/hud/example.ts',source),undefined,source);
assert.throws(()=>checkEdge('agent/agent/example.ts','platform/bridge/index.ts'),/Forbidden/);
// Context imports only itself and contracts; Agent imports Context and contracts (#681).
assert.throws(()=>checkEdge('context/items/example.ts','agent/tasks/index.ts'),/Forbidden/);
assert.throws(()=>checkEdge('context/items/example.ts','agent/index.ts'),/Forbidden/);
checkEdge('agent/tasks/example.ts','context/items/index.ts');
checkEdge('platform/electron/src/example.ts','agent/index.ts');
assert.throws(()=>checkEdge('ui/hud/example.ts','harness/example/agent.ts'),/Forbidden/);
assert.throws(()=>checkSource('contracts/example.ts',"import fs from 'node:fs'"),/pure layer/);
assert.throws(()=>checkSource('agent/agent/example.ts','process.env.TOKEN'),/host global/);
assert.throws(()=>checkSource('ui/hud/example.ts','window.chrome.webview.postMessage({})'),/Host bridge/);
assert.throws(()=>checkSource('harness/example/tools.ts',"export {practiceTools} from '../../agent/tools/practice.ts'"),/Forbidden/);
for(const branch of ["state.platform!=='windows'","platform != \"macos\"","platform==='windows'"])assert.throws(()=>checkSource('ui/hud/example.ts',branch),/capabilities/,branch);
checkRepository();
console.log('PASS resolved layer dependencies, public component APIs, exact exceptions and bypass rejection');
