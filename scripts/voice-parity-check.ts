// Voice beyond OpenClaw and Hermes Agent (blueprint rows "Voice input" and "Spoken conversation voice"): dictation goes
// into any text field of the World, not only Fox's bar (ui/companion/field-dictation.ts); local Whisper hears the
// World's own names as its initial prompt (core/companion/speech-vocabulary.ts, platform/local-tools/whisper_*.py);
// Fox's spoken replies use the Agent's own text-to-speech through the Harness `voice` service where the Harness has one
// (core/agent/harness-voice.ts, agent-runtime/harness-voice.ts), and a system voice otherwise.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {SPEECH_VOCABULARY,speechPrompt,speechTerm,speechTerms,worldSpeechTerms} from '../core/companion/index.ts';
import {makeSampleWorld} from '../ui/world/sample-data.ts';
import {dictationTarget,dictationWords} from '../ui/companion/field-dictation.ts';
import {validateHarnessServices} from '../contracts/harness-services.ts';
import {HARNESS_SERVICES,HARNESS_VOICE,harnessService,harnessVoiceArgs,harnessVoiceResult,harnessVoiceText} from '../core/agent/index.ts';
import {harnessVoice} from '../platform/electron/src/modules/agent-runtime/harness-voice.ts';
import type {SendCommand} from '../platform/electron/src/modules/agent-runtime/harness-send.ts';

