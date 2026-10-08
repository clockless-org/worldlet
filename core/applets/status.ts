// Public entry points whose core browsing function works without an account.
// Do not infer this from an arbitrary URL or from having opened a website.
const PUBLIC_APPLETS=new Set(['browser','youtube','google-maps','airbnb','github','random-game']);
// Product support and account/runtime state are separate dimensions.
export function appletSupport(app){
 const level=app.availability?.world===false?'unavailable':app.capability==='planned'||app.connection?.capability==='planned'?'planned':app.support?.level==='ready'&&app.support?.acceptance?'ready':'building';
 return {level,label:{ready:'Ready',building:'Building',planned:'Planned',unavailable:'Unavailable'}[level]};
}

// The Mac publishes connection facts (connected/running/failed/needsAttention/savedItemCount);
// fixtures and older records carry one status string. Both normalize here, nowhere else.
export function connectionFacts(link){
 if(!link)return null;
 if(typeof link.connected==='boolean'){
  return {connected:link.connected,running:!!link.running,synthesizing:!!link.synthesizing,failed:!!link.failed,attention:!!link.needsAttention,
   pending:!link.connected&&['pending','authorizing'].includes(link.syncStatus),activity:'reading',savedItems:Number.isInteger(link.savedItemCount)?link.savedItemCount:null};
 }
 const s=link.status||'';
 return {connected:['connected','syncing','reading','attention','sync_error'].includes(s),running:['syncing','reading'].includes(s),synthesizing:false,
  failed:['sync_error','error','expired','revoked'].includes(s),attention:s==='attention',pending:['pending','authorizing'].includes(s),
  activity:s==='syncing'?'syncing':'reading',savedItems:null};
}
export const connectionLive=link=>!!connectionFacts(link)?.connected;
// A connected source that is still being read, or whose read records still wait for Attention
// synthesis, can publish Attention items shortly; the empty Center says so instead of looking finished.
export const sourcesReading=(links:any[]=[])=>links.some(link=>{const facts=connectionFacts(link);return !!(facts?.running||facts?.synthesizing);});

function connectionSummary(link,facts){
 if(link.summary&&!facts.failed)return link.summary;
 if(facts.savedItems===null)return '';
 if(facts.running)return 'Reading this app…';
 return facts.savedItems?`${facts.savedItems} saved ${facts.savedItems===1?'item needs':'items need'} attention`:'No saved items need attention';
}

export function appletStatus(app,connections=[]){
 const support=appletSupport(app),link=connections.find(c=>c.provider===(app.provider||app.key)),facts=connectionFacts(link);
 const count=Number.isInteger(link?.resultCount)?link.resultCount:Array.isArray(link?.records)&&link.records.length?link.records.length:null;
 const noun=app.content?.noun||['record','records'];
 const countText=count===null?'':Number.isInteger(link?.resultCount)?`${count} in last result`:`${count} ${count===1?noun[0]:noun[1]}`;
 const result=(state: string,phase: string,title: string,extra: {connected?: boolean;activity?: string}={})=>({state,phase,connected:!!facts?.connected,usableWithoutLogin:!['unavailable','planned'].includes(support.level)&&PUBLIC_APPLETS.has(app.key),failed:!!facts?.failed,support:support.level,count,label:[title,countText,link&&connectionSummary(link,facts)].filter(Boolean).join(' · '),...extra});
 // The sample world's Applets hold authored records and items. They read as alive,
 // Keep fictional records distinct from a connected account.
 if(link?.sample)return result('sample','sample','Preset content',{connected:true});
 if(support.level==='unavailable')return result('disconnected','unavailable','');
 if(support.level==='planned')return result('disconnected','planned','');
 if(app.capability==='launch')return result('disconnected','local','Local app');
 if(app.capability==='local')return result('disconnected','local','Local');
 if(app.capability==='browser')return result('disconnected','browser','Website');
 if(!facts)return result('disconnected','disconnected','Not connected');
 const activityLabel=app.content?.activity||'Reading';
 if(facts.running)return result('connected',facts.activity,facts.activity==='syncing'?'Syncing…':activityLabel+'…',{connected:true,activity:facts.activity});
 if(facts.attention&&!facts.failed)return result('connected','attention','Needs attention',{connected:true});
 if(facts.pending)return result('pending','connecting','Connecting…');
 if(facts.connected)return result('connected','connected','Connected',{connected:true});
 return result('disconnected','disconnected','Not connected');
}

// Compact world tokens; detailed support/runtime copy stays in Fox and docs.
export function appletIndicator(app,connections=[]){
 const status=appletStatus(app,connections),phase=status.phase;
 if(phase==='sample')return {icon:'link',phase,label:'Preset content'};
 if(['planned','unavailable'].includes(phase))return {icon:'lock',phase,label:'Not yet available'};
 if(phase==='attention')return {icon:'alert',phase,label:'Needs attention'};
 if(['connecting','syncing','reading'].includes(phase))return {icon:'refresh',phase,label:phase==='reading'?(app.content?.activity||'Reading'):{connecting:'Connecting',syncing:'Syncing'}[phase]};
 if(phase==='connected')return {icon:'link',phase,label:'Connected'};
 if(phase==='local')return {icon:'terminal',phase,label:'Local tool'};
 if(phase==='browser')return {icon:'compass',phase,label:'Website'};
 return {icon:'plug',phase,label:'Connect to get started'};
}
