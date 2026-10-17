// Bounded reads of the person's own GitHub work through GitHub's official remote MCP server: their open pull requests,
// the reviews asked of them, the Issues assigned to them, one Issue or pull request with its newest comments, a search,
// and one repository's newest releases. No writes. Every answer is cut to a fixed size before it reaches an Agent (contracts/services.ts).
import type {McpGate,McpSession,McpToolResult} from './session.ts';
import type {ServiceComment,ServiceRead,ServiceRecord,ServiceRecords} from '../../../contracts/services.ts';
import {ValueError,isDict,dget} from './python.ts';
import {mcpPayload} from './payload.ts';

export const GITHUB_ENDPOINT='https://api.githubcopilot.com/mcp/';
/** The official server, as Worldlet and as an Agent's own profile may name it (`/readonly` serves only read tools). */
export const GITHUB_ENDPOINTS:readonly string[]=Object.freeze([GITHUB_ENDPOINT,'https://api.githubcopilot.com/mcp','https://api.githubcopilot.com/mcp/readonly']);
/** The only tools the reader calls; each is a read on GitHub's server. */
export const GITHUB_TOOLS:readonly string[]=Object.freeze(['search_issues','search_pull_requests','issue_read','list_releases']);
/** GitHub's server takes a token (a fine-grained personal access token) as a Bearer header, as an Agent's own
 * profile saves it, or one made through Worldlet keeps it in the vault (`mcp:github`). */
export const GITHUB_GATE:McpGate=Object.freeze({name:'github',urls:GITHUB_ENDPOINTS,connectMessage:'Connect GitHub first.',
 urlMessage:'Reconnect to GitHub\'s official MCP server.',disconnectedMessage:'GitHub is disconnected or its token has expired. Reconnect GitHub.',include:GITHUB_TOOLS,bearer:true,timeoutSeconds:60});

/** Caps on what one read returns. */
export const GITHUB_LIMITS=Object.freeze({listPerQuery:10,searchPage:20,searchPages:10,title:300,text:4000,comments:20,comment:1000,labels:8,query:256,
 /** `releases`: newest first, a page at a time, and the asset names each one lists. */
 releasesPage:10,releasesPages:5,assets:20,asset:100});
