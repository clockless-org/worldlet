import path from 'node:path';
import {spawn} from 'node:child_process';
import {harnessApprovalFeatures,hermesAllowlistWithout,hermesConfigValues,hermesStandingRules,openClawApprovalsWithout,openClawGrantRules,openClawStandingRules,standingRuleId,type LocalHarnessId} from '../../../../../core/agent/index.ts';
import type {HarnessStandingRule,HarnessStandingRules} from '../../../../../contracts/harness-services.ts';
import {WorldletError} from '../../files.ts';
import {readFile} from './agent-files.ts';
import {hermesHomes} from './harness-agents.ts';
import {harnessEnvironment,type HarnessEnvironment,type LocalHarnessInstall} from './local-harness.ts';

// The standing rules an Always left in the person's Harness (contracts/harness-services.ts HarnessStandingRules, the
// `approvalFeatures.rules` a Harness declares in core/agent/harness-services.ts), read where that Harness keeps them and
// revoked only the way its own documentation gives: Hermes Agent's `command_allowlist` in each profile's config.yaml,
// changed with its own `hermes config set`; OpenClaw's approvals document and automation grants through its own
// `openclaw approvals` commands. Worldlet never edits either file itself. What the entries mean is Core's
// (core/agent/harness-approvals.ts); Settings › Approvals (fox `harnessApprovalRules`) never asks which Harness it is.

