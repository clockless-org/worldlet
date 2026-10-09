/** One connected MCP server, as the World's account connections reach it (the Platform's MCP client). Readers in
 * this folder are ports of harness/hermes/*_mcp.py: they call tools on it and shape the answers, nothing else. */
export interface McpContent {type:string;text?:string;[key:string]:unknown}
/** A tool answer. A missing `isError` is a success and missing `content` is empty, as in the MCP SDKs. */
export interface McpToolResult {isError?:boolean;content?:McpContent[];structuredContent?:unknown}
export interface McpTool {name:string;inputSchema?:unknown;[key:string]:unknown}
export interface McpSession {
 /** `timeoutSeconds`: the read timeout the Python original passed (`read_timeout_seconds`). */
 callTool(name:string,args:Record<string,unknown>,timeoutSeconds?:number):Promise<McpToolResult>;
 /** The server's tools (`tools/list`). Linear fits its list arguments to it; Notion writes check their schema. */
 listTools():Promise<{tools:McpTool[]}>;
}
/** What the Python `connected_session(name, urls, connect_msg, url_msg, disconnected_msg, include, bearer)` gate
 * checked before a reader ran, now the Platform's job: the server must be configured, enabled and authorized
 * (`connectMessage` otherwise; `bearer` also accepts a saved API key header), its URL one of `urls`
 * (`urlMessage`), and connected (`disconnectedMessage`). `include` limits the tools registered for chat (null:
 * all). `timeoutSeconds` bounds the whole read, as the Python `run(..., timeout=)` did. */
export interface McpGate {
 name:string;urls:readonly string[];connectMessage:string;urlMessage:string;disconnectedMessage:string;
 include:readonly string[]|null;bearer:boolean;timeoutSeconds:number;
}
