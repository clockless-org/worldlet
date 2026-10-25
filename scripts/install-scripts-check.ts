// The one-line installers (platform/install/README.md): shell syntax, the same Agent ids as setup, the headless
// service's install steps in order on every system (the desktop app, when a Mac or Windows computer has it, is kept and
// opened with `--connect`), and agent.md, the page every Agent follows, saying the same commands as the Worldlet skill.
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
const local=readFileSync('agent/gate/local-harness.ts','utf8');
for(const id of ids)assert.match(local,new RegExp(`['"]${id}['"]`),`${id} is a setup Agent id`);
assert.ok(sh.includes(`""|${ids.join('|')})`),'install.sh accepts exactly the setup Agent ids');
assert.ok(ps.includes(`ValidateSet('', ${ids.map(id=>`'${id}'`).join(', ')})`),'install.ps1 accepts exactly the setup Agent ids');
// Every system installs the headless service (README.md): every file checked before anything runs, then the service,
// the Agent and the link. A Mac or Windows computer that has the desktop app keeps it and opens it instead.
const order=(text:string,name:string,...parts:string[])=>parts.every((part,index)=>{const at=text.indexOf(part);assert.ok(at>=0,`${name} has ${part}`);return index===0||text.indexOf(parts[index-1])<at;});
assert.ok(order(sh,'install.sh','/Applications/Worldlet.app','--args "--connect=$AGENT"','/downloads/server.json','.sha256','[ "$expected" = "$actual" ]','tar -xzf','SHA256SUMS','ln -sfn "$label" "$home/current"','Starting the Worldlet service','setup --agent "$AGENT"','link --local'),'install.sh: the app first, then checksum, unpack, file sums, current, service, setup, World link in that order');
assert.ok(order(ps,'install.ps1','Programs\\Worldlet\\app\\Worldlet.exe','"--connect=$Agent"','/downloads/server.json','Get-FileHash','tar.exe','SHA256SUMS','New-Item -ItemType Junction','WorldletService','setup --agent $Agent','link --local','Start-Process $link'),'install.ps1: the app first, then checksum, unpack, file sums, current, login start, setup, World link in that order');
assert.ok(!sh.includes('register --agent "$AGENT"')&&!ps.includes('register --agent $Agent'),'setup registers Claude Code and Codex itself, so the installers do not register them twice');
const service=readFileSync('platform/host/service.ts','utf8');
assert.match(service,/MAC_SERVICE_LABEL='ai\.worldlet\.service'/);assert.ok(sh.includes('ai.worldlet.service.plist')&&sh.includes('<string>ai.worldlet.service</string>'),'install.sh writes the launch agent the app removes when it takes over');
assert.match(service,/WINDOWS_SERVICE_RUN_VALUE='WorldletService'/);assert.ok(ps.includes("-Name 'WorldletService'"),'install.ps1 writes the Run value the app removes when it takes over');
for(const part of ['launchctl bootstrap','<key>KeepAlive</key><dict><key>SuccessfulExit</key><false/></dict>','systemctl --user enable --now worldlet.service','loginctl enable-linger','nohup "$node" "$program"','qrencode -t ANSIUTF8','link --qr','ssh -L','$HOME/.local/bin/worldlet','for candidate in hermes openclaw claude codex','WORLDLET_NO_LOGIN_START','WORLDLET_NO_BROWSER'])assert.ok(sh.includes(part),'install.sh has '+part);
for(const part of ["foreach ($candidate in 'hermes', 'openclaw', 'claude', 'codex')",'WORLDLET_NO_LOGIN_START','WORLDLET_NO_BROWSER',"Ask 'stop'"])assert.ok(ps.includes(part),'install.ps1 has '+part);
assert.ok(!/sudo/.test(sh),'never asks for an administrator password');
// macOS /bin/sh is bash 3.2: in a UTF-8 Terminal it reads a non-ASCII byte right after `$name` as part of the name
// (`$file…` failed as `file?: unbound variable` under `set -u`), so such variables are written `${name}`.
for(const [name,text] of [['install.sh',sh],['install.ps1',ps]])assert.doesNotMatch(text,/\$[A-Za-z_][A-Za-z0-9_]*[^\x00-\x7f]/,`${name} braces a variable that is followed by a non-ASCII character`);
// The package names the installers look for are the ones the release publishes.
const release=readFileSync('scripts/ci-release.mjs','utf8');
assert.ok(release.includes("server:'server.json'")&&release.includes("'macos-arm64'")&&release.includes("'windows-x64'"),'the Beta service feed and its Mac and Windows targets');
// agent.md (served at https://worldlet.ai/agent.md) and the Worldlet skill give an Agent the same commands, and those
// commands exist.
const agentPage=readFileSync('platform/install/agent.md','utf8'),skillText=readFileSync('harness/skills/worldlet/SKILL.md','utf8');
const shared=['curl -fsSL https://worldlet.ai/install.sh | sh -s -- --agent <name>','& ([scriptblock]::Create((irm https://worldlet.ai/install.ps1))) -Agent <name>','worldlet setup --agent <name>','worldlet register --agent <name>','worldlet link --qr','~/.local/bin/worldlet','share_world_link','call_world_tool','ssh -L','https://worldlet.ai/download/','`openclaw`','`hermes`','`claude-code`','`codex`','`pi`'];
for(const text of shared){assert.ok(agentPage.includes(text),'agent.md says '+text);assert.ok(skillText.includes(text),'SKILL.md says '+text);}
assert.ok(skillText.includes('https://worldlet.ai/agent.md'),'the skill points at agent.md');
assert.match(sh,/--agent\) AGENT=/);assert.match(ps,/\[string\]\$Agent/);
const control=readFileSync('platform/server/src/control.ts','utf8');
assert.match(control,/CONTROL_COMMANDS=\['setup','link','status','register','remote','stop'\]/,'the commands agent.md names exist');
assert.ok(control.includes("rest.includes('--qr')"),'and link --qr');
assert.ok(!/password|token|api key/i.test(agentPage.replace(/needs no password, token or API key|never pass it one|paste a key, password or token/gi,'')),'agent.md never asks for a secret');
const acceptance=readFileSync('platform/install/install-acceptance.ps1','utf8');
assert.match(acceptance,/irm \$site\/install\.ps1 \| iex/,'acceptance runs the published one-liner');
assert.match(acceptance,/server\.json/,'acceptance compares with the public service feed');
console.log('PASS one-line installers: syntax, Agent ids, an installed app kept and opened, the headless service steps in order on Mac, Linux and Windows, the login starts the app removes, agent.md and the skill name the same commands, real-device acceptance');
