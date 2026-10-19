// GitHub sign-in with the official Worldlet GitHub App's device code (context/connectors/github-device.ts and
// McpAccounts.connectDevice in platform/electron/src/modules/sources/mcp-account.ts) against a fake GitHub: only the
// public client ID is sent, never a secret; the code is shown; polling waits, slows down when asked, stops on cancel,
// refusal or expiry in plain words; the user token is checked before it is kept, kept in the vault, and renewed with
// the client ID alone; a refresh GitHub refuses signs the person out.
import assert from 'node:assert/strict';
import {GITHUB_APP,GITHUB_DEVICE_REASONS,GITHUB_INSTALL_URL,readGithubDevicePoll,readGithubDeviceStart,connectorTiles} from '../context/connectors/index.ts';
import {signInCode} from '../contracts/platform.ts';
import {McpAccounts} from '../platform/electron/src/modules/sources/mcp-account.ts';

// Core rules.
assert.equal(GITHUB_APP.clientId,'Iv23liCU8TGiC1MCnBI6');
assert.equal(GITHUB_INSTALL_URL,'https://github.com/apps/worldlet-ai/installations/new');
assert.deepEqual(readGithubDeviceStart({device_code:'d'.repeat(40),user_code:'WDJB-MJHT',verification_uri:'https://github.com/login/device',expires_in:899,interval:5}),
 {deviceCode:'d'.repeat(40),userCode:'WDJB-MJHT',verifyUrl:'https://github.com/login/device',expiresIn:899,interval:5});
assert.equal(readGithubDeviceStart({device_code:'d'.repeat(40),user_code:'<script>',verification_uri:'https://github.com/login/device'}),null,'a code not shaped like GitHub\'s is refused');
assert.equal(readGithubDeviceStart({device_code:'d'.repeat(40),user_code:'WDJB-MJHT',verification_uri:'https://evil.example.com/'})!.verifyUrl,GITHUB_APP.verifyUrl,'only github.com is opened');
assert.deepEqual(readGithubDevicePoll({error:'authorization_pending'},5),{kind:'wait',interval:5});
assert.deepEqual(readGithubDevicePoll({error:'slow_down'},5),{kind:'wait',interval:10});
assert.deepEqual(readGithubDevicePoll({error:'slow_down',interval:7},5),{kind:'wait',interval:7});
assert.deepEqual(readGithubDevicePoll({error:'expired_token'},5),{kind:'stop',reason:GITHUB_DEVICE_REASONS.expired});
assert.deepEqual(readGithubDevicePoll({error:'access_denied'},5),{kind:'stop',reason:GITHUB_DEVICE_REASONS.denied});
assert.deepEqual(readGithubDevicePoll({error:'device_flow_disabled'},5),{kind:'stop',reason:GITHUB_DEVICE_REASONS.unavailable});
assert.deepEqual(readGithubDevicePoll({access_token:'ghu_'+'a'.repeat(36),refresh_token:'ghr_'+'b'.repeat(70),expires_in:28800,token_type:'bearer'},5),
 {kind:'token',accessToken:'ghu_'+'a'.repeat(36),refreshToken:'ghr_'+'b'.repeat(70),expiresIn:28800});
// The page event: only a GitHub-shaped code and a github.com page.
assert.deepEqual(signInCode({provider:'github',code:'WDJB-MJHT',url:'https://github.com/login/device'}),{provider:'github',code:'WDJB-MJHT',url:'https://github.com/login/device'});
assert.equal(signInCode({provider:'github',code:'WDJB-MJHT',url:'https://example.com/'}),null);
// The tile signs in, with no key on the default path.
const tile=connectorTiles([]).find(item=>item.id==='github')!;
assert.deepEqual([tile.state,tile.signIn,tile.line],['off',true,'See your issues and pull requests on GitHub.']);

// The flow against a fake GitHub.
const values=new Map<string,string>();
const vault={get:(id:string)=>values.get(id)??null,set:(id:string,value:string)=>{values.set(id,value);},delete:(id:string)=>{values.delete(id);},deleteAll:()=>values.clear()};
let clock=1_000_000_000_000,polls:string[]=[],answers:Record<string,unknown>[]=[],forms:URLSearchParams[]=[];
const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json'}});
const fakeFetch=async(input:any,init:any={})=>{
 const url=String(input),form=new URLSearchParams(String(init.body??''));forms.push(form);
 assert.equal(init.headers?.accept,'application/json','GitHub answers JSON only when asked');
 assert.ok(!form.has('client_secret'),'no secret is ever sent');
 assert.equal(form.get('client_id'),GITHUB_APP.clientId);
 if(url===GITHUB_APP.deviceCodeUrl)return json({device_code:'d'.repeat(40),user_code:'WDJB-MJHT',verification_uri:'https://github.com/login/device',expires_in:900,interval:1});
 if(url===GITHUB_APP.tokenUrl){
  if(form.get('grant_type')==='refresh_token'){polls.push('refresh:'+form.get('refresh_token'));return json(answers.shift()??{error:'bad_refresh_token'});}
  assert.equal(form.get('grant_type'),'urn:ietf:params:oauth:grant-type:device_code');
  assert.equal(form.get('device_code'),'d'.repeat(40));
  polls.push('poll');clock+=1000;
  return json(answers.shift()??{error:'authorization_pending'});
 }
 throw Error('unexpected '+url);
};
const slept:number[]=[];
const accounts=new McpAccounts({vault,agentHomes:()=>[],fetch:fakeFetch as typeof fetch,now:()=>clock,sleep:async ms=>{slept.push(ms);}});
const ENDPOINT='https://api.githubcopilot.com/mcp/';

