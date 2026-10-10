import assert from 'node:assert/strict';
import {checkEdge,checkSource,checkRepository} from './architecture-boundaries.ts';
checkEdge('ui/hud/example.ts','core/tasks/index.ts');
checkEdge('core/tasks/example.ts','core/tasks/runtime-tasks.ts');
for(const source of [
 "import x from '../../core/tasks/runtime-tasks.ts'",
 "export * from 'core/tasks/runtime-tasks'",
 "const x=import('core/tasks/runtime-tasks')",
 "type T=import('core/tasks/runtime-tasks').T",
 "const x=require('../../core/tasks/index.ts')",
 "import x = require('../../core/tasks/index.ts')",
 "const x=import(name)",
 '/// <reference path="../../core/tasks/index.ts" />',
])assert.throws(()=>checkSource('ui/hud/example.ts',source),undefined,source);
assert.throws(()=>checkEdge('core/agent/example.ts','platform/bridge/index.ts'),/Forbidden/);
assert.throws(()=>checkEdge('ui/hud/example.ts','harness/example/agent.ts'),/Forbidden/);
assert.throws(()=>checkSource('contracts/example.ts',"import fs from 'node:fs'"),/pure layer/);
assert.throws(()=>checkSource('core/agent/example.ts','process.env.TOKEN'),/host global/);
assert.throws(()=>checkSource('ui/hud/example.ts','window.chrome.webview.postMessage({})'),/Host bridge/);
assert.throws(()=>checkSource('harness/example/tools.ts',"export {practiceTools} from '../../core/tools/practice.ts'"),/Forbidden/);
for(const branch of ["state.platform!=='windows'","platform != \"macos\"","platform==='windows'"])assert.throws(()=>checkSource('ui/hud/example.ts',branch),/capabilities/,branch);
checkRepository();
console.log('PASS resolved layer dependencies, public component APIs, exact exceptions and bypass rejection');
