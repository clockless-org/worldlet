/** Stable source representation shared by hosts; hashing/storage stays in the host.
 * Poll time is not source content. All other supplied fields can affect analysis. */
function canonicalAnalysisValue(value:unknown):string {
 if(Array.isArray(value))return '['+value.map(canonicalAnalysisValue).join(',')+']';
 if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonicalAnalysisValue(value[key])).join(',')+'}';
 return JSON.stringify(value);
}
export function analysisSourceContent(row:Record<string,unknown>):string {
 if(!row||typeof row.id!=='string'||typeof row.text!=='string')throw Error('Invalid analysis source');
 const {observedAt,...content}=row;
 return canonicalAnalysisValue(content);
}

/** Merge validated source-analysis submissions without multiplying retried results.
 * Explicit IDs update a candidate; otherwise only identical payloads coalesce.
 * Different obligations quoting the same source must remain separate. */
export function mergeAnalysisCandidates(previous:Record<string,unknown>[],incoming:Record<string,unknown>[]){
 if(!Array.isArray(previous)||!Array.isArray(incoming)||previous.length>1000||incoming.length>1000)throw Error('Invalid candidate batch');
 const result=new Map<string,Record<string,unknown>>();
 for(const item of [...previous,...incoming]){
  if(!item||Array.isArray(item)||typeof item!=='object')throw Error('Invalid candidate');
  const key=typeof item.id==='string'&&item.id?JSON.stringify([item.provider,item.id]):canonicalAnalysisValue(item);
  result.set(key,item);
 }
 if(result.size>1000)throw Error('Candidate capacity reached; submit a smaller batch');
 return [...result.values()];
}


/** A failed batch stays pending, but cannot monopolize every analysis slice.
 * Stable input order breaks ties; persisted attempt times survive restarts. */
export function orderAnalysisRecords(records:Record<string,any>[],attempted:Record<string,number>={}){
 const time=(id:string)=>Number.isFinite(attempted[id])&&attempted[id]>0?attempted[id]:0;
 return [...records].sort((a,b)=>time(a.id)-time(b.id));
}


/** Bound prompt size using whole records; oversized records run alone, never truncate.
 * A record that already failed runs alone, so it cannot sink new siblings again. */
export function analysisBatch(records:Record<string,any>[],limit:number,retrying:string[]=[]){
 if(!Number.isInteger(limit)||limit<1||limit>20)throw Error('Invalid analysis batch limit');
 const isolated=new Set(Array.isArray(retrying)?retrying:[]);
 if(records.length&&isolated.has(records[0].id))return records.slice(0,1);
 const selected:Record<string,any>[]=[],budget=32000;
 let used=0;
 for(const record of records){
  if(isolated.has(record.id))break;
  const size=JSON.stringify(record).length;
  if(selected.length&&(used+size>budget||selected.length>=limit))break;
  selected.push(record);used+=size;
 }
 return selected;
}
