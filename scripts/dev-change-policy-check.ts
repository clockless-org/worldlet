import assert from 'node:assert/strict';
import {devChange} from './dev-change-policy.ts';
assert.equal(devChange(['docs/APPLET-RUNTIME.md','README.zh.md']),'none');
assert.equal(devChange(['agent/tasks/runtime-tasks.ts','docs/APPLET-RUNTIME.md']),'web');
assert.equal(devChange(['ui/index.ts','platform/host/modules/attention/center.ts']),'native');
assert.equal(devChange(['platform/desktop/src/main.ts']),'native');
assert.equal(devChange(['platform/desktop/distribution/Updates.json']),'native');
assert.equal(devChange(['harness/example/agent.py']),'native');
assert.equal(devChange(['resources/styles/builtin/assets/brand/mark.json']),'native');
assert.equal(devChange(['package-lock.json']),'native');
assert.equal(devChange(['']),'none');
console.log('PASS Dev integration keeps unrelated jobs running and distinguishes web/host changes');

assert.equal(devChange(['agent/tasks/runtime-tasks.ts','scripts/runtime-tasks-check.ts']),'web');
assert.equal(devChange(['platform/local-tools/sessions.py','scripts/sessions-portable-check.py']),'native');
