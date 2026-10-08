/** Explain a rejected batch without copying source text, quotes, URLs or account data.
 * This is repair guidance only; it never authorizes or accepts a submission. */
export function sourceEvidenceIssues(items:any[],evidence:Record<string,any>,authorizedProviders:string[]){
 const authorized=new Set(authorizedProviders),issues:{itemIndex:number;sourceIndex:number;code:string;guidance:string}[]=[];
 const guidance={invalid_reference:'Use provider, id and a nonempty quote from the supplied context.',unauthorized_source:'This source is no longer authorized; do not resubmit it.',source_not_read:'Copy provider and id from sourceReference when supplied; otherwise use the exact provider and source record id from the read receipt. Do not use an item id, context id or URL.',quote_mismatch:'Copy one short continuous quote exactly from that record text, without translation or ellipses.'};
 for(const [itemIndex,item] of items.entries()){
  for(const [sourceIndex,ref] of (Array.isArray(item?.sources)?item.sources:[]).entries()){
   let code:string|null=null;
   if(typeof ref?.provider!=='string'||typeof ref?.id!=='string'||typeof ref?.quote!=='string'||!ref.quote)code='invalid_reference';
   else if(!authorized.has(ref.provider))code='unauthorized_source';
   else {
    const source=evidence[ref.provider+':'+ref.id];
    if(typeof source?.text!=='string')code='source_not_read';
    else if(!source.text.includes(ref.quote))code='quote_mismatch';
   }
   if(code)issues.push({itemIndex,sourceIndex,code,guidance:guidance[code]});
   if(issues.length>=20)return issues;
  }
 }
 return issues;
}

/** Attach the canonical evidence identity without changing the context acknowledgement ID.
 * The host chooses the mode; source content never chooses its provider in Applet analysis. */
export function sourceEvidenceContext(records:Record<string,any>[],provider?:string):Record<string,any>[] {
 return records.map(record=>{
  const owner=provider ?? record.provider;
  const id=provider ? record.id : record.sourceId;
  if(typeof owner!=='string'||!owner||typeof id!=='string'||!id)throw new Error('Missing source evidence identity');
  return {...record,sourceReference:{provider:owner,id}};
 });
}
