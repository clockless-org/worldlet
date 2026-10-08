import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn,type ChildProcess} from 'node:child_process';
import {shell} from 'electron';
import {digest,ensureDirectory,WorldletError} from '../../files.ts';
import {VAULT,type VaultService} from '../../host/services.ts';
import {bundledResource} from '../../resources.ts';
import {Cancelled} from './page.ts';
import type {Host,Row} from '../../host/types.ts';

const MAX_OUTPUT=8_000_000;
export function stripeIdentifier(value:unknown,prefix:string):string {
 if(typeof value!=='string'||!value.startsWith(prefix)||!/^[A-Za-z0-9_]{5,100}$/.test(value))throw new WorldletError('Invalid Stripe identifier.');
 return value;
}
/** Fixed CLI verbs only (Mac StripeCLI). No shell, key export, arbitrary URL or inherited Stripe overrides. */
export class StripeCLI {
 readonly root:string;
 readonly profile:string;
 private executable:()=>string|null;
 private processes=new Set<ChildProcess>();
 constructor(root:string,profile:string,executable:()=>string|null){this.root=root;this.profile=profile;this.executable=executable;}
 cancel(){for(const child of this.processes)if(child.exitCode===null)child.kill();}
 static readArguments(resource:string,params:Record<string,string>,mode:string,account?:string){
  let args:string[];
  if(resource==='account')args=['get','/v1/account'];
  else if(['customers','charges','subscriptions','invoices'].includes(resource))args=[resource,'list'];
  else if(resource.startsWith('customers/'))args=['customers','retrieve',stripeIdentifier(resource.slice(10),'cus_')];
  else throw new WorldletError('Unsupported Stripe resource.');
  if(!['live','test'].includes(mode))throw new WorldletError('Choose Live or Test mode.');
  args.push(mode==='live'?'--live':'--live=false');
  args.push('--stripe-version','2026-02-25.clover');
  // The CLI maps this to the correct legacy/OAuth account header. Sending both account and
  // context headers can be rejected by Stripe.
  if(account!==undefined)args.push('--stripe-account',stripeIdentifier(account,'acct_'));
  for(const key of Object.keys(params).sort()){
   const value=params[key];
   if(!['limit','starting_after','customer','status','created[gte]','created[lte]'].includes(key)||value.length>100)throw new WorldletError('Unsupported Stripe query.');
   args.push('-d',`${key}=${value}`);
  }
  return args;
 }
 static loginSession(data:Buffer){
  let json:Row;try{json=JSON.parse(data.toString('utf8'));}catch{throw new WorldletError('Stripe returned an unsupported login. Please try again.');}
  let url:URL|null=null;try{url=new URL(json?.browser_url);}catch{}
  if(!url||url.protocol!=='https:'||!['dashboard.stripe.com','access.stripe.com'].includes(url.hostname)||url.username||url.password||url.port||typeof json.next_step!=='string')throw new WorldletError('Stripe returned an unsupported login. Please try again.');
  const code=typeof json.verification_code==='string'?json.verification_code:'';
  if(code.length>100||!/^[A-Za-z0-9 -]*$/.test(code))throw new WorldletError('Invalid Stripe login response.');
  const next:string=json.next_step;
  if(next==='stripe login --complete-device')return {url:url.href,code,completion:['login','--complete-device']};
  const prefix="stripe login --complete '";
  if(next.startsWith(prefix)&&next.endsWith("'")){
   const rawPoll=next.slice(prefix.length,-1);
   let poll:URL|null=null;try{poll=new URL(rawPoll);}catch{}
   if(poll&&poll.protocol==='https:'&&poll.hostname==='dashboard.stripe.com'&&poll.pathname.startsWith('/stripecli/')&&!poll.username&&!poll.password&&!poll.port)return {url:url.href,code,completion:['login','--complete',rawPoll]};
  }
  throw new WorldletError('This Stripe CLI login flow is not supported. Update Worldlet and try again.');
 }
 run(args:string[],timeout=30):Promise<Buffer> {
  const executable=this.executable();
  if(!executable)return Promise.reject(new WorldletError('Stripe CLI is missing from this app. Rebuild or reinstall Worldlet.'));
  ensureDirectory(this.root);
  return new Promise((resolve,reject)=>{
   // Output is private, bounded, short-lived and never forwarded as an error/log.
   const env:Record<string,string>={HOME:os.homedir(),PATH:process.platform==='win32'?(process.env.PATH??''):'/usr/bin:/bin',XDG_CONFIG_HOME:this.root,LANG:'en_US.UTF-8',STRIPE_CLI_TELEMETRY_OPTOUT:'1'};
   if(process.platform==='win32')for(const key of ['SYSTEMROOT','USERPROFILE','APPDATA','LOCALAPPDATA','TEMP','TMP'])if(process.env[key])env[key]=process.env[key]!;
   const child=spawn(executable,['--project-name',this.profile,'--color','off',...args],{cwd:this.root,env,stdio:['ignore','pipe','ignore'],windowsHide:true});
   this.processes.add(child);
   const chunks:Buffer[]=[];let size=0,failure:Error|null=null;
   const fail=(error:Error)=>{if(!failure){failure=error;if(child.exitCode===null)child.kill();}};
   const timer=setTimeout(()=>fail(new WorldletError('Stripe timed out. Try connecting or refreshing again.')),timeout*1000);
   child.stdout!.on('data',(chunk:Buffer)=>{size+=chunk.length;if(size>MAX_OUTPUT)fail(new WorldletError('Stripe returned too much data.'));else chunks.push(chunk);});
   child.on('error',()=>fail(new WorldletError('Stripe CLI could not complete the request. Check your connection and account permissions, or reconnect Stripe.')));
   child.on('close',(code,signal)=>{
    clearTimeout(timer);this.processes.delete(child);
    if(failure)return reject(failure);
    if(signal)return reject(new Cancelled());
    if(code!==0)return reject(new WorldletError('Stripe CLI could not complete the request. Check your connection and account permissions, or reconnect Stripe.'));
    resolve(Buffer.concat(chunks));
   });
  });
 }
}
/** Credentials belong to the official CLI; the Applet only exposes fixed read commands (Mac StripeService). */
export class StripeService {
 private host:Host;
 private generation=0;
 private cli:StripeCLI;
 private pending:{arguments:string[],epoch:number,mode:string}|null=null;
 constructor(host:Host){
  this.host=host;
  this.cli=new StripeCLI(path.join(host.store.root,'stripe-cli'),this.key,()=>{const file=bundledResource(host.profile,'stripe');return file&&fs.existsSync(file)?file:null;});
 }
 private get store(){return this.host.store;}
 private get sample(){return this.store.sampleEnabled();}
 private get key(){return 'stripe-'+digest(this.host.store.root);}
 private get vault(){return this.host.use<VaultService>(VAULT);}
 status(){
  const connection=this.sample?null:this.store.state.connections.find((c:Row)=>c.provider==='stripe'&&c.connector==='stripe-cli-readonly'&&c.cursors?.account!=null);
  return {connected:!!connection,sample:this.sample,account:connection?.cursors?.account??'',mode:!connection?'disconnected':connection.target==='Test account'?'test':'live'};
 }
 cancel(){this.generation+=1;this.pending=null;this.cli.cancel();}
 private authorizeAgent(){if(this.sample||!this.store.state.cloudConsent)throw new WorldletError('Allow private content processing before using Stripe through Fox. Sample worlds cannot read a personal account.');}
 private validate(epoch:number,agent:boolean){if(epoch!==this.generation||this.sample)throw new Cancelled();if(agent)this.authorizeAgent();}
 private removeConnections(){this.store.state.connections=this.store.state.connections.filter((c:Row)=>c.provider!=='stripe');}
 async command(body:Row):Promise<Row> {
  const op=typeof body.operation==='string'?body.operation:'status',agent=body.agent===true;
  if(agent)this.authorizeAgent();
  if(!['status','configure','complete','disconnect','cancel','overview','customers','customer','external'].includes(op))throw new WorldletError('Unknown read-only Stripe operation.');
  if(op==='status')return this.status();
  if(op==='cancel'){if(agent)throw new WorldletError('Use the Stripe Applet account controls.');this.cancel();return this.status();}
  if(this.sample)throw new WorldletError('Connect Stripe in your personal world. This sample does not access your account.');
  if(op==='external'){
   const id=typeof body.id==='string'?body.id:'';
   if(id)stripeIdentifier(id,'cus_');
   const mode=this.status().mode==='test'?'test/':'';
   try{await shell.openExternal('https://dashboard.stripe.com/'+mode+(id?'customers/'+id:'dashboard'));}catch{throw new WorldletError('Could not open Stripe Dashboard.');}
   return {ok:true};
  }
  if(op==='configure'||op==='complete'||op==='disconnect'){
   if(agent)throw new WorldletError('Connect Stripe using the Applet account controls.');
   if(op==='disconnect'){this.cancel();this.vault.delete(this.key);this.removeConnections();this.store.changed();return this.status();}
   if(op==='configure'){
    this.cancel();const epoch=this.generation;
    const mode=typeof body.mode==='string'?body.mode:'live';
    if(!['live','test'].includes(mode))throw new WorldletError('Choose Live or Test mode.');
    // Reauthorization can change the account. Never retain an old connected marker.
    this.removeConnections();this.store.changed();
    const data=await this.cli.run(['login','--non-interactive']);
    this.validate(epoch,false);
    const login=StripeCLI.loginSession(data);
    try{await shell.openExternal(login.url);}catch{throw new WorldletError('Could not open Stripe authorization in your browser.');}
    this.pending={arguments:login.completion,epoch,mode};
    return {authorizing:true,verificationCode:login.code};
   }
   const login=this.pending;
   if(!login)throw new WorldletError('Start Stripe connection again.');
   this.pending=null;
   await this.cli.run(login.arguments,600);
   const epoch=login.epoch,token=login.mode;
   this.validate(epoch,false);
   const accountData=await this.cli.run(StripeCLI.readArguments('account',{},token));
   this.validate(epoch,false);
   let accountResponse:Row;try{accountResponse=JSON.parse(accountData.toString('utf8'));}catch{accountResponse={error:true};}
   if(!accountResponse||typeof accountResponse!=='object'||accountResponse.error!=null)throw new WorldletError('Could not identify your Stripe account. Reconnect and choose the matching Live or Test mode.');
   const account=stripeIdentifier(accountResponse.id,'acct_');
   await this.api('customers',{limit:'1'},token,epoch,false,account);
   this.validate(epoch,false);
   this.vault.delete(this.key); // Remove the superseded manual key, never export it to the CLI.
   this.removeConnections();
   this.store.state.connections.push({id:this.key,provider:'stripe',target:token==='live'?'Live account':'Test account',transport:'native',syncStatus:'connected',cursors:{account},connector:'stripe-cli-readonly'});
   this.store.changed();return this.status();
  }
  const status=this.status(),token=status.mode,epoch=this.generation;
  if(!status.connected)throw new WorldletError('Connect Stripe in your browser first.');
  let result:Row;
  if(op==='overview'){
   const now=new Date(),start=new Date(now);start.setHours(0,0,0,0);
   const charges=await this.pages('charges',{'created[gte]':String(Math.floor(start.getTime()/1000)),'created[lte]':String(Math.floor(now.getTime()/1000))},token,epoch,agent);
   const subs=await this.pages('subscriptions',{status:'active'},token,epoch,agent);
   result=StripeService.overview(charges.rows,subs.rows,charges.complete,subs.complete,now);
  }else if(op==='customers'){
   const params:Record<string,string>={limit:'30'};
   const cursor=typeof body.page==='string'?body.page:typeof body.nextPage==='string'?body.nextPage:'';
   if(cursor)params.starting_after=stripeIdentifier(cursor,'cus_');
   const response=await this.api('customers',params,token,epoch,agent),rows:Row[]=Array.isArray(response.data)?response.data:[];
   result={items:rows.map(StripeService.customer),nextPage:response.has_more===true?(typeof rows[rows.length-1]?.id==='string'?rows[rows.length-1].id:''):''};
  }else if(op==='customer'){
   const id=stripeIdentifier(body.id??body.customer_id,'cus_');
   const customer=await this.api('customers/'+id,{},token,epoch,agent);
   const subs=await this.api('subscriptions',{customer:id,status:'all',limit:'25'},token,epoch,agent);
   const charges=await this.api('charges',{customer:id,limit:'25'},token,epoch,agent);
   const invoices=await this.api('invoices',{customer:id,limit:'25'},token,epoch,agent);
   const list=(value:Row)=>Array.isArray(value.data)?value.data:[];
   result={customer:StripeService.customer(customer),subscriptions:list(subs).map(StripeService.subscription),payments:list(charges).map(StripeService.payment),invoices:list(invoices).map(StripeService.invoice),limited:[subs,charges,invoices].some(value=>value.has_more===true)};
  }else throw new WorldletError('Unknown read-only Stripe operation.');
  this.validate(epoch,agent);result.untrusted=true;return result;
 }
 private async api(resource:string,params:Record<string,string>,token:string,epoch:number,agent:boolean,account?:string):Promise<Row> {
  this.validate(epoch,agent);
  const accountID=stripeIdentifier(account??this.status().account,'acct_');
  const data=await this.cli.run(StripeCLI.readArguments(resource,params,token,accountID));
  this.validate(epoch,agent);
  let result:Row|null=null;
  if(data.length<=MAX_OUTPUT)try{result=JSON.parse(data.toString('utf8'));}catch{}
  if(!result||typeof result!=='object'||Array.isArray(result))throw new WorldletError('Stripe returned an unsupported response.');
  if(result.error!=null)throw new WorldletError('Stripe could not read the connected account. Reconnect with the matching Live or Test mode and permissions.');
  if(!resource.includes('/')&&(!Array.isArray(result.data)||typeof result.has_more!=='boolean'))throw new WorldletError('Stripe returned an incomplete list response.');
  return result;
 }
 private async pages(resource:string,filters:Record<string,string>,token:string,epoch:number,agent:boolean){
  const params={...filters,limit:'100'},rows:Row[]=[];
  for(let page=0;page<10;page++){
   const result=await this.api(resource,params,token,epoch,agent),data:Row[]=result.data;rows.push(...data);
   if(result.has_more!==true)return {rows,complete:true};
   const cursor=data[data.length-1]?.id;if(typeof cursor!=='string'||!cursor)break;
   (params as Record<string,string>).starting_after=cursor;
  }
  return {rows,complete:false};
 }
 static customer(row:Row){return {id:typeof row.id==='string'?row.id:'',name:[...(typeof row.name==='string'?row.name:'Unnamed customer')].slice(0,300).join(''),email:[...(typeof row.email==='string'?row.email:'')].slice(0,300).join('')};}
 static payment(row:Row){return {id:row.id??'',amount:num(row.amount),currency:row.currency??'',status:row.status??'unknown',captured:row.captured===true,refunded:num(row.amount_refunded),created:num(row.created)};}
 static subscription(row:Row){return {id:row.id??'',status:row.status??'unknown',currency:row.currency??'',currentPeriodEnd:num(row.current_period_end),cancelAtPeriodEnd:row.cancel_at_period_end===true};}
 static invoice(row:Row){return {id:row.id??'',number:row.number??'',status:row.status??'unknown',amount:num(row.amount_due),currency:row.currency??'',created:num(row.created)};}
 static overview(charges:Row[],subscriptions:Row[],chargesComplete:boolean,subscriptionsComplete:boolean,now=new Date()){
  const today:Record<string,number>={},mrr:Record<string,number>={};
  const limitations=['Today is captured payments created today in your Mac’s timezone, before refunds, fees, and tax adjustments; it is not profit.','MRR is a pre-discount estimate from active fixed-price subscriptions; trials and one-time charges are excluded. Weekly and daily prices use an average 365.25-day year.','Attention lists failed payments created today only; overdue invoices and past-due subscriptions are not included.'];
  if(process.platform!=='darwin')limitations[0]=limitations[0].replace('your Mac’s timezone','this computer’s timezone');
  const start=new Date(now);start.setHours(0,0,0,0);
  let unsupported=false;
  for(const charge of charges){
   if(!(charge.paid===true&&charge.captured===true&&charge.status==='succeeded'))continue;
   if(typeof charge.created==='number'&&(charge.created<start.getTime()/1000||charge.created>now.getTime()/1000))continue;
   const amount=typeof charge.amount_captured==='number'?charge.amount_captured:typeof charge.amount==='number'?charge.amount:null;
   if(typeof charge.currency==='string'&&amount!==null)today[charge.currency]=(today[charge.currency]??0)+amount;
  }
  for(const sub of subscriptions){
   if(sub.status!=='active')continue;
   const container=sub.items&&typeof sub.items==='object'?sub.items:{};
   if(container.has_more===true)unsupported=true;
   for(const item of Array.isArray(container.data)?container.data:[]){
    const price=item.price&&typeof item.price==='object'?item.price:{},recurring=price.recurring&&typeof price.recurring==='object'?price.recurring:{};
    const amount=typeof price.unit_amount==='number'?price.unit_amount:typeof price.unit_amount_decimal==='string'&&price.unit_amount_decimal.trim()!==''&&Number.isFinite(Number(price.unit_amount_decimal))?Number(price.unit_amount_decimal):null;
    if(recurring.usage_type==='metered'||price.billing_scheme==='tiered'||price.transform_quantity!=null||typeof price.currency!=='string'||amount===null||typeof recurring.interval!=='string'){unsupported=true;continue;}
    const count=typeof recurring.interval_count==='number'?recurring.interval_count:1,quantity=typeof item.quantity==='number'?item.quantity:1;
    const factor=({month:1,year:1/12,week:365.25/7/12,day:365.25/12} as Record<string,number>)[recurring.interval];
    if(factor===undefined){unsupported=true;continue;}
    if(!(count>0)||!(quantity>=0)){unsupported=true;continue;}
    mrr[price.currency]=(mrr[price.currency]??0)+amount*quantity*factor/count;
   }
  }
  if(!chargesComplete)limitations.push('Today’s payments exceed the 1,000-record limit. A complete total is unavailable.');
  if(!subscriptionsComplete)limitations.push('Subscriptions exceed the 1,000-record limit. MRR and active subscription count are unavailable.');
  if(unsupported)limitations.push('Some subscriptions have metered, tiered, transformed, missing, or incomplete prices. MRR is unavailable.');
  const money=(values:Record<string,number>)=>Object.keys(values).sort().map(currency=>({currency,amount:values[currency]}));
  const attention=charges.filter(charge=>charge.status==='failed').slice(0,20).map(charge=>({id:charge.id??'',title:'Failed payment',detail:'Payment failed today',customer:typeof charge.customer==='string'?charge.customer:''}));
  return {today:chargesComplete?money(today):[],mrr:subscriptionsComplete&&!unsupported?money(mrr):[],todayComplete:chargesComplete,mrrComplete:subscriptionsComplete&&!unsupported,activeSubscriptions:subscriptionsComplete?subscriptions.filter(sub=>sub.status==='active').length:null,attention,limitations,asOf:new Date(now).toISOString().replace(/\.\d{3}Z$/,'Z'),timezone:Intl.DateTimeFormat().resolvedOptions().timeZone} as Row;
 }
}
const num=(value:unknown)=>typeof value==='number'?value:0;
