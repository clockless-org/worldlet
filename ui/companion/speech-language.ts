// Which language local speech recognition listens for. A hint matters: without one, a short clip of Mandarin is often
// heard as another language (or translated into English). The phones apply the same rule (WorldletKit and the
// Android kit's SpeechLanguage).

/** The language a line is written in, when its script says so; Latin text could be many languages, so it says null. */
export function scriptLanguage(text:unknown):string|null{
 const value=String(text??'');
 if(/[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(value))return 'ja';
 if(/\p{Script=Hangul}/u.test(value))return 'ko';
 if(/\p{Script=Han}/u.test(value))return 'zh';
 for(const [script,language] of [['Cyrillic','ru'],['Arabic','ar'],['Thai','th'],['Hebrew','he'],['Devanagari','hi'],['Greek','el']])if(new RegExp(`\\p{Script=${script}}`,'u').test(value))return language;
 return null;
}

const code=(value:unknown)=>String(value??'').toLowerCase().split(/[-_]/)[0];
const valid=(value:unknown)=>typeof value==='string'&&/^(multi|[a-z]{2,3})$/.test(value);

/** The last line the person said or typed to Fox decides; before there is one, the app's language, then the system's
 * (English alone means automatic detection). */
export function speechLanguage(){
 try{const saved=localStorage.getItem('worldlet-speech-language');if(valid(saved))return saved;}catch{}
 let chosen='';try{chosen=code(localStorage.getItem('worldlet-interface-language'));}catch{}
 if(valid(chosen)&&chosen!=='en')return chosen;
 const system=(navigator.languages?.length?navigator.languages:[navigator.language]).map(code).filter(valid);
 if(system[0]&&system[0]!=='en')return system[0];
 return system.includes('zh')?'zh':'multi';
}
export function rememberSpeechLanguage(text){if(!String(text).trim())return;try{localStorage.setItem('worldlet-speech-language',scriptLanguage(text)||'multi');}catch{}}
