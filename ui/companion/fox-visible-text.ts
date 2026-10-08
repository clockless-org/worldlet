// Hermes heals empty interrupted messages with a provider-facing placeholder.
// Keep that transcript detail out of Fox's bubble, history and speech text.
const marker='[response interrupted]';
export function foxVisibleText(value:unknown,streaming=false){
 let text=String(value||'').replace(/(^|\n)[ \t]*\[response interrupted\][ \t]*(?=\r?\n|$)/gi,'$1');
 if(streaming){
  const start=text.lastIndexOf('\n')+1,tail=text.slice(start).trim().toLowerCase();
  if(tail.startsWith('[')&&marker.startsWith(tail))text=text.slice(0,start);
 }
 return text.trimEnd();
}

// Guided work has a separate public answer; tool deliberation must never become HUD copy.
export function guidedVisibleText(value:unknown){
 const match=String(value||'').match(/<worldlet-answer>([\s\S]*?)<\/worldlet-answer>/);
 return match?foxVisibleText(match[1]).trim():'';
}