// Pending, slowed down, then authorized: the code is shown once, the token checked, then kept.
answers=[{error:'authorization_pending'},{error:'slow_down'},{access_token:'ghu_'+'a'.repeat(36),refresh_token:'ghr_'+'b'.repeat(70),expires_in:28800,refresh_token_expires_in:15897600,token_type:'bearer',scope:''}];
const shown:unknown[]=[];let verified:any=null;
const connection=await accounts.connectDevice('github',ENDPOINT,code=>shown.push(code),()=>false,async c=>{verified=c;assert.equal(values.has('mcp:github'),true,'kept while it is checked, so a session can read it');});
assert.deepEqual(shown,[{code:'WDJB-MJHT',url:'https://github.com/login/device'}]);
assert.deepEqual(polls,['poll','poll','poll']);
assert.equal(slept.reduce((a,b)=>a+b,0),1000+1000+6000,'it waits the interval GitHub gives, five seconds more after slow_down');
assert.equal(verified,connection);
const kept=JSON.parse(values.get('mcp:github')!);
assert.deepEqual([kept.kind,kept.url,kept.access_token,kept.refresh_token,kept.client_id,kept.token_endpoint,kept.client_secret],['oauth',ENDPOINT,'ghu_'+'a'.repeat(36),'ghr_'+'b'.repeat(70),GITHUB_APP.clientId,GITHUB_APP.tokenUrl,undefined]);
assert.equal(await accounts.bearer('github'),'Bearer ghu_'+'a'.repeat(36));

// Renewed with the client ID alone once it runs out; a refresh GitHub refuses signs the person out.
clock+=28_800_000;polls=[];answers=[{access_token:'ghu_'+'c'.repeat(36),refresh_token:'ghr_'+'d'.repeat(70),expires_in:28800}];
assert.equal(await accounts.bearer('github'),'Bearer ghu_'+'c'.repeat(36));
assert.deepEqual(polls,['refresh:ghr_'+'b'.repeat(70)]);
assert.equal(forms.at(-1)!.get('client_secret'),null);
assert.equal(JSON.parse(values.get('mcp:github')!).refresh_token,'ghr_'+'d'.repeat(70),'the new refresh token is kept');
clock+=28_800_000;answers=[{error:'bad_refresh_token'}];
assert.equal(await accounts.bearer('github'),null,'a refused refresh is a sign-out');

// A check that fails keeps nothing; cancel, refusal and expiry stop in plain words and keep what was there.
values.clear();
answers=[{access_token:'ghu_'+'e'.repeat(36)}];
await assert.rejects(accounts.connectDevice('github',ENDPOINT,()=>{},()=>false,async()=>{throw Error('GitHub did not accept this sign-in.');}),/did not accept/);
assert.equal(values.has("mcp:github"),false,"a refused sign-in is not kept");
 values.set("mcp:github","{\"v\":2}");answers=[{access_token:"ghu_"+"f".repeat(36)}];
 await assert.rejects(accounts.connectDevice("github",ENDPOINT,()=>{},()=>false,async()=>{throw Error("refused");}),/refused/);
 assert.equal(values.get("mcp:github"),"{\"v\":2}","and puts back the connection that was there");
values.set('mcp:github','{"v":1}');
let cancel=false;answers=[];
const cancelled=accounts.connectDevice('github',ENDPOINT,()=>{cancel=true;},()=>cancel);
await assert.rejects(cancelled,/Sign-in was cancelled\./);
answers=[{error:'access_denied'}];
await assert.rejects(accounts.connectDevice('github',ENDPOINT,()=>{}),new RegExp(GITHUB_DEVICE_REASONS.denied.replace(/\./g,'\\.')));
answers=[{error:'expired_token'}];
await assert.rejects(accounts.connectDevice('github',ENDPOINT,()=>{}),/ran out/);
assert.equal(values.get('mcp:github'),'{"v":1}','a sign-in that did not finish replaces nothing');

console.log('PASS GitHub sign-in: the Worldlet GitHub App\'s device code with its public client ID and no secret, the code shown once, waits and slow_down, the user token checked before it is kept, renewed with the client ID alone, a refused refresh signs out, cancel, refusal and expiry in plain words replace nothing');
