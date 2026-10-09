// Bounded, read-only Notion browsing through the official Notion MCP (ported from Hermes notion_mcp.py).
import type {McpGate,McpSession,McpToolResult} from './session.ts';
import {pyStr,pyType,head,chars,strip,truthy} from '../google/python.ts';
import {unescape} from '../google/html.ts';
import {ValueError,isDict,dget,loads,urlparse} from './python.ts';
import {handleNotionWrite,NOTION_WRITE_OPERATIONS,type NotionReviewStore,type NotionWriteOptions} from './notion-writes.ts';

export const NOTION_ENDPOINT='https://mcp.notion.com/mcp';
export const NOTION_GATE:McpGate=Object.freeze({name:'notion',urls:Object.freeze([NOTION_ENDPOINT]),
 connectMessage:'Connect Notion with Fox before opening this shelf.',urlMessage:'This shelf requires the official Notion MCP connection.',
 disconnectedMessage:'Notion is disconnected. Ask Fox to retry the connection.',include:null,bearer:false,timeoutSeconds:135});
export const NOTION_MAX_TEXT=160_000;
const TIMEOUT=45;
// Python's `\b` after an ASCII name: no word character (Unicode letters, digits, `_`) follows.
const B='(?![\\p{L}\\p{N}_])';

/** `<mention-date start="…"/>` as its start (and start time). */
export function readableMentions(text:string){
 return text.replace(new RegExp(`<mention-date${B}[^>]*?\\/?>`,'gu'),match=>{
  const values:Record<string,string>={};
  for(const [,key,value] of match.matchAll(/(start|startTime)="([^"]+)"/g))values[key]=value;
  return ['start','startTime'].filter(key=>Object.hasOwn(values,key)).map(key=>values[key]).join(' ');
 });
}
/** Notion's enhanced-Markdown title as plain text. */
export function displayText(text:unknown){
 return strip(unescape(readableMentions(pyStr(text)).replace(/<[^>]+>/g,'')).replaceAll('**','').replaceAll('__',''));
}

/** The 32-hex-digit page ID of a Notion page URL (notion.so, notion.com, notion.site) or ID. */
export function notionPageId(input:unknown){
 let value=strip(pyStr(input));
 if(!/^[a-fA-F0-9-]{32,36}$/.test(value)){
  const url=urlparse(value),host=(url.hostname||'').toLowerCase();
  if(url.scheme!=='https'||url.username||url.password||!['notion.so','notion.com','notion.site'].some(domain=>host===domain||host.endsWith('.'+domain)))throw new ValueError('Enter a Notion page URL or ID.');
  value=url.path;
 }
 const ids=value.match(/[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}|[a-fA-F0-9]{32}/g);
 if(!ids)throw new ValueError('Enter a Notion page URL or ID.');
 return ids.at(-1).replaceAll('-','').toLowerCase();
}

/** The first text part that is a JSON object. */
export function notionPayload(result:McpToolResult){
 if(result?.isError)throw new Error('Notion could not read this content. Check page access and try again.');
 for(const part of result?.content??[]){
  const text=part?.text;
  if(!truthy(text))continue;
  let value:unknown;
  try{value=loads(text);}catch{continue;}
  if(isDict(value))return value;
 }
 throw new Error('Notion returned an unsupported content format.');
}

const skipInvalid=<T>(read:()=>T):T|undefined=>{try{return read();}catch(error){if(error instanceof ValueError)return undefined;throw error;}};

function indexResult(value:Record<string,any>){
 const rows=dget(value,'results');
 if(!Array.isArray(rows))throw new Error('Notion did not return a page list.');
 const pages:any[]=[],seen=new Set<string>();
 for(const row of rows.slice(0,20)){
  const identifier=skipInvalid(()=>notionPageId(dget(row,'url',dget(row,'id',''))));
  if(identifier===undefined||seen.has(identifier))continue;
  seen.add(identifier);
  pages.push({id:identifier,title:head(displayText(dget(row,'title')||'Untitled'),500),url:'https://www.notion.so/'+identifier,type:dget(row,'type','page')});
 }
 return {ok:true,pages,hasMore:truthy(dget(value,'nextCursor')),scope:'Up to 20 recently visited pages'};
}

/** A fetched page (or database) as the shelf shows it. Throws when a page's body is missing. */
export function notionPage(value:Record<string,any>,identifier:string){
 const text=dget(value,'text');
 if(typeof text!=='string')throw new Error('Notion did not return the page body.');
 const kind=dget(dget(value,'metadata',{}),'type','page');
 const match=/<content>([^]*)<\/content>/.exec(text);
 // Notion marks a successfully fetched blank page; missing body data (an index or a title) must still fail
 // instead of replacing an existing original with an empty document.
 const blank=/<blank-page>[^<]*<\/blank-page>/.test(text);
 if(kind==='page'&&!match&&!blank)throw new Error('Notion did not return a readable page body. Open it in Notion.');
 let markdown=match?readableMentions(strip(match[1])):'';
 // Page links stay readable in Notion's enhanced Markdown without executing HTML.
 markdown=markdown.replace(new RegExp(`<(?:page|mention-page)${B}[^>]*url="([^"]+)"[^>]*>(.*?)<\\/(?:page|mention-page)>`,'gsu'),(_,url,label)=>'['+label+']('+url+')');
 markdown=markdown.replace(new RegExp(`<mention-page${B}[^>]*url="([^"]+)"[^>]*\\/>`,'gu'),(_,url)=>'[Linked page]('+url+')');
 const partial=truthy(dget(value,'truncated'))||truthy(dget(value,'unknown_block_count'))||chars(markdown)>NOTION_MAX_TEXT||new RegExp(`truncated="true"|<unknown${B}`,'u').test(text);
 return {id:identifier,title:head(displayText(dget(value,'title')||'Untitled'),500),url:'https://www.notion.so/'+identifier,object_type:'page',
  markdown:head(markdown,NOTION_MAX_TEXT),partial,kind,lastEdited:dget(value,'page_last_edited_at','')} as Record<string,any>;
}