const TIMEOUT=30;
/** `owner/repo#123`: an account name (letters, digits and hyphens) and a repository name that is not only dots. */
const ID=/^([A-Za-z0-9-]{1,39})\/((?!\.+#)[A-Za-z0-9_.-]{1,100})#([1-9][0-9]{0,8})$/;
/** What `list` gathers, each its own search: newest first, archived repositories left out. */
const LISTS=[
 {reason:'Your pull request',tool:'search_pull_requests',query:'is:open is:pr author:@me archived:false'},
 {reason:'Review requested',tool:'search_pull_requests',query:'is:open is:pr review-requested:@me archived:false'},
 {reason:'Assigned to you',tool:'search_issues',query:'is:open is:issue assignee:@me archived:false'},
] as const;

const payload=(result:McpToolResult)=>mcpPayload(result,'GitHub could not answer this read. Reconnect GitHub or open the website.','GitHub returned an unsupported response.',['dict','list']);
const cut=(value:unknown,limit:number)=>{const text=typeof value==='string'?value:'';return [...text].length>limit?[...text].slice(0,limit-1).join('')+'…':text;};

/** `owner/repo`: the same account and repository names. */
const REPOSITORY=/^([A-Za-z0-9-]{1,39})\/((?!\.+$)[A-Za-z0-9_.-]{1,100})$/;

/** `owner/repo#123`, checked. */
export function githubRecordId(value:unknown){
 const match=typeof value==='string'?ID.exec(value):null;
 if(!match)throw new ValueError('Invalid GitHub record ID. Use owner/repo#123 from a list or search.');
 return {owner:match[1],repo:match[2],number:Number(match[3])};
}
/** `owner/repo`, checked: the repository a `releases` read names. */
export function githubRepository(value:unknown){
 const match=typeof value==='string'?REPOSITORY.exec(value):null;
 if(!match)throw new ValueError('Invalid GitHub repository. Use owner/repo.');
 return {owner:match[1],repo:match[2]};
}
/** The repository an answer names: `repository_url` (REST), `repository.full_name`, or the record's web address. */
function repository(row:Record<string,any>):string|null {
 const api=dget(row,'repository_url');
 if(typeof api==='string'){const match=/^https:\/\/api\.github\.com\/repos\/([^/]+\/[^/]+)$/.exec(api);if(match)return match[1];}
 const full=isDict(dget(row,'repository'))?dget(row.repository,'full_name'):null;
 if(typeof full==='string'&&/^[^/\s]+\/[^/\s]+$/.test(full))return full;
 const web=dget(row,'html_url');
 if(typeof web==='string'){const match=/^https:\/\/github\.com\/([^/]+\/[^/]+)\/(?:issues|pull)\/\d+/.exec(web);if(match)return match[1];}
 return null;
}
function login(value:unknown):string {return isDict(value)&&typeof dget(value,'login')==='string'?cut(value.login,100):'';}
/** One Issue or pull request as a record; null when the answer is not one. */
function record(row:unknown,reason?:string):ServiceRecord|null {
 if(!isDict(row)||typeof dget(row,'title')!=='string'||!Number.isInteger(dget(row,'number')))return null;
 const repo=repository(row);
 if(!repo)return null;
 const id=`${repo}#${row.number}`;
 try{githubRecordId(id);}catch{return null;}
 const pull=isDict(dget(row,'pull_request'))||typeof dget(row,'html_url')==='string'&&/\/pull\/\d+/.test(row.html_url);
 const web=dget(row,'html_url');
 const url=typeof web==='string'&&web.startsWith(`https://github.com/${repo}/`)?web:`https://github.com/${repo}/${pull?'pull':'issues'}/${row.number}`;
 const fields:Record<string,string|number|boolean>={kind:pull?'pull request':'issue',repository:repo,number:row.number};
 if(reason)fields.reason=reason;
 if(typeof dget(row,'state')==='string')fields.state=cut(row.state,20);
 if(dget(row,'draft')===true)fields.draft=true;
 const author=login(dget(row,'user'));if(author)fields.author=author;
 const labels=Array.isArray(dget(row,'labels'))?row.labels.map((l:unknown)=>typeof l==='string'?l:isDict(l)&&typeof dget(l,'name')==='string'?l.name:'').filter(Boolean).slice(0,GITHUB_LIMITS.labels):[];
 if(labels.length)fields.labels=labels.map((l:string)=>cut(l,50)).join(', ');
 const assignees=Array.isArray(dget(row,'assignees'))?row.assignees.map(login).filter(Boolean).slice(0,5):[];
 if(assignees.length)fields.assignees=assignees.join(', ');
 if(Number.isInteger(dget(row,'comments')))fields.comments=row.comments;
 if(typeof dget(row,'created_at')==='string')fields.createdAt=cut(row.created_at,40);
 const updated=typeof dget(row,'updated_at')==='string'?cut(row.updated_at,40):undefined;
 return {id,title:cut(row.title,GITHUB_LIMITS.title),url,...updated?{updatedAt:updated}:{},fields};
}
function items(value:unknown):unknown[] {
 const rows=Array.isArray(value)?value:isDict(value)?['items','issues','pull_requests','releases','results'].map(k=>dget(value,k)).find(Array.isArray):null;
 if(!Array.isArray(rows))throw new Error('GitHub did not return a list.');
 return rows;
}
/** One release as a record: its tag, name, when it was published, whether it is a prerelease or a draft, and its assets'
 * names and count. Null when the answer is not one. */
function release(row:unknown,repo:string):ServiceRecord|null {
 if(!isDict(row))return null;
 const tag=dget(row,'tag_name')??dget(row,'tagName');
 if(typeof tag!=='string'||!tag.trim()||/[\u0000-\u001f\u007f]/.test(tag))return null;
 const web=dget(row,'html_url')??dget(row,'url'),name=dget(row,'name');
 const url=typeof web==='string'&&web.startsWith(`https://github.com/${repo}/releases/`)?web:`https://github.com/${repo}/releases/tag/${encodeURIComponent(tag)}`;
 const assets=Array.isArray(dget(row,'assets'))?row.assets.map((a:unknown)=>isDict(a)&&typeof dget(a,'name')==='string'?a.name:'').filter(Boolean):[];
 const published=dget(row,'published_at')??dget(row,'publishedAt'),created=dget(row,'created_at')??dget(row,'createdAt');
 const fields:Record<string,string|number|boolean>={repository:repo,tag:cut(tag,GITHUB_LIMITS.title),name:cut(typeof name==='string'&&name.trim()?name:tag,GITHUB_LIMITS.title),
  prerelease:dget(row,'prerelease')===true,draft:dget(row,'draft')===true,assetCount:assets.length};
 if(typeof published==='string')fields.publishedAt=cut(published,40);
 if(assets.length)fields.assets=assets.slice(0,GITHUB_LIMITS.assets).map((a:string)=>cut(a,GITHUB_LIMITS.asset)).join(', ');
 const author=login(dget(row,'author'));if(author)fields.author=author;
 const when=typeof published==='string'?published:typeof created==='string'?created:undefined;
 return {id:`${repo}@${fields.tag}`,title:String(fields.name),url,...when?{updatedAt:cut(when,40)}:{},fields};
}
const newestFirst=(a:ServiceRecord,b:ServiceRecord)=>(b.updatedAt??'').localeCompare(a.updatedAt??'');

/** The reader calls only GITHUB_TOOLS, whatever else the server offers. */
async function call(session:McpSession,tool:string,args:Record<string,unknown>){
 if(!GITHUB_TOOLS.includes(tool))throw new ValueError('This GitHub tool is not allowed.');
 return payload(await session.callTool(tool,args,TIMEOUT));
}
async function search(session:McpSession,tool:string,query:string,perPage:number,page:number){
 // A server that sends more than it was asked for is cut to the page.
 return items(await call(session,tool,{query,perPage,page,sort:'updated',order:'desc'})).slice(0,perPage);
}

/** `list`, `read` (one `owner/repo#123`) or `search` (`query`, paged by `cursor`). */
export async function readGithub(session:McpSession,body:ServiceRead|Record<string,any>):Promise<ServiceRecords> {
 const operation=dget(body,'operation');
 if(operation==='list'){
  if(dget(body,'cursor')||dget(body,'query')||dget(body,'id'))throw new ValueError('GitHub\'s list takes no ID, query or cursor. Use search for more.');
  const seen=new Map<string,ServiceRecord>();
  for(const list of LISTS){
   for(const row of await search(session,list.tool,list.query,GITHUB_LIMITS.listPerQuery,1)){
    const found=record(row,list.reason);
    if(!found)continue;
    const earlier=seen.get(found.id);
    if(earlier)earlier.fields.reason=`${earlier.fields.reason}; ${list.reason}`;else seen.set(found.id,found);
   }
  }
  return {provider:'github',operation,records:[...seen.values()].sort(newestFirst),
   scope:`Open pull requests you wrote, reviews requested of you and Issues assigned to you · up to ${GITHUB_LIMITS.listPerQuery} of each · Read only`};
 }
 if(operation==='search'){
  const query=dget(body,'query');
  if(typeof query!=='string'||!query.trim()||[...query].length>GITHUB_LIMITS.query)throw new ValueError(`Search GitHub with a query of up to ${GITHUB_LIMITS.query} characters.`);
  const cursor=dget(body,'cursor');
  const page=cursor===undefined||cursor===null||cursor===''?1:/^[1-9][0-9]?$/.test(String(cursor))?Number(cursor):0;
  if(page<1||page>GITHUB_LIMITS.searchPages)throw new ValueError('Invalid GitHub search cursor.');
  if(dget(body,'id'))throw new ValueError('GitHub search takes no ID. Read a result by its ID.');
  // GitHub's server searches Issues and pull requests with separate tools; a query naming one asks only that one.
  const kinds=/\bis:pr\b|\btype:pr\b/i.test(query)?['search_pull_requests']:/\bis:issue\b|\btype:issue\b/i.test(query)?['search_issues']:['search_issues','search_pull_requests'];
  const per=Math.floor(GITHUB_LIMITS.searchPage/kinds.length);
  const seen=new Map<string,ServiceRecord>();
  let full=false;
  for(const tool of kinds){
   const rows=await search(session,tool,query.trim(),per,page);
   if(rows.length>=per)full=true;
   for(const row of rows){const found=record(row);if(found&&!seen.has(found.id))seen.set(found.id,found);}
  }
  const more=full&&page<GITHUB_LIMITS.searchPages;
  return {provider:'github',operation,records:[...seen.values()].sort(newestFirst),...more?{cursor:String(page+1)}:{},scope:`GitHub search, page ${page} · Read only`};
 }
 if(operation==='read'){
  const {owner,repo,number}=githubRecordId(dget(body,'id'));
  if(dget(body,'query')||dget(body,'cursor'))throw new ValueError('A GitHub read takes only the record ID.');
  const issue=await call(session,'issue_read',{method:'get',owner,repo,issue_number:number});
  const raw=isDict(issue)&&isDict(dget(issue,'issue'))?issue.issue:issue;
  const found=record(raw);
  if(!found||found.id.toLowerCase()!==`${owner}/${repo}#${number}`.toLowerCase())throw new Error('GitHub returned a different record. Search again.');
  found.text=cut(dget(raw,'body'),GITHUB_LIMITS.text);
  // The newest comments: the last page of at most `comments`, when GitHub said how many there are.
  const count=typeof found.fields.comments==='number'?found.fields.comments:0;
  const comments:ServiceComment[]=[];
  if(count>0){
   const page=Math.max(1,Math.ceil(count/GITHUB_LIMITS.comments));
   for(const row of items(await call(session,'issue_read',{method:'get_comments',owner,repo,issue_number:number,perPage:GITHUB_LIMITS.comments,page})).slice(-GITHUB_LIMITS.comments)){
    if(!isDict(row)||typeof dget(row,'body')!=='string')continue;
    comments.push({author:login(dget(row,'user'))||'someone',...typeof dget(row,'created_at')==='string'?{at:cut(row.created_at,40)}:{},text:cut(row.body,GITHUB_LIMITS.comment)});
   }
  }
  found.comments=comments;
  return {provider:'github',operation,records:[found],scope:`One ${found.fields.kind} with its newest ${GITHUB_LIMITS.comments} comments at most · Read only`};
 }
 if(operation==='releases'){
  const {owner,repo}=githubRepository(dget(body,'id'));
  if(dget(body,'query'))throw new ValueError('GitHub releases take only the repository, owner/repo.');
  const cursor=dget(body,'cursor');
  const page=cursor===undefined||cursor===null||cursor===''?1:/^[1-9][0-9]?$/.test(String(cursor))?Number(cursor):0;
  if(page<1||page>GITHUB_LIMITS.releasesPages)throw new ValueError('Invalid GitHub releases cursor.');
  // GitHub lists releases newest first; a server that sends more than it was asked for is cut to the page.
  const rows=items(await call(session,'list_releases',{owner,repo,perPage:GITHUB_LIMITS.releasesPage,page})).slice(0,GITHUB_LIMITS.releasesPage);
  const records=rows.flatMap(row=>{const found=release(row,`${owner}/${repo}`);return found?[found]:[];});
  const more=rows.length>=GITHUB_LIMITS.releasesPage&&page<GITHUB_LIMITS.releasesPages;
  return {provider:'github',operation,records,...more?{cursor:String(page+1)}:{},scope:`Releases of ${owner}/${repo}, newest first, page ${page} · Read only`};
 }
 throw new ValueError('Unsupported GitHub read. Use list, read, search or releases.');
}
