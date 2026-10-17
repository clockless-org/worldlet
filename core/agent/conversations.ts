import {CONVERSATION_AUTHORS,CONVERSATION_LIMITS,type ConversationAdd,type ConversationAuthor,type ConversationMessageInput,type ConversationSearch} from '../../contracts/conversations.ts';

/** The conversation archive (contracts/conversations.ts, core/agent/GRANTS.md#conversation-archive). Pure: hosts supply
 * the calling Agent's ID (from its token) and the clock, and keep what comes back. Every refusal throws an Error whose
 * message the Agent is shown. Text is kept, not refused: what looks like a credential is replaced and control
 * characters are dropped, so one pasted key never loses a whole conversation. */

export const CONVERSATION_REASONS=Object.freeze({
 invalid:'This is not a valid conversations call.',
 source:`Name the source in at most ${CONVERSATION_LIMITS.source} characters, on one line.`,
 messages:`Send between 1 and ${CONVERSATION_LIMITS.add} messages at a time.`,
 message:'Each message needs an id, a thread, an author (person, agent or system), an ISO time and text.',
 time:'since and until must be ISO times.',
});
/** What replaces credential-shaped text. */
export const CONVERSATION_HIDDEN='[hidden]';
/** What ends text cut at CONVERSATION_LIMITS.text. */
export const CONVERSATION_CUT='\n[…cut]';

const record=(value:unknown):Record<string,unknown>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
const fail=(reason:string):never=>{throw new Error(reason);};
const only=(value:Record<string,unknown>,keys:string[],reason:string)=>{for(const key of Object.keys(value))if(!keys.includes(key))fail(reason);};
const instant=(value:unknown):string|null=>{
 if(typeof value!=='string')return null;
 const at=Date.parse(value);
 return Number.isFinite(at)?new Date(at).toISOString():null;
};

// The same shapes core/agent/agent-profile.ts looksSecret refuses, replaced in place. A long word of letters and digits
// is hidden unless it is lowercase hex of a Git object's length (a commit people quote all the time).
const SECRET_PATTERNS:RegExp[]=[
 /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/g,
 /\b(?:sk-[A-Za-z0-9_-]{12,}|sk_(?:live|test)_[A-Za-z0-9]{8,}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_\w{20,}|xox[abprs]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{30,}|ya29\.[0-9A-Za-z_-]{20,}|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}(?:\.[A-Za-z0-9_-]+)?)/g,
];
const BEARER=/\b(Bearer)\s+[A-Za-z0-9._~+/-]{16,}/gi;
const LONG_WORD=/(?<=^|\s)[A-Za-z0-9+_=-]{40,}(?=\s|$)/g;
const GIT_OBJECT=/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
/** Text with every credential-shaped part replaced by `[hidden]`. */
export function hideSecrets(text:string):string {
 let out=text;
 for(const pattern of SECRET_PATTERNS)out=out.replace(pattern,CONVERSATION_HIDDEN);
 return out.replace(BEARER,`$1 ${CONVERSATION_HIDDEN}`)
  .replace(LONG_WORD,word=>/\d/.test(word)&&/[A-Za-z]/.test(word)&&!GIT_OBJECT.test(word)?CONVERSATION_HIDDEN:word);
}
// C0 controls (tab and line breaks only in message text), DEL, C1 controls and bidirectional overrides.
const CONTROL=/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f‪-‮⁦-⁩]/g;
/** One line: controls and line breaks become spaces, at most `limit` characters, secrets hidden. */
function line(value:unknown,limit:number):string {
 if(value===undefined||value===null)return '';
 if(typeof value!=='string')return fail(CONVERSATION_REASONS.message);
 return [...hideSecrets(value.replace(CONTROL,' ').replace(/[\t\r\n]+/g,' ').replace(/\s+/g,' ').trim())].slice(0,limit).join('');
}
/** Message text: keeps its line breaks, drops other controls, hides secrets, and is cut (marked) past the limit. */
export function conversationText(value:string):string {
 const clean=hideSecrets(value.replace(/\r\n?/g,'\n').replace(CONTROL,'')).trim();
 const chars=[...clean];
 return chars.length>CONVERSATION_LIMITS.text?chars.slice(0,CONVERSATION_LIMITS.text-[...CONVERSATION_CUT].length).join('')+CONVERSATION_CUT:clean;
}
/** An ID or thread: one line, never hidden or cut (it names the message), or a refusal. */
function key(value:unknown,limit:number):string {
 if(typeof value!=='string')return fail(CONVERSATION_REASONS.message);
 const clean=value.trim();
 if(!clean||[...clean].length>limit||/[\u0000-\u001f\u007f-\u009f]/.test(clean))fail(CONVERSATION_REASONS.message);
 return clean;
}

