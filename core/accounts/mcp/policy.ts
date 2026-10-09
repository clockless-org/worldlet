// Which MCP servers and tools the World's connectors may use (ported from Hermes host.py: READ_SHAPED, MCP_POLICY and
// the endpoint, tool filter and required-tool checks of `mcp(body)`), so the Platform enforces the same allowlists.
import {ValueError,urlparse} from './python.ts';
import {TODOIST_ENDPOINT,TODOIST_TOOLS} from './todoist.ts';
import {SUPABASE_ENDPOINT,SUPABASE_TOOLS} from './supabase.ts';

/** Tool-name patterns (fnmatch) of read-shaped tools, for servers whose read tools are not listed one by one. */
export const READ_SHAPED=Object.freeze(['get_*','list_*','search_*','read_*','fetch_*','*_get_*','*_list_*','*_search_*','*_read_*']);
export interface McpPolicy {
 /** fnmatch patterns of the tools a connection registers. */
 tools:readonly string[];
 /** The one official URL, and the message when another is configured. */
 endpoint?:{url:string;message:string};
 /** Every listed tool must be present, or the connection is not enabled (this message). */
 required?:string;
}
/** Connector reads only: external writes need their own confirmation and receipt flow before chat may use them. */
export const MCP_POLICY:Readonly<Record<string,McpPolicy>>=Object.freeze({
 notion:{tools:['notion-search','notion-fetch','notion-list-recent-pages','notion-query-data-sources','notion-get-self','notion-get-users','notion-get-user','notion-get-teams','notion-get-comments']},
 github:{tools:['get_me','get_file_contents','get_repository','list_branches','list_commits','get_commit','search_repositories','search_code','search_issues','search_pull_requests','list_issues','list_pull_requests']},
 linear:{tools:READ_SHAPED},paypal:{tools:READ_SHAPED},
 todoist:{tools:TODOIST_TOOLS,endpoint:{url:TODOIST_ENDPOINT,message:'Use the official Todoist MCP endpoint.'},required:'Todoist task reading is unavailable on this server.'},
 supabase:{tools:SUPABASE_TOOLS,endpoint:{url:SUPABASE_ENDPOINT,message:'Use the official read-only Supabase MCP endpoint.'},required:'Supabase project reading is unavailable on this server.'},
});
const policy=(name:string)=>Object.hasOwn(MCP_POLICY,name)?MCP_POLICY[name]:null;

/** Python's `fnmatch.translate`, as a JavaScript pattern for one whole name. */
function translate(pattern:string){
 let out='',i=0;const n=pattern.length;
 while(i<n){
  const c=pattern[i++];
  if(c==='*'){if(!out.endsWith('[^]*'))out+='[^]*';}
  else if(c==='?')out+='[^]';
  else if(c==='['){
   let j=i;
   if(j<n&&pattern[j]==='!')j++;
   if(j<n&&pattern[j]===']')j++;
   while(j<n&&pattern[j]!==']')j++;
   if(j>=n){out+='\\[';continue;}
   let stuff=pattern.slice(i,j);
   if(!stuff.includes('-'))stuff=stuff.replaceAll('\\','\\\\');
   else{
    const chunks:string[]=[];
    let k=pattern[i]==='!'?i+2:i+1;
    for(;;){k=pattern.indexOf('-',k);if(k<0||k>=j)break;chunks.push(pattern.slice(i,k));i=k+1;k=k+3;}
    const chunk=pattern.slice(i,j);
    if(chunk)chunks.push(chunk);else chunks[chunks.length-1]+='-';
    for(let m=chunks.length-1;m>0;m--)if(chunks[m-1].at(-1)>chunks[m][0]){chunks[m-1]=chunks[m-1].slice(0,-1)+chunks[m].slice(1);chunks.splice(m,1);}
    stuff=chunks.map(s=>s.replaceAll('\\','\\\\').replaceAll('-','\\-')).join('-');
   }
   stuff=stuff.replace(/[&~|\]]/g,'\\$&');
   i=j+1;
   if(!stuff)out+='(?!)';
   else if(stuff==='!')out+='[^]';
   else out+='['+(stuff[0]==='!'?'^'+stuff.slice(1):stuff[0]==='^'||stuff[0]==='['?'\\'+stuff:stuff)+']';
  }
  else out+=c.replace(/[\\^$.*+?()[\]{}|/-]/g,'\\$&');
 }
 return new RegExp('^(?:'+out+')$');
}
/** `fnmatch.fnmatchcase(name, pattern)`. */
export const fnmatchcase=(name:string,pattern:string)=>translate(pattern).test(name);

/** The configuration a connection to `name` at `url` starts from (host.py `mcp`, operation `configure`): the
 * official endpoint when the policy pins one, HTTPS without credentials in the URL, the policy's tool patterns. */
export function mcpConfiguration(name:string,url:string){
 if(!/^[a-z][a-z0-9_-]{0,63}$/.test(name))throw new ValueError('Invalid connection name.');
 const rule=policy(name);
 if(rule?.endpoint&&url!==rule.endpoint.url)throw new ValueError(rule.endpoint.message);
 const parsed=urlparse(url);
 if(parsed.scheme!=='https'||parsed.username||parsed.password)throw new ValueError('Use an HTTPS service endpoint.');
 return {url,enabled:false,tools:{include:[...(rule?.tools??[])],resources:false,prompts:false}};
}
/** The probed tools a connection registers (those matching `include`; all when it is null). A connection without
 * any, or without every tool its policy requires, is not enabled. */
export function enabledMcpTools(name:string,probed:readonly string[],include:readonly string[]|null){
 const tools=include===null?[...probed]:probed.filter(tool=>include.some(pattern=>fnmatchcase(tool,pattern)));
 if(include!==null&&!tools.length)throw new Error('The service has no compatible read tools. Its authorization is saved, but the connection is not enabled.');
 const rule=policy(name);
 if(rule?.required&&!rule.tools.every(tool=>tools.includes(tool)))throw new Error(rule.required);
 return tools;
}
