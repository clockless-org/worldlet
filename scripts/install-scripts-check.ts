// The one-line installers (platform/install/README.md): shell syntax, the same Agent ids as setup, checksum and
// signature checks before installing, and the `--connect` hand-off to the app; on Linux the headless service's install
// steps; and agent.md, the page every Agent follows, saying the same commands as the Worldlet skill.
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
const local=readFileSync('agent/agents/local-harness.ts','utf8');
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
// macOS /bin/sh is bash 3.2: in a UTF-8 Terminal it reads a non-ASCII byte right after `$name` as part of the name
// (`$file…` failed as `file?: unbound variable` under `set -u`), so such variables are written `${name}`.
for(const [name,text] of [['install.sh',sh],['install.ps1',ps]])assert.doesNotMatch(text,/\$[A-Za-z_][A-Za-z0-9_]*[^\x00-\x7f]/,`${name} braces a variable that is followed by a non-ASCII character`);
// Linux: the headless service (README.md#linux), every file checked before anything runs, then the service, the Agent
// and the link.
const linux=sh.slice(sh.indexOf('install_linux() {'),sh.indexOf('\n}\n',sh.indexOf('install_linux() {')));
assert.ok(linux.length>200&&sh.includes('[ "$(uname -s)" != "Linux" ] || { install_linux; exit 0; }'),'Linux runs its own branch, before the Mac checks');
const order=(...parts:string[])=>parts.every((part,index)=>{const at=linux.indexOf(part);assert.ok(at>=0,'install.sh Linux has '+part);return index===0||linux.indexOf(parts[index-1])<at;});
assert.ok(order('/downloads/linux.json','.sha256','[ "$expected" = "$actual" ]','tar -xzf','SHA256SUMS','ln -sfn "$label" "$home/current"','systemctl --user enable --now worldlet.service','setup --agent "$AGENT"','link </dev/null'),'Linux: checksum, unpack, file sums, current, service, setup, link in that order');
assert.ok(!linux.includes('register --agent "$AGENT"'),'Linux: setup registers Claude Code and Codex itself, so the installer does not register them twice');
for(const part of ['loginctl enable-linger','nohup "$node" "$program"','qrencode -t ANSIUTF8','link --qr','ssh -L','$HOME/.local/bin/worldlet','for candidate in hermes openclaw claude codex'])assert.ok(linux.includes(part),'install.sh Linux has '+part);
// agent.md (served at https://worldlet.ai/agent.md) and the Worldlet skill give an Agent the same commands, and those
// commands exist.
const agentPage=readFileSync('platform/install/agent.md','utf8'),skillText=readFileSync('harness/skills/worldlet/SKILL.md','utf8');
const shared=['curl -fsSL https://worldlet.ai/install.sh | sh -s -- --agent <name>','& ([scriptblock]::Create((irm https://worldlet.ai/install.ps1))) -Agent <name>','worldlet setup --agent <name>','worldlet register --agent <name>','worldlet link --qr','~/.local/bin/worldlet','share_world_link','call_world_tool','ssh -L','https://worldlet.ai/download/','`openclaw`','`hermes`','`claude-code`','`codex`','`pi`'];
for(const text of shared){assert.ok(agentPage.includes(text),'agent.md says '+text);assert.ok(skillText.includes(text),'SKILL.md says '+text);}
assert.ok(skillText.includes('https://worldlet.ai/agent.md'),'the skill points at agent.md');
assert.match(sh,/--agent\) AGENT=/);assert.match(ps,/\[string\]\$Agent/);
const control=readFileSync('platform/node/src/control.ts','utf8');
assert.match(control,/CONTROL_COMMANDS=\['setup','link','status','register','remote'\]/,'the commands agent.md names exist');
assert.ok(control.includes("rest.includes('--qr')"),'and link --qr');
assert.ok(!/password|token|api key/i.test(agentPage.replace(/needs no password, token or API key|never pass it one|paste a key, password or token/gi,'')),'agent.md never asks for a secret');
const acceptance=readFileSync('platform/install/install-acceptance.ps1','utf8');
assert.match(acceptance,/irm \$site\/install\.ps1 \| iex/,'acceptance runs the published one-liner');
assert.match(acceptance,/windows-preview\.json/,'acceptance compares with the public manifest');
console.log('PASS one-line installers: syntax, Agent ids, checksum and signature before install, --connect hand-off, the Linux service steps in order, agent.md and the skill name the same commands, real-device acceptance');
