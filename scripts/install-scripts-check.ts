// The one-line installers (platform/install/README.md): shell syntax, the same Agent ids as setup, checksum and
// signature checks before installing, and the `--connect` hand-off to the app.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {existsSync,readFileSync,realpathSync} from 'node:fs';
import path from 'node:path';

const sh=readFileSync('platform/install/install.sh','utf8'),ps=readFileSync('platform/install/install.ps1','utf8');
// A POSIX shell to parse it. Windows has no `sh` on PATH; Git for Windows brings one, found as scripts/quick-check.py
// finds its bash (Windows RC 3224 failed here in 0.1 s). A Windows host without Git's shell leaves parsing to Mac and Linux.
function posixShell(){
 if(process.platform!=='win32')return 'sh';
 const git=spawnSync('where',['git'],{encoding:'utf8'}).stdout?.split(/\r?\n/).find(Boolean);
 if(!git)return null;
 const top=path.dirname(path.dirname(realpathSync(git.trim())));
 return [path.join(top,'usr/bin/sh.exe'),path.join(top,'bin/sh.exe'),path.join(path.dirname(top),'usr/bin/sh.exe')].find(existsSync)||null;
}
const shell=posixShell();
if(shell){const parsed=spawnSync(shell,['-n','platform/install/install.sh'],{encoding:'utf8'});assert.equal(parsed.status,0,'install.sh parses: '+(parsed.error?.message||parsed.stderr));}
const ids=['openclaw','hermes','pi','claude-code','codex'];
const local=readFileSync('core/agent/local-harness.ts','utf8');
for(const id of ids)assert.match(local,new RegExp(`['"]${id}['"]`),`${id} is a setup Agent id`);
assert.ok(sh.includes(`""|${ids.join('|')})`),'install.sh accepts exactly the setup Agent ids');
assert.ok(ps.includes(`ValidateSet('', ${ids.map(id=>`'${id}'`).join(', ')})`),'install.ps1 accepts exactly the setup Agent ids');
assert.ok(sh.indexOf('shasum -a 256')<sh.indexOf('ditto'),'Mac checks the checksum before installing');
assert.ok(sh.indexOf('codesign --verify')<sh.indexOf('ditto'),'Mac verifies the signature before installing');
assert.ok(ps.indexOf('Get-FileHash')<ps.indexOf("-ArgumentList '/S'"),'Windows checks the checksum before installing');
assert.match(sh,/--args "--connect=\$AGENT"/);
assert.match(ps,/"--connect=\$Agent"/);
assert.match(sh,/\/downloads\/appcast\.xml/);
assert.match(ps,/\/downloads\/windows-preview\.json/);
assert.match(sh,/target="\$\{WORLDLET_INSTALL_DIR:-\/Applications\}"/,'Mac installs into WORLDLET_INSTALL_DIR when set (release machines\' Beta install check)');
assert.ok(!/sudo/.test(sh),'never asks for an administrator password');
const acceptance=readFileSync('platform/install/install-acceptance.ps1','utf8');
assert.match(acceptance,/irm \$site\/install\.ps1 \| iex/,'acceptance runs the published one-liner');
assert.match(acceptance,/windows-preview\.json/,'acceptance compares with the public manifest');
console.log('PASS one-line installers: syntax, Agent ids, checksum and signature before install, --connect hand-off, real-device acceptance');
