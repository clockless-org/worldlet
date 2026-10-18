export const CURATED_READERS=['todoist','linear','supabase','docker','google-drive','google-docs','google-sheets','google-slides'] as const;
export function curatedConnection(key:string){return ['google-docs','google-sheets','google-slides'].includes(key)?'google-drive':key;}

/** Product-owned requests; adapters only transport this bounded read plan. */
export function curatedSourceRead(input:any){
 if(!input||!CURATED_READERS.includes(input.provider))throw Error('Unsupported native source reader.');
 if(Object.keys(input).some(k=>!['provider','operation','id','cursor'].includes(k)))throw Error('Unsupported source request field.');
 if(!['list','read'].includes(input.operation))throw Error('This Applet currently supports reading only.');
 const plan:any={provider:input.provider,operation:input.operation};
 if(input.operation==='read'){
  if(typeof input.id!=='string'||!(input.provider==='docker'?/^[a-f0-9]{64}$/:input.provider==='todoist'?/^[A-Za-z0-9]{1,100}$/:/^[A-Za-z0-9_-]{1,256}$/).test(input.id)||input.cursor!==undefined)throw Error('Use the exact source ID from the list.');
  plan.id=input.id;
 }else{
  if(input.id!==undefined)throw Error('A source list does not take an item ID.');
  if(input.cursor!==undefined){if(typeof input.cursor!=='string'||input.cursor.length>4096)throw Error('Invalid source cursor.');plan.cursor=input.cursor;}
 }
 plan.connectionProvider=curatedConnection(input.provider);
 if(input.provider==='docker'){if(input.cursor!==undefined)throw Error('Docker inventory does not accept a cursor.');plan.localTool='docker';}
 return plan;
}
