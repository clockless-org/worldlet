// The Agent line in the World's bottom-right corner, from the host's Agent detection (`agentHarness` detect):
// the chosen local Agent's name and version ("Hermes 0.21.4"), its name alone when the version could not be read,
// "OpenClaw" for an OpenClaw Gateway on another computer, and nothing when no Agent is chosen.
/** Which Agent the corner names (its id picks the mark) and the words beside it. */
export function agentVersionLine(found:any):{id:string;text:string} {
 const none={id:'',text:''};
 if(!found||typeof found!=='object')return none;
 const agents=Array.isArray(found.agents)?found.agents:[];
 const chosen=typeof found.selected==='string'?agents.find((a:any)=>a?.id===found.selected&&typeof a.title==='string'):null;
 if(chosen){
  const version=typeof chosen.version?.current==='string'?chosen.version.current:'';
  return {id:chosen.id,text:[chosen.title,version].filter(Boolean).join(' ')};
 }
 if(found.gateway?.active===true)return {id:'openclaw',text:'OpenClaw'};
 return none;
}
