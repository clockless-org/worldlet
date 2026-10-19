// The World's own names as a hint to local Whisper (its initial prompt), so dictation spells them the way the World
// does: Fox's name, the people, the Applets, the places and the topics. Whisper reads at most 224 prompt tokens and
// gives the earliest the most weight, so the most particular names come first and the list stays short. The page
// gathers what its World shows (`worldSpeechTerms`); the host adds Fox's name and the World's topics and builds the
// prompt (`speechPrompt`). Nothing here leaves the computer: the prompt goes only to the local helper.

export const SPEECH_VOCABULARY=Object.freeze({terms:60,characters:400,term:48});
const record=(value:unknown):Record<string,any>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,any>:{};
const list=(value:unknown):any[]=>Array.isArray(value)?value:[];

/** One name as Whisper should see it, or '' for what is no name: a sentence, a link, a number, a generic word. */
export function speechTerm(value:unknown):string {
 const text=typeof value==='string'?value.replace(/\s+/g,' ').trim():'';
 if(!text||[...text].length>SPEECH_VOCABULARY.term||/[\u0000-\u001f\u007f<>{}[\]\\|`]|https?:|www\.|@/.test(text))return '';
 // An all-lowercase word is a common one Whisper already spells; names have a capital, or a script without case.
 if(!/\p{L}/u.test(text)||/^[\p{Ll}\s]+$/u.test(text))return '';
 return text;
}
/** Names in order, each once (case and spacing aside), at most `SPEECH_VOCABULARY.terms`. */
export function speechTerms(...groups:unknown[]):string[] {
 const seen=new Set<string>(),terms:string[]=[];
 for(const group of groups)for(const value of list(group)){
  const term=speechTerm(value),key=term.toLocaleLowerCase();
  if(!term||seen.has(key))continue;
  seen.add(key);terms.push(term);
  if(terms.length>=SPEECH_VOCABULARY.terms)return terms;
 }
 return terms;
}
/** The names a World shows (the page's projected World): people first, then its places and buildings (its own words),
 * then Applets (mostly names Whisper already knows). A title with a description after a middle dot ("Tofu · Cat care")
 * gives its name. */
export function worldSpeechTerms(world:unknown):string[] {
 const w=record(world),title=(item:unknown)=>String(record(item).title??'').split(' · ')[0];
 const persona=record(w.persona);
 const people=[...list(w.pages).filter(page=>record(page).objectKind==='people').map(title),...list(persona.family).map(entry=>String(entry).split(/ [—-] /)[0])];
 return speechTerms(persona.name?[persona.name]:[],people,list(w.spaces).map(title),list(w.buildings).map(title),list(w.areas).map(title),list(w.apps).map(title));
}
/** Whisper's initial prompt for these names: a plain list within `SPEECH_VOCABULARY.characters`, or '' for none. */
export function speechPrompt(terms:readonly string[]):string {
 let prompt='';
 for(const term of terms){const next=prompt?prompt+', '+term:term;if(next.length+1>SPEECH_VOCABULARY.characters)break;prompt=next;}
 return prompt?prompt+'.':'';
}
