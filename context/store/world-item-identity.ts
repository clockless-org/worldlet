import type {WorldItem} from '../../contracts/world-item.ts';
const text=(value:unknown)=>typeof value==='string'?value:'';
// Swift String equality is canonically equivalent; keep that behavior at the boundary.
const canonical=(value:unknown)=>text(value).normalize('NFC');
function sourceKeys(item:WorldItem):Set<string> {
 const refs=Array.isArray(item.sources)?item.sources:[];
 return new Set(refs.map(ref=>canonical(text(ref?.provider)+':'+(typeof ref?.remoteId==='string'?ref.remoteId:text(ref?.id)))));
}
export function matchingWorldItemSource(a:WorldItem,b:WorldItem):boolean {
 const keys=sourceKeys(a);
 return [...sourceKeys(b)].some(key=>keys.has(key));
}
/** A review/update must retain the owner's evidence, not just supporting context. */
export function matchingWorldItemOwnerSource(a:WorldItem,b:WorldItem):boolean {
 const owner=canonical(a.provider);if(!owner)return false;
 const owned=(item:WorldItem)=>({sources:(Array.isArray(item.sources)?item.sources:[]).filter(ref=>canonical(ref?.provider)===owner)});
 return matchingWorldItemSource(owned(a),owned(b));
}
/** Host supplies existing records/index hits; core decides whether this is the same item. */
export function resolveWorldItemID(item:WorldItem,previous:WorldItem|undefined,matchingID:string|undefined,identity:string):string {
 if(typeof item.id==='string'){
  if(!previous||canonical(previous.id)!==canonical(item.id)||canonical(previous.provider)!==canonical(item.provider)||canonical(previous.kind)!==canonical(item.kind)||!matchingWorldItemOwnerSource(previous,item))
   throw Error('An update must reference an existing item with the same owner, kind and a matching source.');
  return item.id;
 }
 return matchingID??identity;
}

// Letters and digits only, so a re-read that differs in read state, markup or line breaks compares equal.
const passage=(value:unknown)=>canonical(value).toLowerCase().replace(/status:\s*(un)?read/gu,'').replace(/[^\p{L}\p{N}]+/gu,'');
/** A background re-read quoting part of the passage already saved for the same source is the same
 * evidence, not a changed obligation. A longer quote can carry a new message, so it still asks. */
export function sameTaskEvidence(item:WorldItem,previous:WorldItem):boolean {
 const owner=canonical(item.provider);
 const refs=(row:WorldItem)=>(Array.isArray(row.sources)?row.sources:[]).filter(ref=>canonical(ref?.provider)===owner);
 const key=(ref:any)=>canonical(typeof ref?.remoteId==='string'?ref.remoteId:text(ref?.id));
 const incoming=refs(item);
 if(!owner||!incoming.length)return false;
 return incoming.every(ref=>{
  const quote=passage(ref?.quote);
  return quote.length>=20&&refs(previous).some(old=>key(old)===key(ref)&&passage(old?.quote).includes(quote));
 });
}

/** A changed owner passage is a proposal, not permission to merge obligations. */
export function needsTaskContinuityReview(item:WorldItem,previous:WorldItem|undefined,identity:string,previousIdentity:string):boolean {
 if(!previous||item.kind!=='task'||previous.kind!=='task'||typeof item.id!=='string')return false;
 if(identity===previousIdentity)return false;
 if(sameTaskEvidence(item,previous))return false;
 return !(previous.obligationIdentityVersion===1&&Array.isArray(previous.obligationIdentityAliases)&&previous.obligationIdentityAliases.includes(identity));
}
