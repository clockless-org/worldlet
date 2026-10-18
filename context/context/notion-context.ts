// The World collects explicitly selected pages through its own Notion MCP connection. Agents read these snapshots.
import {notionPageId,notionPage,notionPayload,type McpSession} from '../../core/accounts/index.ts';
import type {ServiceRecords} from '../../contracts/services.ts';
import type {ServiceSyncSnapshot} from '../../contracts/service-sync.ts';

/** Exactly one selected page. No search, linked-page traversal, database rows, comments or write tools. */
export async function collectNotionPage(session:McpSession,identifier:unknown):Promise<ServiceRecords> {
 const id=notionPageId(identifier),value=notionPayload(await session.callTool('notion-fetch',{id},45)),page=notionPage(value,id);
 if(page.kind!=='page')throw Error('Choose a Notion page for collection; database traversal is not enabled.');
 return {provider:'notion',operation:'read',scope:'One owner-selected Notion page; linked pages and comments are not collected.',records:[{
  id,title:page.title,url:page.url,text:page.markdown,fields:{partial:page.partial},
  ...typeof page.lastEdited==='string'&&page.lastEdited?{updatedAt:page.lastEdited}:{}
 }]};
}

/** Present saved context in the existing source-reader shape. No provider IO or credentials are needed. */
export function readNotionContext(snapshots:readonly ServiceSyncSnapshot[],request:Record<string,unknown>){
 const records=new Map<string,{snapshot:ServiceSyncSnapshot;record:ServiceSyncSnapshot['records'][number]}>();
 for(const snapshot of [...snapshots].sort((a,b)=>b.collectedAt-a.collectedAt)){
  if(snapshot.provider!=='notion'||snapshot.operation!=='read')continue;
  for(const record of snapshot.records)if(!records.has(record.id))records.set(record.id,{snapshot,record});
 }
 const scope='Saved World context from owner-selected Notion pages; no live provider read.';
 if(request.operation==='list')return {ok:true,scope,pages:[...records.values()].slice(0,20).map(({record,snapshot})=>({id:record.id,title:record.title,url:record.url,collectedAt:snapshot.collectedAt})),hasMore:records.size>20};
 if(request.operation!=='fetch')throw Error('Unsupported saved Notion context operation.');
 const id=notionPageId(request.id),saved=records.get(id);
 if(!saved)throw Error('This Notion page has not been collected into the World. Choose and sync it first.');
 const {record,snapshot}=saved;
 const page={id,title:record.title,url:record.url,markdown:record.text??'',partial:record.fields.partial===true,lastEdited:record.updatedAt??'',collectedAt:snapshot.collectedAt};
 return {ok:true,scope,page,records:[{id,data:page}],collectedAt:snapshot.collectedAt,untrustedContent:true};
}
