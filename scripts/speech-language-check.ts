// Speech other than English was misheard on the computer (Kelvin, 2026-10-04): Whisper Small heard Mandarin poorly and
// got no language hint unless the system language was Chinese. Local speech now runs Large v3 Turbo with the language
// of the person's last line to Fox, then the app's, then the system's (ui/companion/speech-language.ts). The phones
// follow the same rule; their cases are in WorldletKit's SpeechLanguageTests and the Android kit's SpeechLanguageTest.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';

const store=new Map<string,string>();
Object.defineProperty(globalThis,'localStorage',{value:{getItem:(k:string)=>store.get(k)??null,setItem:(k:string,v:string)=>store.set(k,String(v)),removeItem:(k:string)=>store.delete(k)},configurable:true});
const system=(languages:string[])=>Object.defineProperty(globalThis,'navigator',{value:{languages,language:languages[0]},configurable:true});
const {scriptLanguage,speechLanguage,rememberSpeechLanguage}=await import('../ui/companion/speech-language.ts');

assert.equal(scriptLanguage('帮我打开明天的日历'),'zh');
assert.equal(scriptLanguage('打开 Gmail 看看'),'zh','Mandarin with English words is still Mandarin');
assert.equal(scriptLanguage('日本語のテスト'),'ja','kana makes Han text Japanese');
assert.equal(scriptLanguage('달력 열어줘'),'ko');
assert.equal(scriptLanguage('Открой календарь'),'ru');
assert.equal(scriptLanguage('Open my calendar'),null,'Latin text names no language');

system(['en-US']);
assert.equal(speechLanguage(),'multi','an English system with no history detects the language');
system(['en-US','zh-CN']);
assert.equal(speechLanguage(),'zh');
system(['ja-JP','en-US']);
assert.equal(speechLanguage(),'ja','a Japanese system hints Japanese, not only Chinese');
system(['en-US']);
store.set('worldlet-interface-language','es');
assert.equal(speechLanguage(),'es','the language chosen in setup comes before the system');
store.delete('worldlet-interface-language');
rememberSpeechLanguage('明天下午三点提醒我开会');
assert.equal(speechLanguage(),'zh','an English computer hears Mandarin once the person has spoken or typed it');
rememberSpeechLanguage('카레');
assert.equal(speechLanguage(),'ko');
rememberSpeechLanguage('Open my calendar');
assert.equal(speechLanguage(),'multi');
store.set('worldlet-speech-language','zh;rm -rf');
assert.equal(speechLanguage(),'multi','a malformed saved value is ignored');

const host=readFileSync(new URL('../platform/electron/src/modules/voice/speech.ts',import.meta.url),'utf8');
assert.match(host,/\^\(multi\|\[a-z\]\{2,3\}\)\$/,'the host accepts every language code the app sends');
const mac=readFileSync(new URL('../platform/local-tools/whisper_local.py',import.meta.url),'utf8');
assert.match(mac,/MODEL = 'mlx-community\/whisper-large-v3-turbo'/,'Mac uses Large v3 Turbo');
assert.match(mac,/language=language if language in LANGUAGES else None/,'Mac passes any Whisper language');
assert.match(mac,/\.worldlet-model/,'Mac replaces the earlier model\'s weights');
const windows=readFileSync(new URL('../platform/local-tools/whisper_windows.py',import.meta.url),'utf8');
assert.match(windows,/MODEL = 'deepdml\/faster-whisper-large-v3-turbo-ct2'/,'Windows uses Large v3 Turbo');
assert.match(windows,/'preprocessor_config\.json'/,'Large v3 needs its 128-mel preprocessor config');
assert.match(windows,/language=args\[1\] if args\[1\] in _LANGUAGE_CODES else None/,'Windows passes any Whisper language');
// Segments join into one line (owner report 2026-10-05: "Hello,Hello,Can you hear me?Can you hear me?When in the worldI").
const joiner=(source:string)=>source.slice(source.indexOf('def _cjk'),source.search(/\ndef (transcribe|worker)\(/));
assert.equal(joiner(mac),joiner(windows),'Mac and Windows join segments the same way');
const joined=JSON.parse(execFileSync('python3',['-c',joiner(mac)+`
import json
print(json.dumps([spoken_text(c) for c in [
 ['Hello,', 'Hello,', 'Can you hear me?', 'Can you hear me?', 'When in the world', "I don't want the mail applet to jump."],
 [' In the world', ' I see.'], ['在世界里', '不要跳。', ' Mail 不要跳'], ['', '  ', 'One.']]]))`],{encoding:'utf8'}));
assert.deepEqual(joined,["Hello, Can you hear me? When in the world I don't want the mail applet to jump.",'In the world I see.','在世界里不要跳。 Mail 不要跳','One.']);
// Silence is not an Order (owner Order 2026-10-07: near-silent audio became 「请不吝点赞 订阅 转发 打赏支持明镜与点点栏目」).
const kept=JSON.parse(execFileSync('python3',['-c',joiner(mac)+`
import json
print(json.dumps([spoken_text(heard(c)) for c in [
 [('请不吝点赞 订阅 转发 打赏支持明镜与点点栏目', .2, -.4)], [('字幕由Amara.org社区提供', .1, -.3), (' Thanks for watching!', .1, -.3)],
 [('Open the mail applet.', .95, -1.4)], [('把邮件打开，谢谢观看', .1, -.3), ('Open mail.', .7, -.5), ('Hi', None, None)]]]))`],{encoding:'utf8'}));
assert.deepEqual(kept,['','','','把邮件打开，谢谢观看 Open mail. Hi'],'silence phrases and segments Whisper judges silent are dropped; speech around them stays');
const ios=readFileSync(new URL('../ios/App/VoiceInput.swift',import.meta.url),'utf8');
assert.doesNotMatch(ios,/Locale\.current/,'the iPhone app\'s own (English) locale must not pick the speech language');
assert.match(ios,/SpeechLanguage\.locale\(/);
const android=readFileSync(new URL('../android/app/src/main/kotlin/app/worldlet/android/VoiceInput.kt',import.meta.url),'utf8');
assert.match(android,/EXTRA_LANGUAGE, SpeechLanguage\.tag\(/,'Android names the language it listens for');
console.log('PASS speech language: local Whisper Large v3 Turbo with a language hint; phones listen in the person\'s language');