// The World's names: people first, then Applets and places, each once; no sentences, links or common words.
assert.equal(speechTerm('Yiwen Su'),'Yiwen Su');
assert.equal(speechTerm('小狐'),'小狐','a script without case is a name');
for(const bad of ['home','https://mail.google.com','ana@example.com','2026','x'.repeat(49),'a<b>',''])assert.equal(speechTerm(bad),'',bad);
assert.deepEqual(speechTerms(['Fox'],['fox','Mail','Mail '],['Lease renewal']),['Fox','Mail','Lease renewal'],'each name once, case aside');
assert.equal(speechTerms(Array.from({length:200},(_,i)=>'Name '+i)).length,SPEECH_VOCABULARY.terms);
const world=worldSpeechTerms(makeSampleWorld({itemStatus:{}}));
assert.equal(world[0],'Kelvin Ren','the person comes first');
for(const name of ['Yiwen Su','Tofu','Mail','Flat & everyday','Tokyo & Kyoto'])assert.ok(world.includes(name),name);
assert.ok(world.indexOf('Yiwen Su')<world.indexOf('Flat & everyday')&&world.indexOf('Flat & everyday')<world.indexOf('Mail'),'people, then places, then Applets');
const prompt=speechPrompt(['Fox',...world]);
assert.ok(prompt.startsWith('Fox, Kelvin Ren, ')&&prompt.endsWith('.')&&prompt.length<=SPEECH_VOCABULARY.characters,prompt);
assert.equal(speechPrompt([]),'');
assert.equal(speechPrompt(Array.from({length:60},(_,i)=>'Someone Longname'+i)).length<=SPEECH_VOCABULARY.characters,true);
// The hint reaches Whisper as its initial prompt from a file, on both computers, and an echo of it is not speech.
const host=fs.readFileSync(new URL('../platform/electron/src/modules/voice/speech.ts',import.meta.url),'utf8');
assert.match(host,/this\.local\.transcribe\(pcm,this\.language,controller\.signal,this\.prompt\)/,'Fox and field dictation pass the World\'s names');
assert.match(host,/fs\.writeFileSync\(hint,prompt,\{mode:0o600\}\)/,'the names go in a private file, never on the command line');
const mac=fs.readFileSync(new URL('../platform/local-tools/whisper_local.py',import.meta.url),'utf8');
const windows=fs.readFileSync(new URL('../platform/local-tools/whisper_windows.py',import.meta.url),'utf8');
assert.match(mac,/initial_prompt=hint or None/);assert.match(windows,/initial_prompt=hint or None/);
const helpers=(source:string)=>source.slice(source.indexOf('def names_hint'),source.search(/\ndef (transcribe|worker)\(/));
assert.equal(helpers(mac),helpers(windows),'Mac and Windows read the hint the same way');
const folder=fs.mkdtempSync(path.join(os.tmpdir(),'voice-parity-'));
try{
 const hintFile=path.join(folder,'recording.txt');fs.writeFileSync(hintFile,'Fox, Yiwen Su, Tofu, Lease renewal, Tokyo & Kyoto.');
 const echoes=JSON.parse(execFileSync('python3',['-c',helpers(mac)+`
import json, sys
hint = names_hint(sys.argv[1])
print(json.dumps([hint, names_hint(None)] + [echoes_hint(t, hint) for t in ['Fox, Yiwen Su, Tofu, Lease renewal, Tokyo & Kyoto.', 'Tofu, Lease renewal, Tokyo & Kyoto', 'Tofu', 'Ask Yiwen Su about the lease renewal.']]))`,hintFile],{encoding:'utf8'}));
 assert.deepEqual(echoes,['Fox, Yiwen Su, Tofu, Lease renewal, Tokyo & Kyoto.','',true,true,false,false],'only the prompt written back is dropped; one name said alone is speech');

 // Dictation targets: a writable text box or rich-text field, never a password, Fox's bar or a marked field.
 const field=(tag:string,type:string|null=null,extra:Record<string,unknown>={})=>({tagName:tag,getAttribute:(name:string)=>name==='type'?type:null,closest:()=>null,...extra});
 assert.equal(dictationTarget(field('TEXTAREA')),true);
 assert.equal(dictationTarget(field('INPUT')),true,'an input with no type is text');
 for(const type of ['text','search','email','url'])assert.equal(dictationTarget(field('INPUT',type)),true,type);
 for(const type of ['password','number','checkbox','date'])assert.equal(dictationTarget(field('INPUT',type)),false,type);
 assert.equal(dictationTarget(field('DIV',null,{isContentEditable:true})),true,'a note\'s rich text');
 assert.equal(dictationTarget(field('DIV')),false);
 assert.equal(dictationTarget(field('TEXTAREA',null,{readOnly:true})),false);
 assert.equal(dictationTarget(field('TEXTAREA',null,{disabled:true})),false);
 assert.equal(dictationTarget(field('INPUT','text',{closest:(selector:string)=>selector.includes('#notionCommand')?{}:null})),false,'Fox\'s bar keeps its own microphone');
 assert.equal(dictationTarget(null),false);
 // The words go in at the caret with the spacing the text around them needs.
 assert.equal(dictationWords('Dear Ana,','thanks for the invoice',''),' thanks for the invoice');
 assert.equal(dictationWords('','Hello','world'),'Hello ');
 assert.equal(dictationWords('Hi ','there','.'),'there');
 assert.equal(dictationWords('请','打开邮件','。'),'打开邮件','no spaces inside Chinese');
 assert.equal(dictationWords('x','  ',''),'');

 // Harness voice: declared per Harness, never asked of a Harness by name. OpenClaw's own TTS through its command line;
 // Hermes Agent has no command that speaks a line, so it declares none and Fox reads with a system voice.
 assert.equal(validateHarnessServices({version:2,harness:'x',services:{voice:'native'}}).services.voice,'native');
 assert.equal(harnessService('openclaw','voice'),'native');
 for(const id of Object.keys(HARNESS_SERVICES).filter(id=>id!=='openclaw'))assert.equal(harnessService(id,'voice'),null,id);
 assert.deepEqual(harnessVoiceArgs('openclaw','-rm me','/tmp/x/reply.mp3'),['infer','tts','convert','--text=-rm me','--output=/tmp/x/reply.mp3','--json'],'a leading dash stays text');
 assert.equal(harnessVoiceArgs('hermes','Hi','/tmp/x.mp3'),null);
 assert.equal(harnessVoiceText('  Hello  '),'Hello');
 assert.equal(harnessVoiceText('x'.repeat(HARNESS_VOICE.characters+1)),null,'a reply longer than OpenClaw takes is read by a system voice');
 assert.equal(harnessVoiceText(''),null);
 const answer=(out:string)=>JSON.stringify({ok:true,capability:'tts.convert',transport:'local',provider:'microsoft',attempts:[],outputs:[{path:out,format:'mp3',voiceCompatible:false}]},null,2);
 assert.deepEqual(harnessVoiceResult(0,'[plugins] ready\n'+answer('/tmp/a/reply.mp3'),''),{path:'/tmp/a/reply.mp3',mimeType:'audio/mpeg',provider:'microsoft'},'a plugin\'s log line before the answer is skipped');
 assert.deepEqual(harnessVoiceResult(1,'','Error: No TTS provider is configured\n'),{error:'Error: No TTS provider is configured'});
 assert.ok('error' in harnessVoiceResult(0,'{"ok":true,"outputs":[]}',''),'no clip, no voice');
 assert.ok('error' in harnessVoiceResult(0,'not json',''));

 const environment={platform:'linux' as NodeJS.Platform,env:{PATH:'/usr/bin',HOME:folder},home:folder,systemDirectories:[]};
 const locate=()=>[{id:'openclaw' as const,title:'OpenClaw',command:'/bin/openclaw',prefix:[],configured:true},{id:'hermes' as const,title:'Hermes Agent',command:'/bin/hermes',prefix:[],configured:true}];
 const ran:string[][]=[];let clipFolder='';
 const run:SendCommand=async(_install,args)=>{ran.push(args);const out=args.find(a=>a.startsWith('--output='))!.slice(9);clipFolder=path.dirname(out);fs.writeFileSync(out,Buffer.from('ID3fakeclip'));return {code:0,stdout:answer(out),stderr:''};};
 const voice=harnessVoice('openclaw',environment,{locate,run})!;
 const clip=await voice.speak('Your build is complete.');
 assert.equal(Buffer.from(clip.audio).toString(),'ID3fakeclip');assert.equal(clip.mimeType,'audio/mpeg');assert.equal(clip.provider,'microsoft');
 assert.equal(ran[0][3],'--text=Your build is complete.');
 assert.equal(fs.existsSync(clipFolder),false,'the clip\'s private folder is removed');
 await assert.rejects(()=>harnessVoice('openclaw',environment,{locate,run:async()=>({code:0,stdout:answer('/etc/passwd'),stderr:''})})!.speak('Hi'),/somewhere else/,'only the clip written where it was asked');
 await assert.rejects(()=>harnessVoice('openclaw',environment,{locate:()=>[],run})!.speak('Hi'),/cannot speak/,'not installed here');
 assert.equal(harnessVoice('hermes',environment,{locate,run}),null,'Hermes Agent declares no voice');
 assert.equal(harnessVoice('claude-code',environment,{locate,run}),null);
}finally{fs.rmSync(folder,{recursive:true,force:true});}

// Spoken replies: the Agent's own voice when the person kept the automatic voice, and a system voice when it fails.
const speech=host.slice(host.indexOf('export class SpeechOutput'));
assert.match(speech,/if\(agent&&!voiceId\)/,'a system voice the person chose wins');
assert.match(speech,/agent\.speak\(plain\)\.catch\(\(\)=>null\)/,'a failed clip falls back to the system voice');
const surface=fs.readFileSync(new URL('../platform/electron/src/modules/media/surface.ts',import.meta.url),'utf8');
assert.match(surface,/speakClip\(token,url\)/);assert.match(surface,/stopSpeaking\(\)\{speechSynthesis\.cancel\(\);if\(clip\)/,'Stop silences the Agent\'s clip too');
console.log('PASS voice parity: dictation into any World text field, World names as Whisper\'s hint, the Agent\'s own voice through the Harness voice service with a system-voice fallback');
