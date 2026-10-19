// Which of this computer's Agents the real-model gates (test:onboarding, test:agent:local) run Fox on:
// WORLDLET_TEST_AGENT=claude-code for Claude Code, else Codex. A release host whose ChatGPT account stopped taking
// Codex's models (Alpha 4511–4514, #668/#669) runs them on its signed-in Claude Code instead.
import {spawnSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {CLAUDE_CODE_STATUS,claudeCodeLoggedIn} from '../agent/agent/index.ts';

export interface TestAgent {
 id:'codex'|'claude-code';
 title:string;
 /** Why this computer cannot run the gate on it, or null when it is signed in. */
 missing:string|null;
 /** Where its sign-in lives, for the gate's log. */
 home:string;
}

export function testAgent(env:NodeJS.ProcessEnv=process.env):TestAgent {
 if(env.WORLDLET_TEST_AGENT==='claude-code'){
  const home=env.CLAUDE_CONFIG_DIR||os.homedir();
  const status=spawnSync('claude',CLAUDE_CODE_STATUS,{encoding:'utf8',timeout:30_000,shell:process.platform==='win32',windowsHide:true});
  const signedIn=status.status===0?claudeCodeLoggedIn(status.stdout):null;
  // Only a plain "not signed in" stops the gate here: a daemon's short PATH may not find `claude`, which the app still
  // finds in its usual folders (the check then fails plainly if it is not installed at all).
  const missing=signedIn===false?'Claude Code is not signed in here; run claude auth login':null;
  return {id:'claude-code',title:'Claude Code',missing,home};
 }
 const home=env.CODEX_HOME||path.join(os.homedir(),'.codex');
 return {id:'codex',title:'Codex',missing:existsSync(path.join(home,'auth.json'))?null:`no Codex sign-in on this computer (${path.join(home,'auth.json')}); sign in with the Codex app or CLI`,home};
}
