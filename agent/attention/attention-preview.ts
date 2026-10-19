// A bounded view of saved evidence. Opening a preview never reads remote sources.
const text=(value:unknown)=>String(value||'').replace(/<[^>]*>/g,'').replace(/\[([^\]]+)\]\([^)]*\)/g,'$1').replace(/[*_`#]/g,'').replace(/\s+/g,' ').trim();
export function safeAttentionURL(value:unknown){try{const u=new URL(String(value));return u.protocol==='https:'&&!u.username&&!u.password?u.href:null;}catch{return null;}}
export function attentionPreviewData(page){
 const signal=page.worldItemSignal||{},kind=page.worldItemKind||'update';
 const summary=signal.summary;
 const location=text(signal.location),locationName=text(signal.locationName)||location;
 // Never turn a malformed URL or an explicit online venue into a physical address.
 const venueURL=safeAttentionURL(location);
 const physical=!!location&&!venueURL&&!/^[a-z][a-z\d+.-]*:|^\/\/|\b(?:online|virtual|remote|zoom|teams)\b/i.test(location);
 return {kind,actionLabel:text(signal.actionLabel),title:text(page.title),reason:text(signal.reason),summary:String(summary||'').trim(),location:locationName,
  locationURL:venueURL||(physical?'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(location):null),physical,
  sourceURL:safeAttentionURL(page.sourceURL),
  category:kind==='event'?'Coming Up':kind==='task'?'Worth Doing':'Worth Knowing',
  image:kind==='event'?'coming-up':kind==='task'?'do-something':'worth-knowing',
  suggestion:kind==='event'?'Shall we get ready for this?':kind==='task'?'Want me to help with the next step?':'Want to explore what this means?',
 };
}
