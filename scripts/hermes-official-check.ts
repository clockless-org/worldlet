// Stock Hermes Agent for a person with no Agent (platform/host/modules/agents/hermes-official.ts,
// agent/gate/hermes-setup.ts): the official installer runs stage by stage without a person (the ones that need input
// are Hermes' own), its steps are reported, a failed step says which, a Hermes Agent already here installs nothing and keeps its model,
// Worldlet's old links at the standard locations are removed first and never the person's own; ChatGPT is signed in
// with Hermes' own command, the address it prints is opened, and Hermes is set to ChatGPT with a model it lists.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {hermesChatGptModel,hermesInstallerResult,hermesInstallerStages,hermesSignInPrompt,HERMES_INSTALLERS} from '../agent/gate/index.ts';
import {HERMES_WINDOW_DONE,hermesInstallWindow,hermesStarts,installHermes,workingHermesAgent,installedHermes,ownHermesAgent,releaseStandardHermes,setAsideUnfinished,signInHermes} from '../platform/host/modules/agents/hermes-official.ts';
import {withTempDir} from './test-temp.ts';
import {signInScript} from '../platform/host/modules/agents/provider-sign-in.ts';

// Core: the manifest, a stage's result frame, what the sign-in prints, and the model.
const manifest='{"protocol_version":1,"stages":[{"name":"prerequisites","title":"System prerequisites","needs_user_input":false},{"name":"setup","title":"Configure API keys","needs_user_input":true},{"name":"complete","title":"Finish install","needs_user_input":false}]}';
assert.deepEqual(hermesInstallerStages('banner\n'+manifest),[{name:'prerequisites',title:'System prerequisites'},{name:'complete',title:'Finish install'}]);
assert.throws(()=>hermesInstallerStages('{"protocol_version":2,"stages":[]}'),/did not describe its steps/);
assert.throws(()=>hermesInstallerStages('{"protocol_version":1,"stages":[{"name":"$(rm)"}]}'),/did not describe its steps/);
assert.deepEqual(hermesInstallerResult('log\n{"ok":false,"stage":"venv","skipped":false,"reason":"uv failed"}\n','venv'),{ok:false,reason:'uv failed'});
assert.deepEqual(hermesInstallerResult('{"ok":true,"stage":"venv","skipped":false}','venv'),{ok:true,reason:''});
assert.equal(hermesInstallerResult('nothing','venv').ok,false);
assert.deepEqual(hermesSignInPrompt('Open this URL to authorize Hermes:\n  https://auth.openai.com/oauth/authorize?state=x\n'),{url:'https://auth.openai.com/oauth/authorize?state=x',code:null});
assert.deepEqual(hermesSignInPrompt('  1. Open this URL in your browser:\n     \u001b[94mhttps://auth.openai.com/codex/device\u001b[0m\n\n  2. Enter this code:\n     \u001b[94mABCD-1234\u001b[0m\n'),{url:'https://auth.openai.com/codex/device',code:'ABCD-1234'});
assert.equal(hermesSignInPrompt('Open https://evil.example.com/auth'),null,'only OpenAI’s own pages');
assert.equal(hermesChatGptModel('openai-codex:anthropic/claude-opus-4.6',['openai-codex:anthropic/claude-opus-4.6','openai-codex:gpt-6-sol','openai-codex:gpt-5.5']),'gpt-6-sol','the starter OpenRouter default is replaced by Hermes’ first ChatGPT model');
assert.equal(hermesChatGptModel('openai-codex:gpt-5.5',['openai-codex:gpt-6-sol','openai-codex:gpt-5.5']),'gpt-5.5','a ChatGPT model already chosen stays');
assert.equal(hermesChatGptModel('nous:x',['nous:x']),null);
assert.equal(hermesChatGptModel('nous:x',['openai-codex:gpt-6-astra','openai-codex:gpt-5.6-terra']),'gpt-5.6-terra','ChatGPT’s everyday model before Hermes’ first, which a ChatGPT account may refuse');
assert.ok(HERMES_INSTALLERS.posix.startsWith('https://hermes-agent.nousresearch.com/')&&HERMES_INSTALLERS.windows.startsWith('https://hermes-agent.nousresearch.com/'));

