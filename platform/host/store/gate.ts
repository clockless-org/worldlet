import {saveWithItem} from './attention.ts';
import type {WorldLedger} from './ledger.ts';

// What the Gate keeps (agent/gate/GRANTS.md): each Agent's audit trail (`agent.audit` entries), its asks, drafts and
// reports, the remote connections and Service reads it asked for (`state.*` buckets), and an ask's attachments.
type Row=Record<string,any>;
const attachmentsReady=new WeakSet<WorldLedger>();
function ensureAskAttachments(ledger:WorldLedger){
 if(attachmentsReady.has(ledger))return;
 ledger.exec('CREATE TABLE IF NOT EXISTS agent_ask_attachments (ask_id TEXT NOT NULL, id TEXT NOT NULL, data BLOB NOT NULL, PRIMARY KEY(ask_id, id));');
 attachmentsReady.add(ledger);
}

export class GateTables {
 /** One Agent's audit entry (`agent.audit`, agent/gate/GRANTS.md), keyed by its Agent; only its newest `keep` stay. */
 recordAgentAudit(this:WorldLedger,entry:Row,keep:number):boolean {
  const agent=typeof entry.agentId==='string'?entry.agentId:'';
  if(!agent||!this.record('agent.audit',agent,entry))return false;
  try{this.run("DELETE FROM entries WHERE kind='agent.audit' AND key=? AND seq NOT IN (SELECT seq FROM entries WHERE kind='agent.audit' AND key=? ORDER BY seq DESC LIMIT ?)",agent,agent,Math.max(1,keep));}catch{}
  return true;
 }
 /** One Agent's newest audit entries, newest first. */
 agentAudit(this:WorldLedger,agent:string,limit=50):Row[] {
  return this.all("SELECT body FROM entries WHERE kind='agent.audit' AND key=? ORDER BY seq DESC LIMIT ?",agent,Math.max(1,Math.min(500,limit))).flatMap(row=>{
   try{const value=JSON.parse(row.body);return value&&typeof value==='object'&&!Array.isArray(value)?[value]:[];}catch{return [];}
  });
 }
 // Agent asks (agent/gate/asks.ts, agent/gate/GRANTS.md#agent-asks) ---------------------------------------
 /** Every Agent ask's current value (`state.agent-asks`). */
 agentAsks(this:WorldLedger):Row[]{return this.records('agent-asks');}
 /** One ask and its Attention item, saved together. The item is the host's own (provider `agents`): its status is the
  * ask's, set by the person (`user`) or by an Agent's claim or resolve (`agent`), and its Agent the ask's. The bytes of
  * the attachments a new ask carries are saved with it (`agent_ask_attachments`); the ask keeps only what describes them. */
 saveAgentAsk(this:WorldLedger,ask:Row,item:Row,origin:'user'|'agent',attachments:{id:string;data:Uint8Array}[]=[]){
  this.transaction(()=>{
   if(attachments.length){
    ensureAskAttachments(this);
    for(const file of attachments)this.run('INSERT INTO agent_ask_attachments(ask_id,id,data) VALUES(?,?,?) ON CONFLICT(ask_id,id) DO UPDATE SET data=excluded.data',String(ask.id),file.id,file.data);
   }
   saveWithItem(this,'agent-asks','agent-asks',ask,item,origin,ask.agentId);
  });
 }
 /** `length` bytes of one ask's attachment from `offset` (SQLite reads only that part), or null when it is not kept. */
 agentAskAttachment(this:WorldLedger,askId:string,id:string,offset:number,length:number):Uint8Array|null {
  ensureAskAttachments(this);
  const row=this.all('SELECT substr(data,?,?) AS part FROM agent_ask_attachments WHERE ask_id=? AND id=?',Math.max(0,offset)+1,Math.max(0,length),askId,id)[0];
  return row?(row.part instanceof Uint8Array?row.part:new Uint8Array(0)):null;
 }
 // GitHub drafts (agent/gate/github-drafts.ts, agent/gate/GRANTS.md#github-drafts) -------------------------------
 /** Every GitHub draft's current value (`state.github-drafts`). */
 githubDrafts(this:WorldLedger):Row[]{return this.records('github-drafts');}
 /** One draft and its Attention item, saved together, as an ask is: the item is the host's own (provider `agents`), its
  * status the draft's, set by the person (`user`) or by the Agent's draft (`agent`), and its Agent the draft's. */
 saveGithubDraft(this:WorldLedger,draft:Row,item:Row,origin:'user'|'agent'){this.transaction(()=>saveWithItem(this,'github-drafts','github-drafts',draft,item,origin,draft.agentId));}
 // PostHog and Notion drafts (agent/gate/service-drafts.ts, agent/gate/GRANTS.md#posthog-and-notion-drafts) -------
 /** Every PostHog and Notion draft's current value (`state.service-drafts`). */
 serviceDrafts(this:WorldLedger):Row[]{return this.records('service-drafts');}
 /** One draft and its Attention item, saved together, as a GitHub draft is. */
 saveServiceDraft(this:WorldLedger,draft:Row,item:Row,origin:'user'|'agent'){this.transaction(()=>saveWithItem(this,'service-drafts','service-drafts',draft,item,origin,draft.agentId));}
 // Remote MCP consents (agent/gate/remote-mcp.ts, agent/gate/REMOTE-MCP.md) ----------------------------------------
 /** Every remote connection the person was asked to allow (`state.remote-mcp-consents`). */
 remoteConsents(this:WorldLedger):Row[]{return this.records('remote-mcp-consents');}
 /** One consent and its Attention item, saved together: the item is the host's own (provider `agents`), its status the
  * consent's, set by the person's answer (`user`) or by the request itself, or its running out (`agent`). */
 saveRemoteConsent(this:WorldLedger,consent:Row,item:Row,origin:'user'|'agent'){this.transaction(()=>saveWithItem(this,'remote-mcp-consents','remote-mcp',consent,item,origin));}
 // Service requests (agent/gate/service-requests.ts, agent/gate/GRANTS.md#when-an-agent-first-needs-a-service) -----
 /** Every Agent's request to read a Service, answered or not (`state.service-requests`). */
 serviceRequests(this:WorldLedger):Row[]{return this.records('service-requests');}
 /** One request and its Attention item, saved together, as a draft is: the item is the host's own (provider `agents`),
  * its status the request's, set by the person's answer (`user`) or by the refused call that asked (`agent`). */
 saveServiceRequest(this:WorldLedger,request:Row,item:Row,origin:'user'|'agent'){this.transaction(()=>saveWithItem(this,'service-requests','service-requests',request,item,origin,request.agentId));}
 // Agent reports (agent/gate/reports.ts, agent/gate/GRANTS.md#agent-reports) ------------------------------------
 /** Each Agent's one report (`state.agent-reports`, keyed by the Agent). */
 agentReports(this:WorldLedger):Row[]{return this.records('agent-reports');}
 saveAgentReport(this:WorldLedger,report:Row){this.put('agent-reports',report.agentId,report);}
}
