// Stock Hermes Agent for a person with no Agent (platform/electron/src/modules/agent-runtime/hermes-official.ts,
// core/agent/hermes-setup.ts): the official installer runs stage by stage without a person (the ones that need input
// are Hermes' own), its steps are reported, a failed step says which, a Hermes Agent already here installs nothing,
// Worldlet's old links at the standard locations are removed first and never the person's own; ChatGPT is signed in
// with Hermes' own command, the address it prints is opened, and Hermes is set to ChatGPT with a model it lists.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {hermesChatGptModel,hermesInstallerResult,hermesInstallerStages,hermesSignInPrompt,HERMES_INSTALLERS} from '../core/agent/index.ts';
import {installHermes,ownHermesAgent,releaseStandardHermes,signInHermes} from '../platform/electron/src/modules/agent-runtime/hermes-official.ts';
import {withTempDir} from './test-temp.ts';

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
assert.ok(HERMES_INSTALLERS.posix.startsWith('https://hermes-agent.nousresearch.com/')&&HERMES_INSTALLERS.windows.startsWith('https://hermes-agent.nousresearch.com/'));

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
 // Then the whole run: every stage that needs no person, in order, reported as it runs; HERMES_HOME never reaches it.
 steps.length=0;fs.writeFileSync(log,'');
 const install=await installHermes(root,{environment,progress:step=>steps.push(`${step.step}/${step.steps} ${step.title}`),fetch:serve()});
 assert.deepEqual(steps,['1/2 Download Hermes Agent','2/2 Install command and app']);
 assert.deepEqual(fs.readFileSync(log,'utf8').trim().split('\n'),['--manifest','--stage repository --json --non-interactive','--stage products --json --non-interactive']);
 assert.equal(install.command,path.join(home,'.local','bin','hermes'));
 assert.ok(fetched.every(url=>url===HERMES_INSTALLERS.posix));
 // A Hermes Agent already here: nothing is downloaded or run.
 fetched.length=0;
 assert.equal((await installHermes(root,{environment,progress:()=>assert.fail('nothing to install'),fetch:serve()})).command,install.command);
 assert.equal(fetched.length,0);
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
