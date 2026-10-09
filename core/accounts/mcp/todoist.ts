// Bounded reads and private reviewed completion of Todoist tasks through Doist's official MCP (ported from Hermes
// todoist_mcp.py).
import type {McpGate,McpSession,McpToolResult} from './session.ts';
import {pyStr,chars,truthy} from '../google/python.ts';
import {ValueError,isDict,dget} from './python.ts';
import {mcpPayload} from './payload.ts';

export const TODOIST_ENDPOINT='https://ai.todoist.net/mcp';
/** The tools the Todoist connection registers for chat (host.py TODOIST_TOOLS). */
export const TODOIST_TOOLS:readonly string[]=Object.freeze(['find-tasks','fetch-object']);
export const TODOIST_GATE:McpGate=Object.freeze({name:'todoist',urls:Object.freeze([TODOIST_ENDPOINT]),connectMessage:'Connect Todoist with Fox first.',
 urlMessage:'Reconnect to the official Todoist MCP.',disconnectedMessage:'Todoist is disconnected. Reconnect with Fox.',include:TODOIST_TOOLS,bearer:false,timeoutSeconds:60});
const TIMEOUT=45,REVIEWED=['review','complete'];
/** The whole request's bound: a completion (write, then read back) gets longer than a read. */
export const todoistTimeoutSeconds=(body:Record<string,any>)=>dget(body,'operation')==='complete'?100:TODOIST_GATE.timeoutSeconds;

const payload=(result:McpToolResult)=>mcpPayload(result,'Todoist could not read these tasks. Reconnect or open the website.','Todoist returned an unsupported response.',['dict']);

export function todoistTaskId(value:unknown){
 if(typeof value!=='string'||!/^[A-Za-z0-9]{1,100}$/.test(value))throw new ValueError('Invalid Todoist task ID.');
 return value;
}
const DETAILS=['dueDate','deadlineDate','priority','projectId','labels','recurring','checked','parentId','responsibleUid','duration'];
function task(row:unknown){
 if(!isDict(row))throw new ValueError('Invalid Todoist task.');
 const key=todoistTaskId(dget(row,'id'));
 if(typeof dget(row,'content')!=='string'||typeof dget(row,'description','')!=='string')throw new ValueError('Todoist returned an invalid title or description.');
 const detail=Object.fromEntries(DETAILS.filter(k=>dget(row,k)!==null).map(k=>[k,row[k]]));
 // The full text, never a truncated summary that could replace an original.
 return {id:key,title:row.content,description:dget(row,'description',''),url:'https://app.todoist.com/app/task/'+key,details:detail,
  list:['priority','dueDate'].filter(k=>truthy(dget(detail,k))).map(k=>pyStr(detail[k])).join(' · ')} as Record<string,any>;
}

/** `list` (a page of 20 active tasks after `cursor`) or `read` (one task by `id`). */
export async function readTodoist(session:McpSession,body:Record<string,any>){
 const operation=dget(body,'operation','list');
 if(operation==='list'){
  const cursor=dget(body,'cursor');
  if(cursor!==null&&(typeof cursor!=='string'||chars(cursor)>4096))throw new ValueError('Invalid task cursor.');
  const args:Record<string,unknown>={filter:'all',limit:20,responsibleUserFiltering:'all'};
  if(truthy(cursor))args.cursor=cursor;
  const data=payload(await session.callTool('find-tasks',args,TIMEOUT));
  const rows=dget(data,'tasks');
  if(!Array.isArray(rows))throw new Error('Todoist did not return a task list.');
  const more=dget(data,'hasMore',false),next=dget(data,'nextCursor');
  if(truthy(more)&&(typeof next!=='string'||!next||chars(next)>4096))throw new Error('Todoist did not return a usable next page.');
  return {pages:rows.map(task),next:truthy(more)?next:null,scope:'Active tasks · 20 per page · Read only',connected:true};
 }
 if(operation==='read'){
  const key=todoistTaskId(dget(body,'id'));
  const data=payload(await session.callTool('fetch-object',{type:'task',id:key},TIMEOUT));
  const result=task(dget(data,'object'));
  if(result.id!==key)throw new Error('Todoist returned a different task. Reopen the list.');
  // Details render separately in Worldlet; no arbitrary provider HTML.
  result.text=result.description;
  return result;
 }
 throw new ValueError('Unsupported read-only Todoist operation.');
}

/** The private host IO after the shared review (never a chat tool): `review` reads the task with its children,
 * `complete` completes it once and reads it back. No retry: an error after submission is an uncertain result. */
export async function reviewedTodoist(session:McpSession,body:Record<string,any>){
 const operation=dget(body,'operation');
 if(!REVIEWED.includes(operation))throw new ValueError('Unsupported reviewed Todoist operation.');
 const key=todoistTaskId(dget(body,'id'));
 if(operation==='review')return payload(await session.callTool('fetch-object',{type:'task',id:key,includeChildren:true},TIMEOUT));
 const receipt=payload(await session.callTool('complete-tasks',{ids:[key]},TIMEOUT));
 const observed=payload(await session.callTool('fetch-object',{type:'task',id:key},TIMEOUT));
 return {receipt,observed};
}

/** The Todoist shelf's request (Python `read(body)` after its gate). */
export function todoist(session:McpSession,body:Record<string,any>){
 return REVIEWED.includes(dget(body,'operation'))?reviewedTodoist(session,body):readTodoist(session,body);
}