function plain(value:unknown):string{
 if(Array.isArray(value))return head(value.map(plain).join(', '),2000);
 if(isDict(value))return head(pyStr(dget(value,'plain_text')||dget(value,'name')||dget(dget(value,'text')||{},'content')||''),2000);
 return head(displayText(value??''),2000);
}
const COLUMN_TYPES=new Set(['status','select','number','checkbox']);

async function databaseRows(session:McpSession,value:Record<string,any>,page:Record<string,any>){
 const text=dget(value,'text','');
 const sources=[...text.matchAll(new RegExp(`<data-source${B}[^>]*>`,'gu'))].map(([tag])=>/collection:\/\/[a-f0-9-]{32,36}/.exec(tag)?.[0]).filter(Boolean);
 if(!sources.length){
  page.notice='This database has no readable collection. Open it in Notion.';
  page.partial=true;
  return;
 }
 const result=notionPayload(await session.callTool('notion-query-data-sources',{data:{mode:'rows',data_source_url:sources[0],limit:20}},TIMEOUT));
 const rows=dget(result,'results');
 if(!Array.isArray(rows))throw new Error('Notion did not return database items.');
 let schema:any={};
 const state=/<data-source-state>([^]*?)<\/data-source-state>/.exec(text);
 if(state){
  let parsed:unknown,ok=true;
  try{parsed=loads(state[1]);}catch(error){if(!(error instanceof ValueError))throw error;ok=false;}
  if(ok)schema=dget(parsed,'schema',{});
 }
 if(!isDict(schema))throw new TypeError(`'${pyType(schema)}' object has no attribute 'items'`);
 const entries=Object.entries(schema);
 const titleKey=entries.find(([,prop])=>dget(prop,'type')==='title')?.[0]??'Name';
 const columns:string[]=[];
 for(const [key,prop] of entries){
  if(key===titleKey)continue;
  const type=dget(prop,'type');
  if(typeof type==='string'&&COLUMN_TYPES.has(type))columns.push(key);
  else if(type!==null&&typeof type==='object')throw new TypeError(`unhashable type: '${pyType(type)}'`);
 }
 columns.splice(4);
 const items:any[]=[];
 for(const row of rows.slice(0,20)){
  const identifier=skipInvalid(()=>notionPageId(dget(row,'url','')));
  if(identifier===undefined)continue;
  items.push({id:identifier,title:plain(dget(row,titleKey)||dget(row,'title')||'Untitled'),values:columns.map(column=>plain(dget(row,column)))});
 }
 // A bounded database preview is evidence of these rows, never the whole database: keep incomplete coverage
 // visible to the source reader and Attention synthesis.
 const more=truthy(dget(result,'has_more'))||sources.length>1||rows.length>=20;
 Object.assign(page,{rows:items,columns,more,partial:truthy(page.partial)||more||items.length!==rows.length});
 page.notice='Showing up to 20 items'+(sources.length>1?' from the first collection. Open in Notion for more.':'.');
 const cell=(v:string)=>v.replaceAll('|','\\|').replaceAll('\n',' ');
 page.markdown=page.notice+'\n\n| Title | '+columns.map(cell).join(' | ')+' |\n| --- | '+columns.map(()=>'---').join(' | ')+' |\n'+items.map(row=>'| '+[row.title,...row.values].map(cell).join(' | ')+' |').join('\n');
}

/** `list`: up to 20 recently visited pages. `fetch`: one page (or a database's first 20 rows) by URL or ID. */
export async function readNotion(session:McpSession,operation:unknown,identifier?:unknown){
 if(operation==='list')return indexResult(notionPayload(await session.callTool('notion-list-recent-pages',{limit:20},TIMEOUT)));
 if(operation==='fetch'){
  const id=notionPageId(identifier);
  const value=notionPayload(await session.callTool('notion-fetch',{id},TIMEOUT));
  const data=notionPage(value,id);
  if(data.kind!==null&&typeof data.kind==='object')throw new TypeError(`unhashable type: '${pyType(data.kind)}'`);
  if(data.kind==='database'||data.kind==='data_source')await databaseRows(session,value,data);
  return {ok:true,page:data,records:[{id,data}]};
 }
 throw new ValueError('Unsupported Notion operation.');
}

/** The Notion shelf's request (Python `read(body)` after its gate): reviewed writes (prepare, commit, check,
 * reviews, discard) go to notion-writes.ts with the review store; everything else is a read. */
export async function notion(session:McpSession,body:Record<string,any>,store:NotionReviewStore,options?:NotionWriteOptions){
 const operation=dget(body,'operation');
 if(operation!==null&&typeof operation==='object')throw new TypeError(`unhashable type: '${pyType(operation)}'`);
 if(typeof operation==='string'&&NOTION_WRITE_OPERATIONS.includes(operation))return handleNotionWrite(session,body,store,options);
 return readNotion(session,operation,dget(body,'id'));
}
