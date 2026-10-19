// Bounded reads of the person's own issues through Linear's official MCP; no writes (ported from Hermes linear_mcp.py).
import type {McpGate,McpSession,McpToolResult} from './session.ts';
import {pyStr,chars,truthy} from '../google/python.ts';
import {ValueError,isDict,dget,contains} from './python.ts';
import {mcpPayload} from './payload.ts';

export const LINEAR_ENDPOINT='https://mcp.linear.app/mcp';
export const LINEAR_TOOLS:readonly string[]=Object.freeze(['list_issues','get_issue']);
/** Linear also accepts a saved API key header (`bearer`), as a connection brought over from another Agent carries. */
export const LINEAR_GATE:McpGate=Object.freeze({name:'linear',urls:Object.freeze([LINEAR_ENDPOINT]),connectMessage:'Connect Linear with Fox first.',
 urlMessage:'Reconnect to the official Linear MCP.',disconnectedMessage:'Linear is disconnected. Reconnect with Fox.',include:LINEAR_TOOLS,bearer:true,timeoutSeconds:60});
const TIMEOUT=45,PAGE=20;

const payload=(result:McpToolResult)=>mcpPayload(result,'Linear could not read these issues. Reconnect or open the website.','Linear returned an unsupported response.',['dict','list']);

/** An issue's UUID or its team key and number (ENG-123). */
export function linearIssueId(value:unknown){
 if(typeof value!=='string'||!/^[A-Za-z0-9_-]{1,100}$/.test(value))throw new ValueError('Invalid Linear issue ID.');
 return value;
}
/** Linear answers a related record as its name or as an object carrying one. */
function name(value:unknown):string|null{
 if(typeof value==='string')return value;
 if(isDict(value))for(const key of ['name','displayName','label','title'])if(typeof dget(value,key)==='string')return value[key];
 return null;
}
const FIELDS=[['status','status'],['status','state'],['priority','priority'],['project','project'],['team','team'],['assignee','assignee'],['cycle','cycle']];
function issue(row:unknown){
 if(!isDict(row)||typeof dget(row,'title')!=='string')throw new ValueError('Linear returned an invalid issue.');
 const key=linearIssueId(dget(row,'identifier')||dget(row,'id'));
 const description=dget(row,'description')||'';
 if(typeof description!=='string')throw new ValueError('Linear returned an invalid issue description.');
 const details:Record<string,string>={};
 for(const [field,source] of FIELDS)if(!Object.hasOwn(details,field)&&truthy(name(dget(row,source))))details[field]=name(row[source]);
 const label=dget(row,'priorityLabel');
 if(truthy(label))details.priority=pyStr(label);
 for(const field of ['dueDate','updatedAt','createdAt'])if(typeof dget(row,field)==='string')details[field]=row[field];
 let labels=dget(row,'labels');
 if(isDict(labels))labels=dget(labels,'nodes');
 if(Array.isArray(labels)){
  const names=labels.map(name).filter(truthy);
  if(names.length)details.labels=names.slice(0,8).join(', ');
 }
 let url=dget(row,'url');
 if(typeof url!=='string'||!url.startsWith('https://linear.app/'))url='https://linear.app/';
 return {id:key,title:row.title,description,url,details,list:['status','priority','dueDate'].filter(k=>truthy(dget(details,k))).map(k=>details[k]).join(' · ')} as Record<string,any>;
}

function rowsAndCursor(value:unknown):[unknown[],string|null]{
 let rows:unknown=null,cursor:string|null=null,more=false;
 if(Array.isArray(value))rows=value;
 else if(isDict(value)){
  rows=['issues','nodes','results','data'].map(k=>dget(value,k)).find(Array.isArray)??null;
  const info=isDict(dget(value,'pageInfo'))?value.pageInfo:value;
  cursor=['endCursor','nextCursor','cursor'].map(k=>dget(info,k)).find(v=>typeof v==='string'&&v)??null;
  more=dget(info,'hasNextPage',dget(info,'hasMore',cursor!==null))===true;
 }
 if(!Array.isArray(rows))throw new Error('Linear did not return an issue list.');
 if(more&&(!cursor||chars(cursor)>4096))throw new Error('Linear did not return a usable next page.');
 return [rows,more?cursor:null];
}

/** The `list_issues` arguments its advertised schema takes: the person's own open issues, newest first. */
export function linearListArguments(schema:unknown,cursor:string|null){
 const props=dget(truthy(schema)?schema:{},'properties')||{};
 const args:Record<string,unknown>={};
 for(const key of ['assignee','assigneeId'])if(contains(props,key)){args[key]='me';break;}
 if(contains(props,'limit'))args.limit=PAGE;
 if(contains(props,'orderBy'))args.orderBy='updatedAt';
 if(contains(props,'includeArchived'))args.includeArchived=false;
 if(truthy(cursor)){
  const key=['cursor','after'].find(k=>contains(props,k));
  if(key===undefined)throw new Error('This Linear server cannot page further. Open the website for older issues.');
  args[key]=cursor;
 }
 return args;
}

/** `list` (the person's issues after `cursor`, at most 100 shown) or `read` (one issue by `id`). */
export async function readLinear(session:McpSession,body:Record<string,any>){
 const operation=dget(body,'operation','list');
 if(operation==='list'){
  const cursor=dget(body,'cursor');
  if(cursor!==null&&(typeof cursor!=='string'||chars(cursor)>4096))throw new ValueError('Invalid issue cursor.');
  const tools=await session.listTools();
  const tool=(Array.isArray(tools?.tools)?tools.tools:[]).find(t=>(t?.name??'')==='list_issues');
  const value=payload(await session.callTool('list_issues',linearListArguments(tool?tool.inputSchema??null:null,cursor),TIMEOUT));
  const [rows,next]=rowsAndCursor(value);
  return {pages:rows.slice(0,100).map(issue),next,connected:true,scope:'Your issues · Newest first · Read only'};
 }
 if(operation==='read'){
  const key=linearIssueId(dget(body,'id'));
  const value=payload(await session.callTool('get_issue',{id:key},TIMEOUT));
  const result=issue(isDict(value)&&isDict(dget(value,'issue'))?value.issue:value);
  if(result.id!==key)throw new Error('Linear returned a different issue. Reopen the list.');
  // Details render separately in Worldlet; no provider HTML.
  result.text=result.description;
  return result;
 }
 throw new ValueError('Unsupported read-only Linear operation.');
}