// After a failed quiet install, the same official installer runs in a window the person sees, skipping the stages that
// ask questions, and says to come back to Check again.
{
 const windows=hermesInstallWindow('win32'),script=signInScript('win32',windows,windows.args,HERMES_WINDOW_DONE);
 assert.equal(script.extension,'.cmd');
 assert.ok(script.text.includes(`"powershell.exe" "-NoProfile" "-ExecutionPolicy" "Bypass" "-Command" "& ([scriptblock]::Create((Invoke-RestMethod '${HERMES_INSTALLERS.windows}'))) -NonInteractive"`),script.text);
 assert.ok(script.text.includes('choose Check again')&&script.text.includes('pause'));
 const mac=hermesInstallWindow('darwin'),shell=signInScript('darwin',mac,mac.args,HERMES_WINDOW_DONE);
 assert.ok(shell.text.includes(`'/bin/bash' '-c' 'curl -fsSL '\\''${HERMES_INSTALLERS.posix}'\\'' | bash -s -- --non-interactive'`),shell.text);
}
if(process.platform==='win32'){console.log('PASS Hermes Agent setup rules (the installer run is checked on macOS and Linux)');process.exit(0);}

await withTempDir('worldlet-hermes-official-',async temp=>{
 const home=path.join(temp,'home'),root=path.join(temp,'library'),log=path.join(temp,'installer.log');
 fs.mkdirSync(home,{recursive:true});fs.mkdirSync(path.join(root,'agent','private','hermes'),{recursive:true});
 fs.writeFileSync(path.join(root,'agent','private','hermes','config.yaml'),'model: {}\n');
 // A stand-in for Hermes' install.sh: its stage protocol, and at `products` the `hermes` command in ~/.local/bin.
 const installer=(fail:string)=>`#!/bin/bash
echo "$*" >> ${JSON.stringify(log)}
[ -z "$HERMES_HOME" ] || { echo "HERMES_HOME leaked" >&2; exit 9; }
case "$1" in
 --manifest) echo '{"protocol_version":1,"stages":[{"name":"repository","title":"Download Hermes Agent","needs_user_input":false},{"name":"products","title":"Install command and app","needs_user_input":false},{"name":"setup","title":"Configure","needs_user_input":true}]}' ;;
 --stage)
  [ "$2" = "${fail}" ] && { echo '{"ok":false,"stage":"'$2'","skipped":false,"reason":"no network"}'; exit 1; }
  if [ "$2" = products ]; then mkdir -p "$HOME/.local/bin" "$HOME/.hermes"; printf '#!/bin/sh\\necho hermes "$@"\\n' > "$HOME/.local/bin/hermes"; chmod +x "$HOME/.local/bin/hermes"; echo 'model: {}' > "$HOME/.hermes/config.yaml"; fi
  echo '{"ok":true,"stage":"'$2'","skipped":false}' ;;
esac
`;
 const fetched:string[]=[];
 const serve=(fail='')=>(async(url:any)=>{fetched.push(String(url));return new Response(installer(fail));}) as typeof fetch;
 const environment={platform:process.platform,env:{PATH:'/usr/bin:/bin',HOME:home,HERMES_HOME:'/elsewhere',WORLDLET_SECRET:'x'},home,systemDirectories:[],applicationDirectories:[]};
 // Worldlet's old links for Fox's own profile go first; another command is never removed.
 fs.mkdirSync(path.join(home,'.local','bin'),{recursive:true});
 fs.symlinkSync(path.join(root,'agent','private','hermes'),path.join(home,'.hermes'));
 fs.writeFileSync(path.join(home,'.local','bin','hermes'),'#!/bin/sh\n# Hermes Agent: Fox\'s Hermes profile, set up by Worldlet (worldlet-hermes-command).\n',{mode:0o755});
 assert.equal(ownHermesAgent(environment),null,'Worldlet’s own launcher is no Hermes Agent of the person’s');
 // A failing step says which, and nothing is left half-reported as installed.
 const steps:string[]=[];
 await assert.rejects(installHermes(root,{environment,progress:step=>steps.push(`${step.step}/${step.steps} ${step.title}`),fetch:serve('products')}),/Hermes Agent could not be installed.*Install command and app: no network/);
 assert.equal(fs.existsSync(path.join(home,'.hermes')),false,'the link to Fox’s profile is gone');
 assert.equal(fs.existsSync(path.join(home,'.local','bin','hermes')),false,'Worldlet’s launcher is gone');
 assert.ok(fs.existsSync(path.join(root,'agent','private','hermes','config.yaml')),'Fox’s profile itself stays');
 assert.equal(installedHermes(root),false,'a failed install is not Worldlet’s Hermes');
 // What an unfinished earlier install left where Hermes installs itself is moved aside, never deleted; a checkout stays.
 const leftover=path.join(home,'.hermes','hermes-agent');
 fs.mkdirSync(leftover,{recursive:true});fs.writeFileSync(path.join(leftover,'notes.txt'),'mine');
 const aside=setAsideUnfinished(environment,new Date('2026-10-13T08:40:00Z'));
 assert.equal(aside,leftover+'.worldlet-aside-20261013084000');
 assert.equal(fs.existsSync(leftover),false,'the installer no longer finds a folder it refuses');
 assert.equal(fs.readFileSync(path.join(aside!,'notes.txt'),'utf8'),'mine','the person’s files are kept');
 fs.mkdirSync(path.join(leftover,'.git'),{recursive:true});
 assert.equal(setAsideUnfinished(environment),null,'a checkout is the installer’s to resume');
 fs.rmSync(path.join(home,'.hermes'),{recursive:true,force:true});
 // A step is stopped only once it goes quiet, not while it keeps printing (a slow connection installing packages).
 const timed=(body:string)=>(async()=>new Response(`#!/bin/bash
case "$1" in
 --manifest) echo '{"protocol_version":1,"stages":[{"name":"python-deps","title":"Install Python dependencies","needs_user_input":false}]}' ;;
 --stage) ${body}; echo '{"ok":true,"stage":"'$2'","skipped":false}' ;;
esac
`)) as typeof fetch;
 await assert.rejects(installHermes(root,{environment,progress:()=>{},fetch:timed('sleep 2'),limits:{idle:300,total:10_000}}),/Install Python dependencies: Installing Hermes Agent stopped making progress/);
 await assert.rejects(installHermes(root,{environment,progress:()=>{},fetch:timed('for i in 1 2 3 4 5 6 7 8 9 10; do echo resolving; sleep 0.1; done'),limits:{idle:5_000,total:300}}),/took too long/);
 // Busy past the quiet limit but printing: it finishes (then no hermes command was made, so it is not found).
 await assert.rejects(installHermes(root,{environment,progress:()=>{},fetch:timed('for i in 1 2 3 4 5 6 7 8 9 10; do echo resolving; sleep 0.1; done'),limits:{idle:400,total:10_000}}),/^(?!.*(stopped making progress|took too long)).*could not be installed/s);
 // Then the whole run: every stage that needs no person, in order, reported as it runs; HERMES_HOME never reaches it.
 steps.length=0;fs.writeFileSync(log,'');
 const install=await installHermes(root,{environment,progress:step=>steps.push(`${step.step}/${step.steps} ${step.title}`),fetch:serve()});
 assert.deepEqual(steps,['1/2 Download Hermes Agent','2/2 Install command and app']);
 assert.deepEqual(fs.readFileSync(log,'utf8').trim().split('\n'),['--manifest','--stage repository --json --non-interactive','--stage products --json --non-interactive']);
 assert.equal(install.command,path.join(home,'.local','bin','hermes'));
 assert.equal(installedHermes(root),true,'Worldlet installed this one');
 assert.ok(fetched.every(url=>url===HERMES_INSTALLERS.posix));
 // A Hermes Agent already here: nothing is downloaded or run.
 fetched.length=0;
 assert.equal((await installHermes(root,{environment,progress:()=>assert.fail('nothing to install'),fetch:serve()})).command,install.command);
 assert.equal(fetched.length,0);
 assert.equal(await hermesStarts(install,environment),'ok');
 // One whose command fails at once (left half installed) is no Hermes that works: the installer runs again and repairs it.
 fs.writeFileSync(install.command,'#!/bin/sh\necho "No module named hermes_cli" >&2\nexit 1\n',{mode:0o755});
 assert.equal(await hermesStarts(install,environment),'failed');
 assert.equal(await workingHermesAgent(environment),null);
 assert.equal((await installHermes(root,{environment,progress:()=>{},fetch:serve()})).command,install.command);
 assert.equal(fetched.length,1,'the installer ran');
 assert.equal(await hermesStarts(install,environment),'ok','and the command works again');
 // One that only answers slowly is not counted against it.
 const slow={...install,command:path.join(temp,'slow-hermes')};
 fs.writeFileSync(slow.command,'#!/bin/sh\nsleep 2\n',{mode:0o755});
 assert.equal(await hermesStarts(slow,environment,200),'slow');
 // A real folder at ~/.hermes is the person's own and stays.
 releaseStandardHermes(root,environment);
 assert.ok(fs.existsSync(path.join(home,'.hermes','config.yaml')));

 // Sign-in: Hermes' own command; the address it prints is opened; then its own config commands set ChatGPT and a model
 // its ACP session lists.
 const calls=path.join(temp,'calls.log');
 const hermes=path.join(temp,'fake-hermes');
 fs.writeFileSync(hermes,`#!/bin/bash
echo "$*" >> ${JSON.stringify(calls)}
case "$1 $2" in
 "auth add") echo "Open this URL to authorize Hermes:"; echo "  https://auth.openai.com/oauth/authorize?state=s"; sleep 0.2; [ -n "$FAIL_LOGIN" ] && { echo "Login failed: access denied" >&2; exit 1; }; exit 0 ;;
 "config set") exit 0 ;;
esac
if [ "$1" = acp ]; then
 while read -r line; do
  case "$line" in
   *'"id":1'*) echo '{"jsonrpc":"2.0","id":1,"result":{}}' ;;
   *'"id":2'*) echo '{"jsonrpc":"2.0","id":2,"result":{"sessionId":"s","models":{"currentModelId":"openai-codex:anthropic/claude-opus-4.6","availableModels":[{"modelId":"openai-codex:anthropic/claude-opus-4.6"},{"modelId":"openai-codex:gpt-6-sol"}]}}}' ;;
  esac
 done
fi
`,{mode:0o755});
 const fake={id:'hermes' as const,title:'Hermes Agent',command:hermes,prefix:[],configured:true};
 const opened:any[]=[];
 await signInHermes(fake,environment,prompt=>opened.push(prompt));
 assert.deepEqual(opened,[{url:'https://auth.openai.com/oauth/authorize?state=s',code:null}]);
 assert.deepEqual(fs.readFileSync(calls,'utf8').trim().split('\n'),['auth add openai-codex --type oauth --browser --no-browser','config set model.provider openai-codex','acp','config set model.default gpt-6-sol']);
 // A Hermes Agent that was already here is only signed in: its model stays the person's.
 fs.writeFileSync(calls,'');
 await signInHermes(fake,environment,()=>{},undefined,{setModel:false});
 assert.deepEqual(fs.readFileSync(calls,'utf8').trim().split('\n'),['auth add openai-codex --type oauth --browser --no-browser']);
 // A refused sign-in says why, and nothing is configured.
 fs.writeFileSync(calls,'');
 await assert.rejects(signInHermes(fake,{...environment,env:{...environment.env,FAIL_LOGIN:'1'}},()=>{}),/ChatGPT sign-in did not finish: access denied/);
 assert.deepEqual(fs.readFileSync(calls,'utf8').trim().split('\n'),['auth add openai-codex --type oauth --browser --no-browser']);
 // Cancelled from setup: it stops.
 const controller=new AbortController();
 const pending=signInHermes(fake,environment,()=>controller.abort(),controller.signal);
 await assert.rejects(pending,/Sign-in was cancelled/);
});
console.log('PASS Hermes Agent for a person with no Agent: official installer stage by stage with progress, a failed step named, nothing installed when Hermes is here, Worldlet’s old links removed and the person’s kept, ChatGPT signed in with Hermes’ own commands and a model it lists');
