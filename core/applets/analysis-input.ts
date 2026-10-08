import {sourceEvidenceContext} from '../attention/index.ts';
import {appletAnalysisItems} from './analysis-state.ts';
type Row=Record<string,any>;
/** Conservative preprocessing. Originals and their revision checkpoints stay intact. */
export function appletAnalysisInput(provider:string,records:Row[],items:Row[],now:number) {
 if(!Number.isFinite(now))throw Error('Missing analysis clock');
 const skipped:Row[]=[],context:Row[]=[];
 for(const row of sourceEvidenceContext(records,provider)){
  let reason='';
  if(provider==='gmail'&&row.allMessagesExcluded===true&&row.partial!==true)reason='spam_or_trash';
  if(provider==='google-calendar'){
   if(row.cancelled===true||row.status==='cancelled')reason='cancelled_or_declined';
   const end=typeof row.end==='string'&&row.end.includes('T')?Date.parse(row.end)/1000:NaN;
   if(Number.isFinite(end)&&end<=now)reason='ended';
  }
  if(reason){skipped.push({id:row.id,reason});continue;}
  // Keep exact source characters for quote validation. Drop transport/poll metadata,
  // not message history: an earlier thread reply can still contain an obligation.
  const value:Row={};
  for(const key of ['id','provider','sourceReference','title','text','url','start','end','allDay','cancelled','location','partial','labelIds'])if(row[key]!==undefined)value[key]=row[key];
  context.push(value);
 }
 return {context,skippedContextIds:skipped.map(row=>row.id),preprocessing:skipped,
  pendingContextIds:records.map(row=>row.id),items:appletAnalysisItems(records,items)};
}
/** Refresh current support immediately, but do not ask M to analyze unprocessed changes. */
export function appletAnalysisRefresh(records:Row[],saved:Row,revisions:Record<string,string>) {
 return records.map(row=>({...row,...(row.cancelled!==true&&row.status!=='cancelled'&&row.completed!==true&&saved.analyzed?.[row.id]!==revisions[row.id]?{analysisPending:true}:{})}));
}
