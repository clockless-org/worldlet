// Text helpers every part of the World shares: grapheme and UTF-8 lengths, whether a string may be a credential, and
// whether an Agent's reply is a provider failure. They moved here from core/companion and core/agent so Context needs
// nothing from Agent (#681).
const segmenter=new Intl.Segmenter('en',{granularity:'grapheme'});
export const characters=(text:string)=>Array.from(segmenter.segment(text),part=>part.segment);
// Index loop: Jint allocates a string per code point in for-of, and archives reach 16 MB.
export function utf8Length(text:string){let length=0;for(let i=0;i<text.length;i++){const c=text.charCodeAt(i);
 if(c<=127)length+=1;else if(c<=2047)length+=2;else if(c>=0xd800&&c<=0xdbff&&i+1<text.length&&(text.charCodeAt(i+1)&0xfc00)===0xdc00){length+=4;i++;}else length+=3;}return length;}

/** A string that may be a credential: never kept, whatever field it is in. */
export function looksSecret(text:string):boolean {
 return /\b(?:sk-[A-Za-z0-9_-]{12,}|sk_(?:live|test)_[A-Za-z0-9]{8,}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_\w{20,}|xox[abprs]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{30,}|ya29\.[0-9A-Za-z_-]{20,}|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,})/.test(text)
  ||/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(text)||/\bBearer\s+[A-Za-z0-9._~+/-]{16,}/i.test(text)
  ||text.split(/\s+/).some(word=>/^[A-Za-z0-9+_=-]{40,}$/.test(word)&&/\d/.test(word)&&/[A-Za-z]/.test(word));
}

const AGENT_FAILURE=/rejected the request and retrying won['’]t help|^\W*\s*(?:non-retryable (?:client )?error|api (?:call )?failed|provider authentication failed|rate limited after \d+ retries|the model provider (?:rejected|failed|is rate-limiting))/i;
/** Whether an Agent's final reply is its own provider error rather than an answer. */
export function agentReplyFailed(message:unknown):boolean {return AGENT_FAILURE.test(String(message??'').trim());}
