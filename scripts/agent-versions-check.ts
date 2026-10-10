import assert from 'node:assert/strict';
import {AGENT_VERSIONS,LOCAL_HARNESSES,agentTooOldMessage,agentVersionStatus,compareAgentVersions,parseAgentVersion} from '../core/agent/index.ts';
import {UPDATED,signInScript} from '../platform/electron/src/modules/agent-runtime/provider-sign-in.ts';

// The oldest version of each Agent Worldlet works with (core/agent/agent-versions.ts): read from its `--version` line,
// compared part by part, turned away below the minimum with its own update command, never when it cannot be read.

// Every Agent has a minimum, a reason and a way to update ------------------------------------------------------------
for(const {id} of LOCAL_HARNESSES){
 const rule=AGENT_VERSIONS[id];
 assert.ok(parseAgentVersion(rule.minimum)===rule.minimum.split('.').concat(['0']).slice(0,3).join('.'),`${id}'s minimum is a plain version`);
 assert.ok(compareAgentVersions(rule.minimum,'0.0.1')>0,`${id} has a real minimum`);
 assert.ok(rule.needs.length>20,`${id} says what needs its minimum`);
 assert.ok(rule.update===null||rule.update.length>0,`${id}'s update command has arguments`);
 assert.ok(rule.howTo.length>10,`${id} says how to update it`);
}

// Version lines as each Agent prints them ----------------------------------------------------------------------------
assert.equal(parseAgentVersion('2.1.0 (Claude Code)'),'2.1.0');
assert.equal(parseAgentVersion('codex-cli 0.130.0'),'0.130.0');
assert.equal(parseAgentVersion('Hermes Agent v0.21.3 (2026.9.24)'),'0.21.3','the first version wins');
assert.equal(parseAgentVersion('OpenClaw 2026.9.8 (abc1234)'),'2026.9.8','date versions read as numbers too');
assert.equal(parseAgentVersion('pi 0.70'),'0.70.0');
assert.equal(parseAgentVersion('2026.8.1-beta.2'),'2026.8.1','a prerelease reads as its release');
assert.equal(parseAgentVersion('Hermes Agent v0.21.6+3.gabc1234.dirty · stable'),'0.21.6');
assert.equal(parseAgentVersion('Hermes Agent vgit.1a2.3b4'),null,'a commit id is no version');
assert.equal(parseAgentVersion('ready'),null);
assert.equal(parseAgentVersion(null),null);
assert.equal(compareAgentVersions('0.20.6','0.21.0'),-1);
assert.equal(compareAgentVersions('0.21.10','0.21.9'),1,'parts compare as numbers, not text');
assert.equal(compareAgentVersions('2026.10.1','2026.9.30'),1);
assert.equal(compareAgentVersions('1.0','1.0.0'),0);

// Below, at and above the minimum ------------------------------------------------------------------------------------
const hermes=AGENT_VERSIONS.hermes.minimum;
const older=agentVersionStatus('hermes','Hermes Agent v0.0.1');
assert.equal(older.outdated,true);assert.equal(older.current,'0.0.1');assert.equal(older.minimum,hermes);assert.equal(older.update,true);
assert.equal(agentVersionStatus('hermes',`Hermes Agent v${hermes}`).outdated,false,'the minimum itself is supported');
assert.equal(agentVersionStatus('hermes','Hermes Agent v999.0.0').outdated,false);
assert.equal(agentVersionStatus('hermes','something else').outdated,false,'an unreadable version is not turned away');
assert.match(agentTooOldMessage('Hermes Agent',older),new RegExp(`Hermes Agent 0\\.0\\.1 is too old for Worldlet, which needs ${hermes.replace(/\./g,'\\.')} or newer\\. Choose Update Hermes Agent`));
const codex=agentVersionStatus('codex','codex-cli 0.0.1');
assert.equal(codex.update,AGENT_VERSIONS.codex.update!==null);
if(!codex.update)assert.ok(agentTooOldMessage('Codex',codex).includes(AGENT_VERSIONS.codex.howTo),'without an update command it says how to update');

// The update opens in the person's Terminal, as a sign-in does --------------------------------------------------------
const mac=signInScript('darwin',{command:'/Users/alex/.local/bin/hermes',prefix:[],title:'Hermes Agent'},['update'],UPDATED);
assert.match(mac.text,/^#!\/bin\/sh\n'\/Users\/alex\/\.local\/bin\/hermes' 'update'\necho\necho 'When it has finished updating/);
const windows=signInScript('win32',{command:'C:\\Users\\alex\\hermes.exe',prefix:[],title:'Hermes Agent'},['update'],UPDATED);
assert.match(windows.text,/"C:\\Users\\alex\\hermes\.exe" "update"\r\necho\.\r\necho When it has finished updating/);

console.log('PASS agent versions: a minimum per Agent with what needs it, versions read from each --version line and compared as numbers, too-old Agents turned away with their own update command in Terminal, unreadable versions let through');
