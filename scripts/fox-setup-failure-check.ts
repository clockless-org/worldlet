// Mac Fox setup failures name the step that stopped in plain words, not always "check your internet".
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {setupFailure} from '../platform/electron/src/modules/agent-runtime/setup-failure.ts';

const failed=(code:number,stderr:string)=>`Fox setup (bash, exit ${code}) could not finish: ${stderr}`;
assert.match(setupFailure('download',failed(6,'curl: (6) Could not resolve host: codeload.github.com\n')),/^Fox could not download its setup files from GitHub\. Check your internet connection/);
assert.match(setupFailure('verify',failed(12,'')),/did not match what this version of Worldlet expects/);
assert.match(setupFailure('lock',failed(13,'')),/another Worldlet window is still setting up/);
const python=setupFailure('python',failed(2,'Downloading cpython-3.12\nerror: Failed to install cpython-3.12.12-macos-aarch64-none\n  Caused by: Permission denied (os error 13)\n'));
assert.equal(python,'Fox could not get Python ready: Permission denied (os error 13). Ask Fox to try again. Your world and accounts are safe.');
const packages=setupFailure('dependencies',failed(1,'Resolved 120 packages\n\x1b[31merror\x1b[0m: Failed to build `pyaudio==0.2.14`\n'));
assert.equal(packages,'Fox could not install the Python packages it needs: Failed to build `pyaudio==0.2.14`. Ask Fox to try again. Your world and accounts are safe.');
assert.ok(!/internet/.test(packages));
assert.ok(setupFailure('validate',failed(1,'x'.repeat(400)+' error')).length<320);
// Every fresh Mac install failed when install.sh removed its own working directory: uv then
// stops with "Current directory does not exist". It must leave the stage before removing it,
// and the app must not start it inside the stage.
const script=fs.readFileSync(new URL('../harness/hermes/install.sh',import.meta.url),'utf8');
assert.ok(script.indexOf('cd "$(/usr/bin/dirname "$stage")"')>=0&&script.indexOf('cd "$(/usr/bin/dirname "$stage")"')<script.indexOf('/bin/rm -rf "$stage"\n'),'install.sh leaves the stage before removing it');
assert.ok(!/\$\(\$uv /.test(script),'install.sh quotes the uv path');
// Importing Hermes during validation creates a profile; it stays in the stage, never in ~/.hermes.
assert.ok(/HERMES_HOME="\$stage\/validate-home"/.test(script)&&/return "\$status"/.test(script),'install.sh validates with a stage HERMES_HOME and keeps the import result');
// RC d7e2bc2b: codeload.github.com answered 429 four times in 7 s and setup gave up. curl
// waits 1, 2, 4… s between retries; together they must cover at least two minutes.
const retries=Number(/--retry (\d+) /.exec(script)?.[1]),retryTime=Number(/--retry-max-time (\d+) /.exec(script)?.[1]);
assert.ok(2**retries-1>=120&&retryTime>=120&&/--retry-all-errors/.test(script),'install.sh keeps retrying a throttled download for minutes');
const installation=fs.readFileSync(new URL('../platform/electron/src/modules/agent-runtime/installation.ts',import.meta.url),'utf8');
assert.match(installation,/install\.sh'\),this\.root,bootstrap\],[^\n]*\),path\.dirname\(this\.root\),true,/,'install.sh starts outside the stage');
console.log('Fox setup failure messages and installer working directory: ok');
