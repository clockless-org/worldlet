import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {AGENT_PROFILE_SCHEMA,agentProfileApplets,agentProfileAsked,agentProfilePrompt,looksSecret,parseAgentProfile} from '../agent/gate/index.ts';
import {describeAgent,readAgentProfile,writeAgentProfile} from '../platform/host/modules/companion/agent/agent-profile.ts';
import {readAgentSetting} from '../platform/host/store/agent-settings.ts';

// What a person's own Agent says about itself before setup brings it in (agent/gate/agent-profile.ts): the prompt, the
// bounded and secret-free parse, the Applets it points to, and the background turn's timeout and one retry.

const prompt=agentProfilePrompt(['gmail','discord','amazon']);
assert.match(prompt,new RegExp(AGENT_PROFILE_SCHEMA.replace(/[./]/g,'\\$&')));
assert.match(prompt,/NEVER include secrets/);assert.match(prompt,/Do not change any setting or file/);assert.match(prompt,/gmail, discord, amazon/);
assert.ok(agentProfileAsked('openclaw')&&agentProfileAsked('hermes')&&!agentProfileAsked('codex'));
// The things it names point at the conversations Worldlet brings, by the titles Worldlet gives them.
// Read from its files first (owner request 2026-10-12, "先读文件可以"): with its conversations listed, it answers from them
// without tools; each line bounded, repeats and empty titles dropped.
assert.doesNotMatch(prompt,/Worldlet read them from your files/);assert.match(prompt,/Use what you actually have/);
const listed=agentProfilePrompt(['gmail'],[{title:'Telegram · Sam',messages:42,last:'2026-10-11',opening:['Buy milk '.repeat(40),'and floss']},{title:' Telegram  ·  Sam'},{title:''},'#groceries']);
assert.match(listed,/do not run tools or read files for this/);assert.doesNotMatch(listed,/Use what you actually have/);
const lines=listed.split('use these titles exactly as written:\n')[1].split('\n\n')[0].split('\n').map(line=>JSON.parse(line));
assert.deepEqual(lines.map(c=>c.title),['Telegram · Sam','#groceries']);
assert.ok(lines[0].messages===42&&lines[0].last==='2026-10-11'&&lines[0].opening.length===2&&[...lines[0].opening[0]].length===140);

for(const secret of ['sk-ant-api03-abcdefghijklmnop','ghp_abcdefghijklmnopqrstuvwxyz0123','Bearer abcdefghijklmnop0123456789','token AbC123dEf456GhI789jKl012MnO345pQr678StU901'])assert.ok(looksSecret(secret),secret);
for(const plain of ['~/clawd-phone/hotline/skills/personal/groceries','Gmail for hotel bookings','1Password vault with an API key'])assert.ok(!looksSecret(plain),plain);

const reply='Here you go:\n```json\n'+JSON.stringify({schema:AGENT_PROFILE_SCHEMA,agent:{name:'Juno',model:'anthropic/claude-opus'},workspaces:[{agent:'main',path:'~/clawd'},{path:''}],persona:'A calm butler.',aboutUser:['Lives in LA','key sk-live-abcdefghijklmnopqrstu'],
 skills:[{name:'groceries',description:'Restock the kitchen'},{description:'no name'}],connections:[{name:'1Password vault',kind:'Password_Vault',service:'1Password'},{name:'Third mailbox',kind:'imap',service:'Gmail',usedFor:'hotels'},{name:'Leaked',service:'x',usedFor:'ghp_abcdefghijklmnopqrstuvwxyz0123'}],
 channels:[{provider:'Discord',place:'#groceries',purpose:'shopping'},{provider:'discord'}],routines:[{name:'Morning news',schedule:'0 8 * * *'}],threads:Array.from({length:40},(_,i)=>({title:'Thread '+i})),
 things:[{title:'Kitchen restock',why:'Every week',threads:['#groceries','',7],key:'Amazon'},{title:'Taxes',threads:[]},{threads:['#x']}],
 applets:[{key:'amazon',title:'Amazon',why:'Restocks'},{title:'Getty guide',why:'Museum day'},{key:'not-in-catalog',title:'Other'}],
 attention:[{group:'Coming',title:'Dentist',why:'Booked on Tuesday',when:'2026-10-14T15:00:00-07:00',thread:'#health'},{group:'coming',title:'No date',why:'Somewhere',thread:'#x'},
  {group:'doing',title:'Send the deck to Sam',why:'You promised it by Friday',summary:'Sam asked for the deck.',thread:'#work'},{group:'doing',title:'Too wordy',why:'one two three four five six seven eight nine',thread:'#x'},
  {group:'knowing',title:'Refund came through',why:'The airline paid it back',thread:'#travel'},{group:'later',title:'Unknown group',why:'x',thread:'#x'},{group:'doing',title:'No thread',why:'x'}]})+'\n```';