const OUTPUT=4_000_000;
type Run={code:number|null;stdout:string;stderr:string};
/** The Harness's own command with the person's environment, its output read whole; never a shell. */
export function runHarnessCommand(install:LocalHarnessInstall,environment:HarnessEnvironment,args:string[],{stdin='',env={},timeout=20_000}:{stdin?:string;env?:Record<string,string>;timeout?:number}={}):Promise<Run> {
 return new Promise(resolve=>{
  let stdout='',stderr='',done=false;
  const finish=(code:number|null)=>{if(!done){done=true;clearTimeout(timer);resolve({code,stdout,stderr});}};
  let child:ReturnType<typeof spawn>;
  try{child=spawn(install.command,[...install.prefix,...args],{env:{...harnessEnvironment(install,environment),...env},stdio:['pipe','pipe','pipe'],windowsHide:true});}
  catch(error){resolve({code:null,stdout:'',stderr:(error as Error)?.message??''});return;}
  const timer=setTimeout(()=>{try{child.kill();}catch{}finish(null);},timeout);timer.unref?.();
  child.stdout!.on('data',(chunk:Buffer)=>{if(stdout.length<OUTPUT)stdout+=chunk.toString('utf8');});
  child.stderr!.on('data',(chunk:Buffer)=>{stderr=(stderr+chunk.toString('utf8')).slice(-4000);});
  child.once('error',error=>{stderr=error.message;finish(null);});
  child.once('close',code=>finish(code));
  child.stdin!.on('error',()=>{});child.stdin!.end(stdin);
 });
}
/** The JSON a `--json` command printed (from its first brace or bracket: a banner or warning before it is not JSON). */
function printedJson(text:string):unknown {
 const start=text.search(/[[{]/);
 if(start<0)throw new WorldletError('It printed no JSON.');
 return JSON.parse(text.slice(start));
}
const failure=(title:string,run:Run,what:string)=>new WorldletError(`${title} could not ${what}: ${(run.stderr.trim().split('\n').filter(Boolean).pop()||(run.code===null?'it did not answer in time':'it stopped with code '+run.code)).slice(0,300)}`);

/** Hermes Agent: each profile's `command_allowlist` (config.yaml, read only); revoked with `hermes config get
 * command_allowlist --json --raw` and `hermes config set command_allowlist <json>` in that profile's home
 * (HERMES_HOME), the documented way to remove an entry; the running Hermes forgets it when it next starts. */
export function hermesStandingRulesService(install:LocalHarnessInstall,environment:HarnessEnvironment):HarnessStandingRules {
 const homes=()=>hermesHomes(environment.home,environment.env,environment.platform);
 const config=(root:string)=>readFile(root,path.join(root,'config.yaml'),OUTPUT);
 return {
  async list(){return homes().flatMap(({id,root,main})=>hermesStandingRules(config(root),id,{main}));},
  async revoke(id){
   for(const {id:agent,root} of homes()){
    const listed=hermesConfigValues(config(root)).command_allowlist;
    const entry=(Array.isArray(listed)?listed:[]).find((item:unknown)=>typeof item==='string'&&standingRuleId('hermes',agent,item)===id) as string|undefined;
    if(entry===undefined)continue;
    const env={HERMES_HOME:root};
    const got=await runHarnessCommand(install,environment,['config','get','command_allowlist','--json','--raw'],{env});
    let current:unknown;
    try{if(got.code!==0)throw Error();current=printedJson(got.stdout);}catch{throw failure(install.title,got,'read its allowlist');}
    const next=hermesAllowlistWithout(current,entry);
    if(next===null)throw new WorldletError(`${install.title} no longer has this rule.`);
    const set=await runHarnessCommand(install,environment,['config','set','command_allowlist',JSON.stringify(next)],{env});
    if(set.code!==0)throw failure(install.title,set,'change its allowlist');
    if(hermesStandingRules(config(root),agent).some(rule=>rule.id===id))throw new WorldletError(`${install.title} kept this rule. Remove it with hermes config edit.`);
    return;
   }
   throw new WorldletError(`${install.title} no longer has this rule.`);
  },
 };
}

/** OpenClaw: `openclaw approvals get --json` (its allow-always entries and MCP tool grants, per agent) and `openclaw
 * approvals grants list --json` (automation grants, from its Gateway when it runs); revoked with `openclaw approvals
 * set --stdin` (the document without that entry, as its docs remove a grant) or `openclaw approvals grants revoke`. */
export function openClawStandingRulesService(install:LocalHarnessInstall,environment:HarnessEnvironment):HarnessStandingRules {
 const document=async()=>{
  const run=await runHarnessCommand(install,environment,['approvals','get','--json']);
  if(run.code!==0)throw failure(install.title,run,'list its approvals');
  try{return printedJson(run.stdout);}catch{throw failure(install.title,run,'list its approvals');}
 };
 const grants=async()=>{
  const run=await runHarnessCommand(install,environment,['approvals','grants','list','--json'],{timeout:8000});
  if(run.code!==0)return [];
  try{return openClawGrantRules(printedJson(run.stdout));}catch{return [];}
 };
 return {
  async list(){const [own,automations]=await Promise.all([document().then(openClawStandingRules),grants()]);return [...own,...automations.map(({grant:_grant,...rule}):HarnessStandingRule=>rule)];},
  async revoke(id){
   const grant=(await grants()).find(rule=>rule.id===id);
   if(grant){
    const run=await runHarnessCommand(install,environment,['approvals','grants','revoke',grant.grant,'--json']);
    if(run.code!==0)throw failure(install.title,run,'revoke this grant');
    return;
   }
   const before=await document(),next=openClawApprovalsWithout(before,id);
   if(!next)throw new WorldletError(`${install.title} no longer has this rule.`);
   const run=await runHarnessCommand(install,environment,['approvals','set','--stdin'],{stdin:JSON.stringify(next)});
   if(run.code!==0)throw failure(install.title,run,'change its approvals');
   if(openClawStandingRules(await document()).some(rule=>rule.id===id))throw new WorldletError(`${install.title} kept this rule. Remove it with openclaw approvals.`);
  },
 };
}

/** The Harnesses whose standing rules Worldlet reads (`approvalFeatures.rules` in core/agent/harness-services.ts). */
export const HARNESS_STANDING_RULES:Partial<Record<LocalHarnessId,(install:LocalHarnessInstall,environment:HarnessEnvironment)=>HarnessStandingRules>>={hermes:hermesStandingRulesService,openclaw:openClawStandingRulesService};
export function standingRules(install:LocalHarnessInstall,environment:HarnessEnvironment):HarnessStandingRules|null {
 return harnessApprovalFeatures(install.id).rules?HARNESS_STANDING_RULES[install.id]?.(install,environment)??null:null;
}
