import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {worldActions,describeActions} from '../core/tools/gateway.ts';
import {worldGatewayTools,listWorldTools,WORLD_TOOL_VERSION} from '../core/tools/catalog.ts';
import {worldModules} from '../core/tools/modules.ts';
import {createWorldToolRuntime} from '../platform/bridge/world-tool-runtime.ts';
import {hermesRuntime,boundedRun,stallMs} from './gate.mjs';
import {workspace} from './dev-workspace.ts';

// The Python side runs where Fox runs it: the validated Hermes runtime (it has jsonschema). macOS's
// /usr/bin/python3 has no jsonschema, so it is only a fallback off Windows when no runtime is set up.
function toolsPython(){
 if(process.env.WORLDLET_TOOLS_PYTHON)return process.env.WORLDLET_TOOLS_PYTHON;
 const root=process.cwd(),runtime=hermesRuntime(root,process.env,undefined,workspace(root).primary);
 if(runtime.ok)return runtime.python;
 if(process.platform!=='win32')return '/usr/bin/python3';
 throw Error(runtime.reason);
}

worldModules.push({target:'fixture-template',actions:[{action:'read',name:'fixture_template_read',description:'Read a trusted template fixture.',parameters:{type:'object',properties:{id:{type:'string'}},required:['id'],additionalProperties:false}}]});
try{
 const actions=worldActions(),sampleActions=worldActions({sample:true});
 assert.deepEqual(describeActions(actions,'browser','click').parameters.required,['documentId','ref']);
 // Readable targets come from Applet attention registrations; the service schema must accept exactly those providers.
 const readTargets=actions.filter(a=>a.tool==='read_world_source'&&!a.target.startsWith('applet:')).map(a=>a.target).sort();
 assert.deepEqual(readTargets,[...listWorldTools().find(t=>t.name==='read_world_source')!.parameters.properties.provider.enum].sort(),'read_world_source targets match its provider enum');
 const manifest={version:WORLD_TOOL_VERSION,gatewayTools:worldGatewayTools,tools:listWorldTools(),actions,sampleActions};
 assert.deepEqual(describeActions(actions,'applet:gmail','read').parameters,describeActions(actions,'gmail','read').parameters);
 assert.equal(describeActions(actions,'applet:youtube','launch').requiresPrivateContext,false);
 assert.ok(!describeActions(sampleActions,'applet:gmail','read').parameters,'Sample cannot discover a live source reader');
 // Practice emails are saved items: Mail searches and reads them as content, never as a live source.
 for(const target of ['gmail','applet:gmail'])for(const [action,tool] of [['search','find_content'],['read_saved','read_content_page']]){
  assert.equal(sampleActions.find(a=>a.target===target&&a.action===action)?.tool,tool,'Practice Mail cannot '+action+' its emails');
  assert.ok(!actions.some(a=>a.target===target&&a.action===action),'Live Mail reads its source, not saved practice items');
 }
 const cases: {target:string;action:string;args?:Record<string,unknown>;describe?:boolean;error?:boolean;setup?:boolean;sample?:boolean;allowActions?:boolean}[]=[
  {target:'applet:youtube',action:'launch',args:{},setup:true},
  {target:'applet:youtube',action:'launch',args:{id:'app-gmail'},error:true},
  {target:'applet:gmail',action:'read',args:{provider:'notion'},error:true},
  {target:'applet:gmail',action:'read',args:{},setup:true,error:true},
  {target:'applet:gmail',action:'read',args:{},sample:true,error:true},
  {target:'applet:gmail',action:'runtime',args:{}},
  {target:'applet:gmail',action:'runtime',args:{provider:'notion'},error:true},
  {target:'applet:gmail',action:'runtime',args:{},setup:true,error:true},
  {target:'applet:gmail',action:'',describe:true},
  {target:'applet:youtube',action:'launch',describe:true},
  {target:'weather',action:'search',args:{query:'Paris'}}, {target:'weather',action:'select',args:{choice:'fixture-city'}},
  {target:'weather',action:'search',args:{},error:true}, {target:'weather',action:'select',args:{},error:true},
  {target:'weather',action:'status',args:{},setup:true,error:true},
  {target:'',action:'',describe:true}, {target:'music',action:'',describe:true}, {target:'gmail',action:'read',describe:true},
  {target:'music',action:'volume',args:{volume:.3}}, {target:'youtube',action:'play',args:{}},
  {target:'gmail',action:'read',args:{unreadOnly:true}}, {target:'apple-notes',action:'read',args:{}},
  {target:'companion',action:'recall',args:{query:'trains'}},
  {target:'companion',action:'recall',args:{},setup:true,error:true},
  {target:'companion',action:'recall',args:{},sample:true,error:true},
  {target:'items',action:'query',args:{}}, {target:'history',action:'query',args:{limit:5}},
  ...['note','file','x-bookmark'].flatMap(provider=>[
   {target:'items',action:'query',args:{provider}},
   {target:'items',action:'save',args:{items:[{provider,kind:'task',title:'Send report',reason:'The team needs it.',summary:'The team is waiting for the report.',attentionReason:'The user owes this report.',sources:[{provider,id:'original',quote:'Send it.'}]}]}},
  ]),
  {target:'items',action:'save',args:{items:[]},setup:true,error:true},
  {target:'items',action:'save',args:{items:[]},sample:true,error:true},
  {target:'items',action:'save',args:{items:[]},allowActions:false,error:true},
  {target:'content',action:'read',args:{id:'note'}}, {target:'fixture-template',action:'read',args:{id:'one'}},
  {target:'browser',action:'receipts',args:{}},
  {target:'browser',action:'outcome',args:{receiptId:'r'}},
  {target:'browser',action:'outcome',args:{},error:true},
  {target:'browser',action:'click',args:{documentId:'doc',ref:'1',taskId:'saved-task'}},
  {target:'browser',action:'click',args:{ref:'1'},error:true},
  {target:'browser',action:'fill',args:{documentId:'doc',ref:'1'},error:true},
  {target:'browser',action:'open',args:{},error:true},
  {target:'music',action:'volume',args:{volume:2},error:true},
  {target:'gmail',action:'read',args:{provider:'notion'},error:true},
  {target:'gmail',action:'read',args:{},setup:true,error:true},
  {target:'gmail',action:'read',args:{},sample:true,error:true},
  {target:'gmail',action:'search',args:{query:'invoice'},sample:true}, {target:'applet:gmail',action:'read_saved',args:{id:'sample-mail-invoice'},sample:true},
  {target:'gmail',action:'read_saved',args:{},sample:true,error:true},
  {target:'music',action:'play',args:{},allowActions:false,error:true},
 ];
 const toolsRun=boundedRun(spawnSync,toolsPython(),['-c',`
import sys,json
sys.path.insert(0,'harness/hermes')
from world_gateway import invoke
data=json.load(sys.stdin); results=[]
for c in data['cases']:
 try:
  args={'target':c['target'],'action':c['action']}
  if not c.get('describe'): args['arguments']=json.dumps(c.get('args',{}))
  result=invoke(data['manifest'],'describe_world_tools' if c.get('describe') else 'call_world_tool',args,sample=c.get('sample',False),setup=c.get('setup',False),allow_actions=c.get('allowActions',True),dispatch=lambda n,a:{'name':n,'args':a})
 except Exception as error: result={'error':str(error)}
 results.append(result)
print(json.dumps(results))
`],{input:JSON.stringify({manifest,cases})});
 if(toolsRun.error?.code==='ETIMEDOUT')throw Error(`Python world_gateway run stalled twice (${stallMs/1000} s each)`);
 if(toolsRun.error||toolsRun.status!==0)throw Error(`Python world_gateway run failed: ${toolsRun.error?.message||toolsRun.stderr}`);
 const python=JSON.parse(toolsRun.stdout);
 for(const [i,c] of cases.entries()){
  const dispatch=async(name,args)=>({name,args});
  const runtime=createWorldToolRuntime({execute:dispatch,backend:dispatch,audio:args=>dispatch('control_background_music',args),sample:!!c.sample,setup:!!c.setup,allowActions:c.allowActions!==false});
  const args={target:c.target,action:c.action,...(!c.describe?{arguments:JSON.stringify(c.args||{})}:{})};
  const result=await runtime.gateway(c.describe?'describe_world_tools':'call_world_tool',args,'fixture-'+i);
  if(c.error){assert(result.error);assert(python[i].error);}else assert.deepEqual(result,python[i]);
 }
 assert(describeActions(actions,'fixture-template','read').parameters);
 console.log('PASS identical renderer/Hermes discovery, routing, typed arguments, backend dispatch, permission failures and new template with unchanged two-tool interface.');
}finally{worldModules.pop();}
