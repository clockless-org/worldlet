import {modelFailure} from './model-failure.ts';
// Model setup is a local Fox guide, available before inference is configured.
// Credential input never goes through chat, guide text, storage, or model context.
const FEATURED_IDS=['openai-codex','opencode-go','anthropic','openai','openai-api'];
export function createFoxModelGuide({call,view,setup}){
 let epoch=0,secret=null,signingIn=false,onConnected=null;
 const clear=()=>{if(secret)secret.value='';secret=null;};
 const stop=()=>{epoch++;clear();if(signingIn){signingIn=false;void call('modelCancel').catch(()=>{});}};
 const button=(name,action)=>{const node=document.createElement('button');node.type='button';node.textContent=name;node.onclick=()=>void action();return node;};
 const render=(text,actions=[],body=null)=>{clear();view.setGuide({source:'model-setup',takeover:true,text,actions,body});};
 const done=()=>{stop();view.setGuide(null);};
 const connectMail=()=>{done();if(onConnected){void onConnected();return;}void setup?.('connection','gmail');};
 const nextStep=()=>setup?[button('Connect Mail',connectMail)]:[];
 // Worldlet provides no model (owner decision 2026-10-05): without one connected here, Fox cannot answer yet.
 const later=()=>render('That’s okay. Fox needs an AI on this computer to answer, so you can set one up any time in Settings, under Model.',[button('Done',done)]);
 const failure=error=>render(modelFailure(error)?.message || 'I couldn’t connect just yet. Check your provider details and try again. Your key is never added to our conversation.',[button('Try again',show),button('Not now',later)]);
 const splitCatalog=providers=>{
  const featured=[],used=new Set();
  for(const id of FEATURED_IDS){
   const match=providers.find(p=>p.id===id||p.provider===id);
   if(match&&!used.has(match.id)){featured.push(match);used.add(match.id);}
  }
  const custom=providers.find(p=>p.id==='custom');
  if(custom&&!used.has(custom.id)){featured.push(custom);used.add(custom.id);}
  if(!featured.length)return {featured:providers,rest:[]};
  return {featured,rest:providers.filter(p=>!used.has(p.id)).sort((a,b)=>a.name.localeCompare(b.name,'en'))};
 };
 const catalogBody=(items,filterable=false)=>{
  const wrap=document.createElement('div');wrap.className='fox-model-catalog-wrap';
  const list=document.createElement('ul');list.className='fox-model-catalog';
  for(const item of items){const row=document.createElement('li');row.append(button(item.name,()=>details(item)));list.append(row);}
  if(filterable&&items.length>8){
   const filter=document.createElement('input');filter.type='search';filter.className='fox-model-filter';
   filter.setAttribute('aria-label','Filter providers');filter.placeholder='Filter providers';
   filter.addEventListener('input',()=>{const q=filter.value.trim().toLowerCase();for(const row of list.children as HTMLCollectionOf<HTMLElement>)row.hidden=!!q&&!row.textContent.toLowerCase().includes(q);});
   wrap.append(filter);
  }
  wrap.append(list);return wrap;
 };
 async function show(resume?: ()=>any){
  if(typeof resume==='function')onConnected=resume;
  stop();const turn=epoch;view.revealGuide?.();
  const info=await call('foxPreferences').catch(()=>null);if(turn!==epoch)return;
  if(info?.model?.ready)window.dispatchEvent(new Event('worldlet:model-refresh'));
  if(info?.model?.ready && onConnected){const resume=onConnected;onConnected=null;done();await resume();return;}
  if(info?.model?.ready){render(`I’m connected to ${info.model.name}. You can keep chatting, or change my connection here.`,[button('Keep chatting',()=>{done();view.openText?.();}),...(info.model.provider==='openai-codex'?[button('Check available models',repair)]:[]),button('Choose a model',()=>providers())]);return;}
  return providers();
 }
 async function repair(){
  stop();const turn=epoch;render('Checking which models your ChatGPT account can use…');
  try{const result=await call('modelRepair');if(turn!==epoch)return;
   render(`I’ll use ${result.model}, from your account’s available models. Your sign-in and conversation are preserved. Next, connect Mail in Home so I can find what needs you.`,[button('Say hello',()=>{done();view.ask('Hello');}),...nextStep(),button('Done',done)]);
  }catch(error){if(turn===epoch)failure(error);}
 }
 async function providers(all=false){
  stop();const turn=epoch;render(all?'Looking through the rest of available providers…':'Which provider would you like to use?');
  try{
   const [{providers:catalog=[]},info]=await Promise.all([call('modelCatalog'),call('foxPreferences').catch(()=>null)]);
   if(turn!==epoch)return;
   const {featured,rest}=splitCatalog(catalog.filter(provider=>!provider.local&&!['ollama','lmstudio'].includes(provider.id)));
   const items=all&&rest.length?rest:featured;
   const ready=!!info?.model?.ready;
   const actions=[button('Back',all?()=>providers():ready?show:later),...( !all&&rest.length?[button('More providers',()=>providers(true))]:[])];
   render(all?'Here are the other providers. I’ll walk you through the ones Fox can connect on this device.':'Which provider do you already use? I’ll walk you through the connection.',actions,catalogBody(items,all));
  }catch(error){if(turn===epoch)failure(error);}
 }
 function field(label,value='',type='text'){
  const wrapper=document.createElement('label');wrapper.textContent=label;
  const input=document.createElement('input');input.type=type;input.value=value;input.autocomplete='off';input.spellcheck=false;input.setAttribute('aria-label',label);wrapper.append(input);return {wrapper,input};
 }
 function details(provider){
  if(provider.provider==='openai-codex'){login(provider);return;}
  if(!provider.nativeSetup){
   render(`${provider.name} uses the ${provider.auth.replaceAll('_',' ')} connection flow. The selected Harness offers it, but this Fox bridge does not yet implement its secure browser callback.`,[button('Back',providers),button('Not now',later)]);
   return;
  }
  stop();const body=document.createElement('div');body.className='world-onboarding fox-model-entry';
  const model=field('Model ID',provider.model),endpoint=field('API address',provider.baseURL,'url');
  body.append(model.wrapper);
  if(provider.id==='custom')body.append(endpoint.wrapper);
  render(`We’ll use ${provider.name}. Which model should I connect to?`,[button('Back',providers),button('Continue',()=>{
   if(!model.input.value.trim()||!endpoint.input.value.trim()){model.input.reportValidity();return;}
   if(provider.id==='custom'){
    try{const url=new URL(endpoint.input.value.trim());if(['localhost','127.0.0.1','[::1]'].includes(url.hostname)||url.protocol!=='https:'){endpoint.input.setCustomValidity('For now, use an HTTPS cloud model endpoint.');endpoint.input.reportValidity();return;}}
    catch{endpoint.input.setCustomValidity('Enter a valid HTTPS cloud model endpoint.');endpoint.input.reportValidity();return;}
   }
   endpoint.input.setCustomValidity('');
   credentials({...provider,model:model.input.value.trim(),baseURL:endpoint.input.value.trim()});
  })],body);model.input.required=true;
 }
 function credentials(provider){
  stop();const turn=epoch,body=document.createElement('div');body.className='world-onboarding fox-model-entry';
  const key=field(`${provider.keyEnv||'API'} key`,'','password');if(!provider.keyless)body.append(key.wrapper);
  const save=button('Connect',async()=>{
   if(!provider.keyless&&!key.input.value.trim()){key.input.required=true;key.input.reportValidity();return;}
   save.disabled=true;
   const request={provider:provider.provider,baseURL:provider.baseURL,model:provider.model,apiKey:key.input.value.trim()};
   key.input.value='';render('Saving your connection on this device…');
   try{const pending=call('modelConfigure',request);request.apiKey='';await pending;if(turn!==epoch)return;if(onConnected){done();await onConnected();return;}
    render('Your connection is saved. Say hello and we’ll check that your model can reply. Usage is billed by your provider. Next, connect Mail in Home so I can find what needs you.',[button('Say hello',()=>{done();view.ask('Hello');}),...nextStep(),button('Done',done)]);
   }catch(error){if(turn===epoch)failure(error);}finally{request.apiKey='';}
  });
  const place=provider.keyless?`${provider.name} does not need an API key. I’ll save the model choice with your Harness.`:`Paste your ${provider.name} key below. It goes directly to your selected Harness on this device, not into our chat.`;
  render(place,[button('Back',()=>details(provider)),button('Cancel',done),save],body);
  secret=key.input;
 }
 async function login(provider={provider:'openai-codex'}){
  stop();const turn=epoch;signingIn=true;
  render('I’m opening secure sign-in. Finish in your browser, then come back here.',[button('Cancel',show)]);
  try{await call('modelLogin',{provider:provider.provider});if(turn!==epoch)return;signingIn=false;if(onConnected){done();await onConnected();return;}
   render('You’re signed in. Say hello and we’ll check the connection. Next, connect Mail in Home so I can find what needs you.',[button('Say hello',()=>{done();view.ask('Hello');}),...nextStep(),button('Done',done)]);
  }catch(error){if(turn===epoch){signingIn=false;failure(error);}}
 }
 window.addEventListener('worldlet:model-auth',(event: any)=>{if(!signingIn)return;render(`Enter this code on the OpenAI sign-in page: **${event.detail.code}**\n\nI’ll wait here while you finish signing in.`,[button('Cancel',show)]);});
 window.addEventListener('worldlet:fox-dismiss',clear);
 window.addEventListener('pagehide',stop);
 return {show:(resume?: ()=>any)=>{onConnected=resume||null;return show();},stop};
}
