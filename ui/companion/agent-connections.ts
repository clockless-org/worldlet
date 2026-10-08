/** Settings › Integrations, the Agent's part: the MCP servers and chat accounts the person set up in each Agent on this
 * computer (host `harnessConnections`, contracts/harness-services.ts HarnessConnections), what each was last used for,
 * and Add or Remove for a server, each run as that Agent's own command only after the person confirmed the exact
 * command shown. Never a secret: addresses and commands arrive masked. An Agent whose connections cannot be changed
 * from here lists them only. */
type Connection={id:string;kind:'mcp'|'account';name:string;where:string;enabled:boolean;sign?:string;agent?:string;main?:boolean;removable?:boolean;lastUsed?:{at:number;tool?:string;thread?:string}};
type Harness={harness:string;title:string;connections:Connection[];changes:boolean;inUse?:boolean;error?:string};
const day=(at:number)=>new Date(at).toLocaleDateString(undefined,{year:'numeric',month:'short',day:'numeric'});
const SIGN:Record<string,string>={oauth:'signs in with OAuth',token:'uses a token kept in your Agent','needs-sign-in':'needs sign-in in your Agent'};
/** The line under a connection: what it is, where, how it signs in, and its profile when not the main one. */
export function connectionLine(c:Connection):string {
 const what=c.kind==='mcp'?'MCP server':'Chat account';
 const parts=[what,...c.where&&c.kind==='mcp'?[c.where]:[],...c.sign&&SIGN[c.sign]?[SIGN[c.sign]]:[],...c.agent&&!c.main&&c.agent!=='default'?[`profile “${c.agent}”`]:[],...c.enabled?[]:['turned off']];
 return parts.join(' · ');
}
/** What it was last used for, from the Agent's own history. */
export function connectionUseLine(c:Connection):string {
 const use=c.lastUsed;
 if(!use)return c.kind==='mcp'?'Not used in your Agent’s history yet.':'No conversation on it in your Agent’s history yet.';
 return `Last used ${day(use.at)}`+(use.tool?` for ${use.tool}`:'')+(use.thread?` in “${use.thread}”`:'')+'.';
}
export async function showAgentConnections(target:HTMLElement,call:(action:string,body?:any)=>Promise<any>,current:()=>boolean){
 const el=(tag:string,cls='',text='')=>Object.assign(document.createElement(tag),{className:cls,textContent:text});
 const button=(label:string,action:string,run:(b:HTMLButtonElement)=>void|Promise<void>,primary=false)=>{const b=el('button','companion-info-action'+(primary?' primary':''),label) as HTMLButtonElement;b.type='button';b.dataset.action=action;b.onclick=()=>{if(!b.disabled)void run(b);};return b;};
 const box=el('div','companion-settings-agent-connections'),said=el('p','companion-settings-status');said.setAttribute('role','status');
 target.append(el('h5','companion-settings-subhead','In your Agent'),el('p','companion-info-note','The MCP servers and chat accounts you set up in your Agent. Fox uses them through it; nothing is copied into Worldlet.'),box,said);
 /** Asks the host for the exact command, shows it, and runs it only on the person's own Confirm. */
 async function confirmChange(where:HTMLElement,harness:Harness,request:Record<string,unknown>,verb:string,done:string){
  said.textContent='';
  let preview:{command:string;confirm:string};
  try{preview=await call('harnessConnections',{operation:'preview',harness:harness.harness,...request});}
  catch(e){said.textContent=(e as Error).message||'Could not prepare that.';return;}
  if(!current())return;
  const ask=el('div','companion-settings-confirm');ask.dataset.confirm=harness.harness;
  const go=button(verb,'confirm-connection',async b=>{
   b.disabled=true;said.textContent=`${harness.title} is working on it…`;
   try{await call('harnessConnections',{operation:'change',confirm:preview.confirm});await draw();said.textContent=done;}
   catch(e){said.textContent=(e as Error).message||'It did not work.';if(ask.isConnected)ask.remove();}
  },true);
  ask.append(el('span','',`${harness.title} will run:`),el('code','',preview.command),go,button('Cancel','cancel-connection',()=>{ask.remove();said.textContent='Nothing was changed.';}));
  where.querySelector?.('.companion-settings-confirm')?.remove();
  where.append(ask);
 }
 async function draw(){
  const listed=await call('harnessConnections',{operation:'list'}).catch((e:Error)=>({error:e.message}));
  if(!current())return;
  box.replaceChildren();
  if(listed?.error)box.append(el('p','companion-info-note',listed.error));
  const harnesses:Harness[]=Array.isArray(listed?.harnesses)?listed.harnesses:[];
  for(const harness of harnesses){
   const rows=el('div','companion-settings-rows');rows.dataset.harness=harness.harness;
   box.append(el('h5','companion-settings-subhead',harness.title+(harness.inUse?' · In use':'')),rows);
   if(harness.error){rows.append(el('p','companion-info-note',harness.error));continue;}
   if(!harness.connections.length)rows.append(el('p','companion-info-note','No MCP servers or chat accounts yet.'));
   for(const c of harness.connections){
    const row=el('div','companion-settings-row'),words=el('div');row.dataset.connection=c.id;
    words.append(el('strong','',c.name),el('span','',connectionLine(c)),el('span','companion-settings-quiet',connectionUseLine(c)));
    row.append(words);
    if(harness.changes&&c.removable)row.append(button('Remove','remove-connection',()=>confirmChange(row,harness,{remove:c.id},'Remove',`${c.name} was removed from ${harness.title}.`)));
    rows.append(row);
   }
   if(!harness.changes){rows.append(el('p','companion-info-note',`Change these in ${harness.title} itself.`));continue;}
   const form=el('div','companion-settings-row'),fields=el('div');form.dataset.add=harness.harness;
   const name=el('input','companion-settings-input') as HTMLInputElement;name.placeholder='Name, like github';name.setAttribute('aria-label','Server name');name.spellcheck=false;name.autocomplete='off';
   const where=el('input','companion-settings-input') as HTMLInputElement;where.placeholder='https://… or npx -y @scope/server';where.setAttribute('aria-label','Server address or command');where.spellcheck=false;where.autocomplete='off';
   fields.append(el('strong','',`Add an MCP server to ${harness.title}`),el('span','','Its address, or the command that starts it. A server that needs a token or a sign-in is added in your Agent itself.'),name,where);
   form.append(fields,button('Add','add-connection',()=>{
    const value=where.value.trim(),add=/^https?:\/\//i.test(value)?{name:name.value.trim(),url:value}:{name:name.value.trim(),command:value};
    return confirmChange(form,harness,{add},'Add',`${add.name} was added to ${harness.title}. It is used from your Agent’s next conversation.`);
   }));
   rows.append(form);
  }
  if(!harnesses.length&&!listed?.error)box.append(el('p','companion-info-note','No Agent on this computer keeps connections Worldlet can read.'));
 }
 await draw();
}
