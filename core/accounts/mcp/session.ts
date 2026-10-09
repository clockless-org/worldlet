/** One connected MCP server, as the World's account connections reach it (the Platform's MCP client). Readers in
 * this folder are ports of harness/hermes/*_mcp.py: they call tools on it and shape the answers, nothing else. */
export interface McpContent {type:string;text?:string;[key:string]:unknown}
export interface McpToolResult {isError?:boolean;content?:McpContent[];structuredContent?:unknown}
export interface McpSession {
 /** `timeoutSeconds`: the read timeout the Python original passed (`read_timeout_seconds`). */
 callTool(name:string,args:Record<string,unknown>,timeoutSeconds?:number):Promise<McpToolResult>;
}
