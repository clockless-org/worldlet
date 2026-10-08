import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {codexMcpServers,hermesMcpServers,mcpServersFrom,planIntegration,planIntegrations} from '../core/agent/index.ts';
import {agentIntegrationPlans} from '../platform/electron/src/modules/agent-runtime/agent-integrations.ts';
import {withTempDir} from './test-temp.ts';

// Integrations a brought Agent already had (owner request 2026-10-04): each Agent's MCP settings are
// read, a server with its own token becomes the matching Worldlet connection, one signed in through
// that app's own OAuth is listed to reconnect, and servers Worldlet has no connection for stay.

// Codex config.toml: tables, inline env, subtables and a bearer token variable.
const codex=codexMcpServers(`model = "gpt-5"
[mcp_servers.github]
url = "https://api.githubcopilot.com/mcp/"
bearer_token_env_var = "GH_PAT"
[mcp_servers.linear]
command = "npx"
args = ["-y", "linear-mcp"]
env = { LINEAR_API_KEY = "lin_api_123" }
[mcp_servers.notion.env]
NOTION_TOKEN = 'ntn_abc'
[mcp_servers.notion]
command = "npx"
[mcp_servers.off]
command = "x"
enabled = false
[profiles.fast]
model = "gpt-5-mini"
`);
assert.deepEqual(codex.map(s=>s.name),['github','linear','notion'],'disabled servers and other tables are left out');
assert.equal(codex[0].bearerTokenEnv,'GH_PAT');
assert.deepEqual(codex[1].env,{LINEAR_API_KEY:'lin_api_123'});
assert.deepEqual(codex[2].env,{NOTION_TOKEN:'ntn_abc'});

// Hermes config.yaml: the mcp_servers block only, with headers and an args list at the same indent.
const hermes=hermesMcpServers(`model:
  provider: openrouter
mcp_servers:
  github:
    url: https://api.githubcopilot.com/mcp/
    headers:
      Authorization: "Bearer \${GITHUB_TOKEN}"
  files:
    command: npx
    args:
    - -y
    - "@modelcontextprotocol/server-filesystem"
  gmail:
    url: https://gmail-mcp.example.com/mcp
toolsets: [web]
`);
assert.deepEqual(hermes.map(s=>s.name),['github','files','gmail']);
assert.deepEqual(hermes[1].args,['-y','@modelcontextprotocol/server-filesystem']);

// Plans: a token ports, OAuth reconnects, Google always reconnects, unknown servers stay.
assert.deepEqual(planIntegration(hermes[0],{GITHUB_TOKEN:'ghp_real'}),{name:'github',title:'GitHub',provider:'github',outcome:'port',token:'ghp_real'});
assert.equal(planIntegration(hermes[0],{}).outcome,'reconnect','an unresolved reference is not a token');
assert.equal(planIntegration({name:'notion',url:'https://mcp.notion.com/mcp'}).outcome,'reconnect','OAuth belongs to the other app');
assert.equal(planIntegration({name:'gh',command:'npx',args:['@modelcontextprotocol/server-github'],env:{GITHUB_PERSONAL_ACCESS_TOKEN:'<your token>'}}).outcome,'reconnect','a placeholder is not a token');
assert.deepEqual(planIntegration(hermes[2]),{name:'gmail',title:'Google Mail and Calendar',provider:'google',outcome:'reconnect'});
assert.deepEqual(planIntegration(hermes[1]),{name:'files',title:'files',provider:null,outcome:'stays'});
const plans=planIntegrations([...hermes,...codex],{GH_PAT:'ghp_2'});
assert.deepEqual(plans.map(p=>[p.provider??p.name,p.outcome]),[['github','port'],['linear','port'],['notion','port'],['google','reconnect'],['files','stays']],'one plan per connection, ported first');
assert.equal(plans[0].token,'ghp_2','a ported plan wins over a reconnect for the same connection');
assert.deepEqual(mcpServersFrom({a:{url:'https://x'},b:{disabled:true,command:'y'},c:'nonsense'}).map(s=>s.name),['a']);

// The host reads each Agent's own settings from its home.
await withTempDir('worldlet-integrations-',dir=>{
 const home=path.join(dir,'home');fs.mkdirSync(path.join(home,'.codex'),{recursive:true});fs.mkdirSync(path.join(home,'.openclaw'),{recursive:true});
 fs.writeFileSync(path.join(home,'.claude.json'),JSON.stringify({mcpServers:{linear:{type:'http',url:'https://mcp.linear.app/mcp',headers:{Authorization:'Bearer lin_9'}}},projects:{'/p':{mcpServers:{todoist:{command:'npx',args:['todoist-mcp'],env:{TODOIST_API_TOKEN:'tt_1'}}}}}}));
 fs.writeFileSync(path.join(home,'.codex','config.toml'),'[mcp_servers.github]\nurl = "https://api.githubcopilot.com/mcp/"\n');
 fs.writeFileSync(path.join(home,'.openclaw','openclaw.json'),'{mcp:{servers:{supabase:{url:"https://mcp.supabase.com/mcp",headers:{Authorization:"Bearer ${SB}"}}}}}');
 fs.writeFileSync(path.join(home,'.openclaw','.env'),'SB=sbp_1\n');
 const env={HOME:home};
 assert.deepEqual(agentIntegrationPlans('claude-code',home,env).map(p=>[p.provider,p.outcome,p.token]),[['linear','port','lin_9'],['todoist','port','tt_1']]);
 assert.deepEqual(agentIntegrationPlans('codex',home,env).map(p=>[p.provider,p.outcome]),[['github','reconnect']]);
 assert.deepEqual(agentIntegrationPlans('openclaw',home,env).map(p=>[p.provider,p.outcome,p.token]),[['supabase','port','sbp_1']]);
 assert.deepEqual(agentIntegrationPlans('pi',home,env),[]);
});
console.log('PASS brought integrations: Codex, Hermes, Claude Code and OpenClaw MCP settings; tokens port, OAuth and Google reconnect, the rest stay');
