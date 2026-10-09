// Official Supabase project metadata; no database contents, keys or mutations (ported from Hermes supabase_mcp.py).
import type {McpGate,McpSession,McpToolResult} from './session.ts';
import {truthy} from '../google/python.ts';
import {ValueError,isDict,dget} from './python.ts';
import {mcpPayload} from './payload.ts';

export const SUPABASE_ENDPOINT='https://mcp.supabase.com/mcp?read_only=true&features=account';
/** The tools the Supabase connection registers for chat (host.py SUPABASE_TOOLS). */
export const SUPABASE_TOOLS:readonly string[]=Object.freeze(['list_projects','get_project']);
export const SUPABASE_GATE:McpGate=Object.freeze({name:'supabase',urls:Object.freeze([SUPABASE_ENDPOINT]),connectMessage:'Connect Supabase with Fox first.',
 urlMessage:'Reconnect to the official read-only Supabase MCP.',disconnectedMessage:'Supabase is disconnected. Reconnect with Fox.',include:SUPABASE_TOOLS,bearer:false,timeoutSeconds:60});
const TIMEOUT=45;

const payload=(result:McpToolResult)=>mcpPayload(result,'Supabase could not read projects. Reconnect or use Web.','Supabase returned an unsupported response.',['dict','list']);

export function supabaseProjectId(value:unknown){
 if(typeof value!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(value))throw new ValueError('Invalid Supabase project ID.');
 return value;
}
const DETAILS=['status','region','organization_id','organization_slug','created_at'];
function project(value:unknown){
 if(!isDict(value)||typeof dget(value,'name')!=='string')throw new ValueError('Supabase returned an invalid project.');
 const key=supabaseProjectId(dget(value,'id'));
 const ref=supabaseProjectId(dget(value,'ref',key));
 // Known public metadata fields only, never keys or passwords.
 const details=Object.fromEntries(DETAILS.filter(k=>typeof dget(value,k)==='string').map(k=>[k,value[k]]));
 return {id:key,title:value.name,description:'',text:'',list:['status','region'].filter(k=>truthy(dget(details,k))).map(k=>details[k]).join(' · '),
  url:'https://supabase.com/dashboard/project/'+ref,details};
}

/** `list` (every project, at most 500) or `read` (one project by `id`). */
export async function readSupabase(session:McpSession,body:Record<string,any>){
 const operation=dget(body,'operation');
 if(operation==='list'){
  if(truthy(dget(body,'cursor')))throw new ValueError('Supabase project listing does not use a cursor.');
  const value=payload(await session.callTool('list_projects',{},TIMEOUT));
  const rows=isDict(value)?dget(value,'projects'):value;
  if(!Array.isArray(rows))throw new Error('Supabase did not return a project list.');
  if(rows.length>500)throw new Error('More than 500 projects are available. Use the dashboard to choose a project.');
  return {pages:rows.map(project),next:null,connected:true,scope:'Projects · Status and region · Read only'};
 }
 if(operation==='read'){
  const key=supabaseProjectId(dget(body,'id'));
  const value=project(payload(await session.callTool('get_project',{id:key},TIMEOUT)));
  if(value.id!==key)throw new Error('Supabase returned a different project. Refresh the list.');
  return {...value,notice:'Project metadata only. Database contents, logs and editing remain in Web.'};
 }
 throw new ValueError('Unsupported Supabase read operation.');
}