const profile=parseAgentProfile(reply)!;
assert.deepEqual(profile.agent,{name:'Juno',model:'anthropic/claude-opus'});
assert.deepEqual(profile.workspaces,[{agent:'main',path:'~/clawd'}]);
assert.deepEqual(profile.aboutUser,['Lives in LA'],'a line holding a key is dropped');
assert.deepEqual(profile.skills,[{name:'groceries',description:'Restock the kitchen'}]);
assert.deepEqual(profile.connections,[{name:'1Password vault',kind:'password_vault',service:'1password'},{name:'Third mailbox',kind:'other',service:'gmail',usedFor:'hotels'},{name:'Leaked',kind:'other',service:'x'}],'kinds outside the list are other; secrets never kept');
assert.deepEqual(profile.channels,[{provider:'discord',place:'#groceries',purpose:'shopping'}]);
assert.equal(profile.threads.length,30);
assert.deepEqual(profile.things,[{title:'Kitchen restock',why:'Every week',threads:['#groceries'],key:'amazon'},{title:'Taxes',threads:[]}],'what the person handles most, with where it happens');
assert.match(prompt,/things: name the things your person handles most/);
// What the person should see in the Attention Center right after setup (owner request 2026-10-12): a coming thing needs
// its day, a reason stays within eight words, every one names its conversation.
assert.deepEqual(profile.attention,[{group:'coming',title:'Dentist',why:'Booked on Tuesday',when:'2026-10-14T15:00:00-07:00',thread:'#health'},
 {group:'doing',title:'Send the deck to Sam',why:'You promised it by Friday',summary:'Sam asked for the deck.',thread:'#work'},{group:'knowing',title:'Refund came through',why:'The airline paid it back',thread:'#travel'}]);
assert.match(prompt,/attention: up to 9 things your person should see today/);
assert.ok(!JSON.stringify(profile).includes('ghp_')&&!JSON.stringify(profile).includes('sk-live'));
assert.deepEqual(agentProfileApplets(profile,['gmail','discord','amazon','x']),['amazon','gmail','x','discord'],'suggested first, then what its connections and channels use');
assert.equal(parseAgentProfile('I cannot do that.'),null);
assert.equal(parseAgentProfile('{"skills":[]}'),null,'nothing usable');
assert.equal(parseAgentProfile(42),null);
assert.equal(parseAgentProfile(JSON.stringify({persona:'Short.'}))?.persona,'Short.','a bare JSON reply');

// The background turn: one retry when the reply is not the JSON, a timeout cancels it, a failure is only a result.
const fake=(replies:(string|Error|'hang')[])=>{
 const asked:string[]=[];
 return {asked,make:()=>{let cancel=()=>{};return {async run(body:any){asked.push(body.text);assert.equal(body._background,true);const next=replies.shift()!;if(next==='hang')return new Promise((_,reject)=>{cancel=()=>reject(Object.assign(new Error('aborted'),{name:'AbortError'}));});if(next instanceof Error)throw next;return {message:next};},steer:async()=>false,cancel:()=>cancel()};}};
};
let agent=fake(['Sure! I am Juno.',JSON.stringify({agent:{name:'Juno'}})]);
assert.deepEqual(await describeAgent(agent.make,'/tmp'),{profile:{agent:{name:'Juno'},workspaces:[],aboutUser:[],skills:[],connections:[],channels:[],routines:[],threads:[],applets:[],things:[],attention:[]},result:'ok'});
assert.equal(agent.asked.length,2);assert.match(agent.asked[1],/was not that JSON object/);
agent=fake(['nope','still nope']);
assert.deepEqual(await describeAgent(agent.make,'/tmp'),{profile:null,result:'invalid'});
agent=fake(['hang']);
assert.deepEqual(await describeAgent(agent.make,'/tmp',[],50),{profile:null,result:'timeout'});
agent=fake([new Error('MINIMAX_API_KEY is missing')]);
assert.deepEqual(await describeAgent(agent.make,'/tmp'),{profile:null,result:'failed'});

// Kept beside the other Agent settings, one per Agent.
const root=fs.mkdtempSync(path.join(os.tmpdir(),'worldlet-agent-profile-'));
try{
 assert.equal(readAgentProfile(root,'openclaw'),null);
 writeAgentProfile(root,'openclaw',profile);writeAgentProfile(root,'hermes',{...profile,persona:'Other'});
 assert.equal(readAgentProfile(root,'openclaw')?.agent.name,'Juno');assert.equal(readAgentProfile(root,'hermes')?.persona,'Other');
 // A later try that brought nothing keeps what it said before, and says how asking ended.
 writeAgentProfile(root,'openclaw',null,'timeout',5);
 assert.equal(readAgentProfile(root,'openclaw')?.agent.name,'Juno');
 writeAgentProfile(root,'pi',null,'failed',5);assert.equal(readAgentProfile(root,'pi'),null);
 const kept=readAgentSetting(root,'agent-profile') as any;
 assert.deepEqual([kept.openclaw.result,kept.openclaw.triedAt,kept.pi],['timeout',5,{result:'failed',triedAt:5}]);
}finally{fs.rmSync(root,{recursive:true,force:true});}

console.log('PASS: the chosen Agent describes itself as bounded JSON with no secrets, retried once, timed out and failing quietly; its Applets join the World and the answer stays in the World\'s settings');
