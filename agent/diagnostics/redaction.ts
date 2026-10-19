/** Diagnostic copies never need a navigation query, fragment, userinfo or bearer value. Keep protocol URLs intact elsewhere. */
export function redactDiagnosticText(value:unknown):string {
 return String(value??'').replace(/(?:https?:\/\/|(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?\/)[^\s"'<>]+/gi,address=>{
  try{const url=new URL(/^https?:/i.test(address)?address:'http://'+address);return url.origin+url.pathname;}catch{return '[address hidden]';}
 }).replace(/\bBearer\s+[^\s"'<>]+/gi,'Bearer [hidden]')
 .replace(/(["']?\b(?:access_token|refresh_token|id_token|token|client_secret|code_verifier|code|state)["']?\s*[:=]\s*)(?:"[^"\r\n]*"|'[^'\r\n]*'|[^\s,;&}]+)/gi,'$1[hidden]');
}
/** Capture complete diagnostic lines, including secrets split across stream chunks. Oversized lines and an
 * unfinished final line are omitted, never partially flushed. This does not transform the underlying protocol stream. */
export function diagnosticLineCapture(emit:(line:string)=>void){
 let pending='',dropping=false;
 const limit=64*1024;
 return (chunk:string)=>{
  for(const part of chunk.split(/(?<=\n)/)){
   const complete=part.endsWith('\n');
   if(!dropping){
    if(pending.length+part.length>limit){pending='';dropping=true;emit('[diagnostic line omitted: too long]\n');}
    else pending+=part;
   }
   if(complete){if(!dropping)emit(redactDiagnosticText(pending));pending='';dropping=false;}
  }
 };
}
