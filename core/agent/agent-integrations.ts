// Integrations a person's own Agent already had (owner request 2026-10-04: "if their agent already
// connected these integrations, port them over"). Shared rules only: how each Agent's MCP server
// settings read, which Worldlet connection a server is, and whether its grant can come along.
// Reading the files and connecting is the host's job. Kept ES-compatible for JavaScriptCore and Jint.
//
// A server that carries its own token (an Authorization header, or the token environment variable a
// command-line server reads) can become the same Worldlet connection with that token. One signed in
// through the other app's own OAuth cannot: its grant belongs to that app's client, so the person
// reconnects it in Worldlet. Servers Worldlet has no connection for stay with that Agent.

/** One MCP server as an Agent configures it, in the shape Claude Code, OpenClaw and Hermes share. */
export interface AgentMcpServer {name:string;url?:string;headers?:Record<string,string>;command?:string;args?:string[];env?:Record<string,string>;bearerTokenEnv?:string}
export type IntegrationOutcome='port'|'reconnect'|'stays';
export interface IntegrationPlan {name:string;title:string;provider:string|null;outcome:IntegrationOutcome;token?:string}

interface Recognizer {provider:string;title:string;hosts:string[];packages:string[];tokenEnv:string[]}
/** Worldlet connections a brought server can become (hosts as in `SOURCE_ENDPOINTS`). Google is
 * always reconnected: Worldlet signs in to Google with its own client. */
const RECOGNIZERS:Recognizer[]=[
 {provider:'github',title:'GitHub',hosts:['api.githubcopilot.com'],packages:['server-github','github-mcp-server'],tokenEnv:['GITHUB_PERSONAL_ACCESS_TOKEN','GITHUB_TOKEN','GH_TOKEN']},
 {provider:'notion',title:'Notion',hosts:['mcp.notion.com'],packages:['notion-mcp-server','notion-mcp'],tokenEnv:['NOTION_TOKEN','NOTION_API_KEY']},
 {provider:'linear',title:'Linear',hosts:['mcp.linear.app'],packages:['linear-mcp'],tokenEnv:['LINEAR_API_KEY','LINEAR_TOKEN']},
 {provider:'todoist',title:'Todoist',hosts:['ai.todoist.net'],packages:['todoist-mcp'],tokenEnv:['TODOIST_API_TOKEN','TODOIST_API_KEY']},
 {provider:'paypal',title:'PayPal',hosts:['mcp.paypal.com'],packages:['paypal/mcp','paypal-mcp'],tokenEnv:['PAYPAL_ACCESS_TOKEN']},
 {provider:'supabase',title:'Supabase',hosts:['mcp.supabase.com'],packages:['mcp-server-supabase'],tokenEnv:['SUPABASE_ACCESS_TOKEN']}
];
const GOOGLE=/gmail|google[-_ ]?(calendar|workspace|drive|mail)|gcal|gdrive|workspace-mcp/i;

