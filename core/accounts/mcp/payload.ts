// The shared payload decoding of the MCP connector readers (ported from Hermes mcp_session.py `mcp_payload`).
import type {McpToolResult} from './session.ts';
import {isDict,loads} from './python.ts';

/** `structuredContent` when it is an object, else the first text part that parses as JSON of one of `kinds`
 * ('dict' an object, 'list' an array). `error` when the tool failed, `unsupported` when nothing fits. */
export function mcpPayload(result:McpToolResult,error:string,unsupported:string,kinds:readonly ('dict'|'list')[]){
 if(result?.isError)throw new Error(error);
 const value=result?.structuredContent;
 if(isDict(value))return value;
 for(const part of result?.content??[]){
  let parsed:unknown;
  try{parsed=loads(part?.text??'');}catch{continue;}
  if(kinds.includes('dict')&&isDict(parsed)||kinds.includes('list')&&Array.isArray(parsed))return parsed as any;
 }
 throw new Error(unsupported);
}