/** `conversations/add` arguments, checked and cleaned. An `agentId` the model sent is dropped: the host stamps the
 * caller's own. The same message ID twice in one call keeps the last. */
export function readConversationAdd(input:unknown):ConversationAdd {
 const value={...record(input)};delete value.agentId;
 only(value,['source','messages'],CONVERSATION_REASONS.invalid);
 if(typeof value.source!=='string'||/[\r\n]/.test(value.source))fail(CONVERSATION_REASONS.source);
 const source=line(value.source,CONVERSATION_LIMITS.source+1);
 if(!source||[...source].length>CONVERSATION_LIMITS.source)fail(CONVERSATION_REASONS.source);
 if(!Array.isArray(value.messages)||!value.messages.length||value.messages.length>CONVERSATION_LIMITS.add)fail(CONVERSATION_REASONS.messages);
 const messages=new Map<string,ConversationMessageInput>();
 for(const entry of value.messages as unknown[]){
  const message=record(entry);
  only(message,['id','thread','threadTitle','author','authorName','surface','at','text'],CONVERSATION_REASONS.message);
  const at=instant(message.at);
  if(!at||!CONVERSATION_AUTHORS.includes(message.author as ConversationAuthor)||typeof message.text!=='string')fail(CONVERSATION_REASONS.message);
  const text=conversationText(message.text as string);
  if(!text)fail(CONVERSATION_REASONS.message);
  const id=key(message.id,CONVERSATION_LIMITS.id);
  const clean:ConversationMessageInput={id,thread:key(message.thread,CONVERSATION_LIMITS.thread),author:message.author as ConversationAuthor,at:at!,text};
  const threadTitle=line(message.threadTitle,CONVERSATION_LIMITS.threadTitle);if(threadTitle)clean.threadTitle=threadTitle;
  const authorName=line(message.authorName,CONVERSATION_LIMITS.authorName);if(authorName)clean.authorName=authorName;
  const surface=line(message.surface,CONVERSATION_LIMITS.surface);if(surface)clean.surface=surface;
  messages.delete(id);messages.set(id,clean);
 }
 return {source,messages:[...messages.values()]};
}

/** `conversations/search` arguments, checked. */
export function readConversationSearch(input:unknown):Required<Pick<ConversationSearch,'limit'|'offset'>>&Omit<ConversationSearch,'limit'|'offset'> {
 const value={...record(input)};delete value.agentId;
 only(value,['q','source','thread','author','since','until','limit','offset'],CONVERSATION_REASONS.invalid);
 const search:ReturnType<typeof readConversationSearch>={limit:CONVERSATION_LIMITS.searchDefault,offset:0};
 const q=line(value.q,CONVERSATION_LIMITS.query);if(q)search.q=q;
 const source=line(value.source,CONVERSATION_LIMITS.source);if(source)search.source=source;
 if(value.thread!==undefined)search.thread=key(value.thread,CONVERSATION_LIMITS.thread);
 if(value.author!==undefined){
  if(!CONVERSATION_AUTHORS.includes(value.author as ConversationAuthor))fail(CONVERSATION_REASONS.invalid);
  search.author=value.author as ConversationAuthor;
 }
 for(const name of ['since','until'] as const)if(value[name]!==undefined){
  const at=instant(value[name]);
  if(!at)fail(CONVERSATION_REASONS.time);
  search[name]=at!;
 }
 if(value.limit!==undefined){
  if(!Number.isInteger(value.limit)||(value.limit as number)<1||(value.limit as number)>CONVERSATION_LIMITS.search)fail(CONVERSATION_REASONS.invalid);
  search.limit=value.limit as number;
 }
 if(value.offset!==undefined){
  if(!Number.isInteger(value.offset)||(value.offset as number)<0)fail(CONVERSATION_REASONS.invalid);
  search.offset=value.offset as number;
 }
 return search;
}