const record=(value:unknown):Record<string,any>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,any>:{};
const strings=(value:unknown):Record<string,string>=>Object.fromEntries(Object.entries(record(value)).filter(([,v])=>typeof v==='string')) as Record<string,string>;
const host=(url:string)=>{const match=/^https?:\/\/([^/:?#]+)/i.exec(url);return match?match[1].toLowerCase():'';};

/** `{name: {url|command, …}}` maps: Claude Code `mcpServers`, OpenClaw `mcp.servers`, Hermes `mcp_servers`. */
export function mcpServersFrom(value:unknown):AgentMcpServer[] {
 return Object.entries(record(value)).slice(0,50).map(([name,raw])=>{
  const entry=record(raw);
  if(entry.enabled===false||entry.disabled===true)return null;
  const server:AgentMcpServer={name};
  if(typeof entry.url==='string')server.url=entry.url;
  else if(typeof entry.serverUrl==='string')server.url=entry.serverUrl;
  if(typeof entry.command==='string')server.command=entry.command;
  if(Array.isArray(entry.args))server.args=entry.args.filter((a:unknown)=>typeof a==='string');
  const headers=strings(entry.headers??entry.http_headers);if(Object.keys(headers).length)server.headers=headers;
  const env=strings(entry.env);if(Object.keys(env).length)server.env=env;
  if(typeof entry.bearer_token_env_var==='string')server.bearerTokenEnv=entry.bearer_token_env_var;
  return server.url||server.command?server:null;
 }).filter((server):server is AgentMcpServer=>!!server);
}

// TOML: only what Codex writes for MCP servers --------------------------------------------------
const tomlString=(text:string):string|null=>{
 const value=text.trim();
 if(value.startsWith('"')){try{return JSON.parse(value.replace(/^("(?:[^"\\]|\\.)*").*$/,'$1'));}catch{return null;}}
 if(value.startsWith("'")){const end=value.indexOf("'",1);return end>0?value.slice(1,end):null;}
 return null;
};
const tomlArray=(text:string):string[]=>{const inner=/^\[(.*)\]/.exec(text.trim());return inner?(inner[1].match(/"(?:[^"\\]|\\.)*"|'[^']*'/g)??[]).map(item=>tomlString(item)??'').filter(Boolean):[];};
const tomlTable=(text:string):Record<string,string>=>{
 const inner=/^\{(.*)\}/.exec(text.trim());const out:Record<string,string>={};
 if(!inner)return out;
 for(const match of inner[1].matchAll(/([A-Za-z0-9_."-]+)\s*=\s*("(?:[^"\\]|\\.)*"|'[^']*')/g)){const value=tomlString(match[2]);if(value!==null)out[match[1].replace(/^"|"$/g,'')]=value;}
 return out;
};
/** `[mcp_servers.<name>]` tables (and their `.env` / `.http_headers` subtables) from Codex `config.toml`. */
export function codexMcpServers(toml:string):AgentMcpServer[] {
 const servers:Record<string,Record<string,any>>={};
 let current:Record<string,any>|null=null,sub:string|null=null;
 for(const raw of toml.split(/\r?\n/)){
  const line=raw.replace(/^\s+/,'');
  if(!line||line.startsWith('#'))continue;
  const header=/^\[([^\]]+)\]\s*(#.*)?$/.exec(line);
  if(header){
   const parts=header[1].split('.').map(part=>part.trim().replace(/^"|"$/g,''));
   if(parts[0]==='mcp_servers'&&parts[1]){current=servers[parts[1]]??={};sub=parts[2]??null;if(sub)current[sub]??={};}
   else{current=null;sub=null;}
   continue;
  }
  if(!current)continue;
  const pair=/^([A-Za-z0-9_-]+)\s*=\s*(.+)$/.exec(line);
  if(!pair)continue;
  const [,key,value]=pair;
  if(sub){const s=tomlString(value);if(s!==null)current[sub][key]=s;continue;}
  if(['env','http_headers'].includes(key))current[key]=tomlTable(value);
  else if(key==='args')current.args=tomlArray(value);
  else if(key==='enabled')current.enabled=!/^false/.test(value.trim());
  else{const s=tomlString(value);if(s!==null)current[key]=s;}
 }
 return mcpServersFrom(servers);
}

// YAML: only the `mcp_servers:` block Hermes Agent writes -----------------------------------------
const yamlScalar=(text:string):string=>{
 const value=text.replace(/\s+#.*$/,'').trim();
 if(/^".*"$/.test(value)){try{return JSON.parse(value);}catch{return value.slice(1,-1);}}
 if(/^'.*'$/.test(value))return value.slice(1,-1).replace(/''/g,"'");
 return value;
};
/** The `mcp_servers:` map of a Hermes `config.yaml`: nested maps of scalars, plus `args` lists. */
export function hermesMcpServers(yaml:string):AgentMcpServer[] {
 const lines=yaml.split(/\r?\n/);
 const start=lines.findIndex(line=>/^mcp_servers\s*:\s*(#.*)?$/.test(line));
 if(start<0)return [];
 const root:Record<string,any>={};
 const stack:{indent:number;node:Record<string,any>;key?:string}[]=[{indent:-1,node:root}];
 for(const raw of lines.slice(start+1)){
  if(!raw.trim()||raw.trim().startsWith('#'))continue;
  const indent=raw.length-raw.trimStart().length,text=raw.trim();
  const item=/^-\s+(.*)$/.exec(text);
  if(indent===0&&!item)break;
  // `args:` may be followed by its items at the same indent.
  const opensList=(top:{indent:number;node:Record<string,any>;key?:string})=>!!item&&indent===top.indent&&!!top.key&&(Array.isArray(stack[stack.length-2]?.node[top.key])||!Object.keys(top.node).length);
  while(stack.length>1&&(indent<stack[stack.length-1].indent||(indent===stack[stack.length-1].indent&&!opensList(stack[stack.length-1]))))stack.pop();
  const parent=stack[stack.length-1];
  if(item){
   const owner=stack[stack.length-1];
   const holder=owner.key?stack[stack.length-2]?.node:null;
   if(holder&&owner.key){if(!Array.isArray(holder[owner.key]))holder[owner.key]=[];holder[owner.key].push(yamlScalar(item[1]));}
   continue;
  }
  const pair=/^("[^"]*"|'[^']*'|[^:]+?)\s*:\s*(.*)$/.exec(text);
  if(!pair)continue;
  const key=yamlScalar(pair[1]),value=pair[2];
  if(value===''||value.startsWith('#')){const node:Record<string,any>={};parent.node[key]=node;stack.push({indent,node,key});}
  else if(/^\[.*\]$/.test(value.trim()))parent.node[key]=tomlArray(value);
  else parent.node[key]=yamlScalar(value);
 }
 return mcpServersFrom(root);
}

/** `${NAME}` / `$NAME` references resolve from the Agent's environment. */
const resolve=(value:string,env:Record<string,string|undefined>)=>value.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}|\$([A-Za-z_][A-Za-z0-9_]*)/g,(_,a,b)=>env[a??b]??'');
const bearer=(headers:Record<string,string>|undefined,env:Record<string,string|undefined>)=>{
 for(const [key,value] of Object.entries(headers??{}))if(/^authorization$/i.test(key)){const match=/^\s*Bearer\s+(\S+)\s*$/i.exec(resolve(value,env));if(match)return match[1];}
 return '';
};

/** What becomes of one brought server. `env` is the Agent's environment (for `${VAR}` and
 * `bearer_token_env_var`); a token is only ever passed on to the matching Worldlet connection. */
export function planIntegration(server:AgentMcpServer,env:Record<string,string|undefined>={}):IntegrationPlan {
 const where=[server.name,server.url??'',server.command??'',...(server.args??[])].join(' ');
 if(GOOGLE.test(where))return {name:server.name,title:'Google Mail and Calendar',provider:'google',outcome:'reconnect'};
 const domain=server.url?host(server.url):'';
 const known=RECOGNIZERS.find(r=>(domain&&r.hosts.includes(domain))||r.packages.some(p=>where.toLowerCase().includes(p))||r.provider===server.name.toLowerCase());
 if(!known)return {name:server.name,title:server.name,provider:null,outcome:'stays'};
 let token=bearer(server.headers,env);
 if(!token&&server.bearerTokenEnv)token=env[server.bearerTokenEnv]??'';
 if(!token)for(const key of known.tokenEnv){const value=server.env?.[key]!==undefined?resolve(server.env[key],env):'';if(value){token=value;break;}}
 token=token.trim();
 // A placeholder or an unresolved reference is not a token.
 if(!token||/^(<.*>|your[_-]|xxx|\$)/i.test(token)||/\s/.test(token))return {name:server.name,title:known.title,provider:known.provider,outcome:'reconnect'};
 return {name:server.name,title:known.title,provider:known.provider,outcome:'port',token};
}

/** One plan per Worldlet connection: a ported one wins over a reconnect; unknown servers keep their names. */
export function planIntegrations(servers:AgentMcpServer[],env:Record<string,string|undefined>={}):IntegrationPlan[] {
 const plans:IntegrationPlan[]=[];
 const rank:Record<IntegrationOutcome,number>={port:0,reconnect:1,stays:2};
 for(const plan of servers.map(server=>planIntegration(server,env))){
  const same=plan.provider?plans.findIndex(p=>p.provider===plan.provider):-1;
  if(same<0)plans.push(plan);else if(rank[plan.outcome]<rank[plans[same].outcome])plans[same]=plan;
 }
 return plans.sort((a,b)=>rank[a.outcome]-rank[b.outcome]);
}
