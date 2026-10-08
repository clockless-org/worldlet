import path from 'node:path';
import crypto from 'node:crypto';
import {core} from '../../core.ts';
import {digest,WorldletError} from '../../files.ts';
import type {WorldLedger} from '../../store/ledger.ts';
import {canBuild,referenceDate} from '../../store/world-store.ts';
import {homeWritePrepare,homeWriteCommit,refreshApple} from './apple.ts';
import type {SourcesContext} from './context.ts';
import type {AgentRuntime} from '../../host/services.ts';
import type {Row} from '../../host/types.ts';
// User-confirmed external writes: reviewed email (Mac MailReviewStore + RuntimeOperations
// mail.send), Home Applet changes (HomeAppletReview) and Notion drafts (NotionContent).
// Drafts never resume automatically; durable operation receipts prevent any replay.

interface MailReview {draft:Record<string,string>;backend:string;createdAt:number;attempted:boolean;confirmed:boolean}
const FAILURE={
 invalid:'Saved email reviews could not be read safely. Existing drafts are preserved.',
 missing:'This email review is unavailable for the current Agent.',
 limit:'Review or discard an existing email draft before preparing another.',
 attempted:'Sending was attempted. Check delivery; this cannot cancel an email already sent.',
 unconfirmed:'Delivery has not been confirmed.'
};
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const characters=(text:string)=>Array.from(text).length;

/** Reviewed drafts, in the World's database (`mail_reviews`; before 2026-10-05 `mail/reviews.json`).
 * They travel with backups: the send receipts that stop a second send (`runtime-operations`) are in the
 * same database, so a restored draft that was attempted only checks delivery. */
export class MailReviews {
 private readonly ledger:()=>WorldLedger;
 private readonly root:string;
 constructor(ledger:()=>WorldLedger,root:string){this.ledger=ledger;this.root=root;}
 /** A draft belongs to the Agent home that prepared it, named inside the library where it is there, so
  * it still matches after the World is restored on another computer. */
 private backend(home:string){
  if(!path.isAbsolute(home))return home;
  const relative=path.relative(this.root,home);
  return relative&&!relative.startsWith('..')&&!path.isAbsolute(relative)?relative.split(path.sep).join('/'):home;
 }
 load():Record<string,MailReview> {
  let reviews:Row;try{reviews=this.ledger().mailReviews();}catch{throw new WorldletError(FAILURE.invalid);}
  if(Object.keys(reviews).length>20)throw new WorldletError(FAILURE.invalid);
  for(const [id,review] of Object.entries<Row>(reviews)){
   if(!UUID.test(id)||typeof review?.backend!=='string'||!review.backend||typeof review.createdAt!=='number'||typeof review.attempted!=='boolean'||typeof review.confirmed!=='boolean'||review.confirmed&&!review.attempted)throw new WorldletError(FAILURE.invalid);
   this.validate(review.draft);
  }
  return reviews;
 }
 private validate(draft:unknown):asserts draft is Record<string,string> {
  if(!draft||typeof draft!=='object'||Array.isArray(draft))throw new WorldletError(FAILURE.invalid);
  const values=draft as Record<string,unknown>;
  for(const [key,limit] of [['from',320],['to',320],['subject',300],['body',30000]] as const){
   const value=values[key];
   if(typeof value!=='string'||characters(value)>limit||key!=='subject'&&!value)throw new WorldletError(FAILURE.invalid);
  }
  if(Object.keys(values).length>8||!Object.values(values).every(value=>typeof value==='string'&&Buffer.byteLength(value,'utf8')<=120_000))throw new WorldletError(FAILURE.invalid);
 }
 private save(reviews:Record<string,MailReview>){
  if(Buffer.byteLength(JSON.stringify(reviews))>3_000_000)throw new WorldletError(FAILURE.invalid);
  this.ledger().replaceMailReviews(reviews);
 }
 create(draft:Record<string,string>,backend:string){
  this.validate(draft);
  const reviews=this.load();
  if(Object.keys(reviews).length>=20)throw new WorldletError(FAILURE.limit);
  const id=crypto.randomUUID().toUpperCase();
  reviews[id]={draft,backend:this.backend(backend),createdAt:referenceDate(),attempted:false,confirmed:false};this.save(reviews);return id;
 }
 belongs(review:MailReview,home:string){return this.backend(review.backend)===this.backend(home);}
 review(id:string,backend:string){const review=this.load()[id];if(!review||!this.belongs(review,backend))throw new WorldletError(FAILURE.missing);return review;}
 change(id:string,backend:string,action:string){
  const reviews=this.load(),review=reviews[id];
  if(!review||!this.belongs(review,backend))throw new WorldletError(FAILURE.missing);
  switch(action){
   case 'attempt':if(review.attempted)throw new WorldletError(FAILURE.attempted);review.attempted=true;break;
   case 'confirm':review.attempted=true;review.confirmed=true;break;
   case 'acknowledge':if(!review.confirmed)throw new WorldletError(FAILURE.unconfirmed);delete reviews[id];break;
   case 'cancel':if(review.attempted)throw new WorldletError(FAILURE.attempted);delete reviews[id];break;
   // Delete only the local review; any delivery receipt remains in the backend.
   case 'discard':delete reviews[id];break;
   default:throw new WorldletError(FAILURE.invalid);
  }
  this.save(reviews);
 }
 clear(){this.ledger().replaceMailReviews({});}
}

/** The reviewed payload stays in MailReviews. Receipts contain no email content. */
function prepareMailOperation(ctx:SourcesContext,id:string,review:MailReview){
 const db=ctx.store.ledger();
 let operation=db.prepareRuntimeOperation(id,'gmail','mail.send',digest(review.backend+'|'+(review.draft.from??'')));
 if(operation.status==='prepared'&&review.attempted){
  operation=db.transitionRuntimeOperation(id,'submit');
  operation=db.transitionRuntimeOperation(id,review.confirmed?'verified':'uncertain');
 }
 return operation;
}

async function sendReviewedMail(ctx:SourcesContext,reviews:MailReviews,id:string,home:string,service:AgentRuntime):Promise<Row> {
 const review=reviews.review(id,home);
 if(review.attempted)throw new WorldletError(FAILURE.attempted);
 const db=ctx.store.ledger();prepareMailOperation(ctx,id,review);
 db.transitionRuntimeOperation(id,'submit');
 try{
  reviews.change(id,home,'attempt');
  const receipt=await service.run({action:'sourceRequest',provider:'gmail',operation:'send',id,draft:review.draft},home);
  if(receipt?.status!=='sent'||typeof receipt.messageId!=='string'||!receipt.messageId)throw new WorldletError('Sending is not confirmed. Check delivery before sending another copy.');
  db.transitionRuntimeOperation(id,'verified');
  reviews.change(id,home,'confirm');
  return {...receipt,operationId:id};
 }catch(error){
  try{db.transitionRuntimeOperation(id,'uncertain');}catch{}
  throw error;
 }
}

export function createReviews(ctx:SourcesContext){
 const {store}=ctx;
 const mail=new MailReviews(()=>store.ledger(),store.root);
 let mailService:AgentRuntime|null=null;
 const service=()=>mailService??=ctx.agent().makeSourceAccess();

 async function emailAction(body:Row):Promise<Row> {
  if(!store.writable||!store.state.cloudConsent||store.sampleEnabled())throw new WorldletError('Open your personal world and allow private context to review mail.');
  const operation=typeof body.operation==='string'?body.operation:'',home=ctx.home();
  if(operation==='list'){
   const rows=Object.entries(mail.load()).filter(([,review])=>mail.belongs(review,home)).sort((a,b)=>b[1].createdAt-a[1].createdAt);
   // `createdAt` in Unix seconds, for the Journal day a reply card stands on.
   return {reviews:rows.map(([id,review])=>({id,draft:review.draft,attempted:review.attempted,confirmed:review.confirmed,createdAt:Math.round(review.createdAt+978307200)}))};
  }
  if(typeof body.id!=='string')throw new WorldletError('Choose an email review first.');
  const id=body.id,review=mail.review(id,home),draft=review.draft;
  prepareMailOperation(ctx,id,review);
  if(['cancel','acknowledge','discard'].includes(operation)){
   if(operation==='cancel')store.ledger().transitionRuntimeOperation(id,'cancel');
   mail.change(id,home,operation);return {ok:true};
  }
  // The person's own edit of a draft on its reply card (the morning brief, owner Order 2026-10-07): the reviewed draft
  // stays immutable, so the edit becomes a new review with the same headers and the old one is cancelled.
  if(operation==='revise'){
   const text=typeof body.body==='string'?body.body.replace(/\r\n?/g,'\n').trim():'';
   if(review.attempted)throw new WorldletError(FAILURE.attempted);
   if(!text||characters(text)>30000)throw new WorldletError('Write the reply first.');
   store.ledger().transitionRuntimeOperation(id,'cancel');mail.change(id,home,'cancel');
   const revised=mail.create({...draft,body:text},home),next=mail.review(revised,home);
   prepareMailOperation(ctx,revised,next);
   return {id:revised,draft:next.draft};
  }
  if(operation==='reconcile'){
   const receipt=await service().run({action:'sourceRequest',provider:'gmail',operation:'reconcile',id,draft},home);
   if(receipt?.status==='sent'){store.ledger().transitionRuntimeOperation(id,'verified');mail.change(id,home,'confirm');}
   return receipt;
  }
  if(operation==='authorize'){
   if(review.attempted)throw new WorldletError(FAILURE.attempted);
   await service().run({action:'sourceRequest',provider:'gmail',operation:'authorizeSend'},home);
   return {ok:true};
  }
  if(operation!=='send'||review.attempted)throw new WorldletError(FAILURE.attempted);
  const access=await service().run({action:'sourceRequest',provider:'gmail',operation:'access'},home);
  if(access?.canSend!==true)return {needsAuthorization:true};
  return sendReviewedMail(ctx,mail,id,home,service());
 }

 // Reviewed Home Applet changes ----------------------------------------------------------
 const todoistIO=(operation:string,plan:Row)=>ctx.agent().makeSourceAccess().run({action:'sourceRequest',provider:'todoist',operation,id:plan.id??''},ctx.home());
 async function reviewedPrepare(plan:Row,expected?:Row):Promise<Row> {
  if(plan.connectionTransport!==ctx.accountsId())return homeWritePrepare(ctx,plan);
  const source=await todoistIO('review',plan);
  const reviewPlan={...plan};delete reviewPlan.connectionTransport;
  const input:Row={plan:reviewPlan,source};if(expected)input.expected=expected;
  const facts=core<Row>('todoistWriteReview',input);
  if(!facts||typeof facts!=='object')throw new WorldletError('Could not prepare the review.');
  return facts;
 }
 async function reviewedCommit(plan:Row,facts:Row,draft:Row):Promise<Row> {
  if(plan.connectionTransport!==ctx.accountsId())return homeWriteCommit(ctx,plan,facts);
  await reviewedPrepare(plan,facts);
  if(store.sourceContentRevision('todoist')!==draft.revision||!store.state.connections.some((c:Row)=>c.id===draft.connection&&c.provider==='todoist'&&c.transport===ctx.accountsId()&&canBuild(c)))throw new WorldletError('The connection changed. Prepare this action again.');
  const result=await todoistIO('complete',plan);
  const verified=core<Row>('todoistWriteResult',{id:plan.id??'',result});
  if(!verified||typeof verified!=='object')throw new WorldletError('Could not verify completion. Check Todoist before trying again.');
  return verified;
 }
 async function prepareHomeChange(input:Row):Promise<Row> {
  if(!store.writable||store.sampleEnabled()||!store.state.cloudConsent)throw new WorldletError('Use your personal world and allow private context first.');
  const plan=core<Row>('homeWritePlan',input),provider=plan?.provider;
  const connection=typeof provider==='string'?ctx.connections().find(c=>c.provider===provider&&c.transport===plan.connectionTransport&&canBuild(c)):undefined;
  if(!connection)throw new WorldletError('Connect this Applet first. Calendar changes require the local Mac connection.');
  if(store.busy)throw new WorldletError('Wait for the current source operation to finish.');
  return ctx.busyWhile(async()=>{
   const revision=store.sourceContentRevision(provider);
   const facts=await reviewedPrepare(plan);
   if(revision!==store.sourceContentRevision(provider)||ctx.currentSourceIndex(connection)<0)throw new WorldletError('The connection changed. Prepare this action again.');
   if(Object.keys(store.homeWriteDrafts).length>=20)throw new WorldletError('Close pending Home reviews or reopen Worldlet before preparing more changes.');
   const id=crypto.randomUUID().toUpperCase();
   // Drafts live only in this process. Restart discards unsubmitted private payloads.
   store.homeWriteDrafts[id]={plan,facts,connection:connection.id,revision};
   store.ledger().prepareRuntimeOperation(id,provider,'home.write',connection.id);
   return {id,plan,destination:facts.destination??'',targetTitle:facts.targetTitle??'',description:facts.description??'',notice:facts.notice??''};
  });
 }
 async function homeReview(body:Row):Promise<Row> {
  const id=typeof body.id==='string'?body.id:'',draft=store.homeWriteDrafts[id],plan=draft?.plan,provider=plan?.provider,facts=draft?.facts;
  if(!draft||!plan||typeof provider!=='string'||!facts)throw new WorldletError('This review has expired or was already attempted. Read the source before preparing a new change.');
  const operation=body.operation;
  if(operation!=='commit'&&operation!=='discard')throw new WorldletError('Unsupported review action.');
  const connection=store.writable&&!store.sampleEnabled()&&store.state.cloudConsent?ctx.connections().find(c=>c.id===draft.connection&&c.provider===provider&&c.transport===plan.connectionTransport&&canBuild(c)):undefined;
  if(!connection||store.sourceContentRevision(provider)!==draft.revision)throw new WorldletError('The source connection changed. Read it again before making changes.');
  if(store.busy)throw new WorldletError('Wait for the current source operation to finish.');
  return ctx.busyWhile(async()=>{
   const db=store.ledger();
   delete store.homeWriteDrafts[id];
   if(operation==='discard'){db.transitionRuntimeOperation(id,'cancel');return {status:'cancelled'};}
   db.transitionRuntimeOperation(id,'submit');
   try{
    const result=await reviewedCommit(plan,facts,draft);
    db.transitionRuntimeOperation(id,'verified');
    // A failed UI refresh cannot make a verified source write retryable.
    if(connection.transport!=='native')return {refreshPending:true,...result};
    try{await refreshApple(ctx,connection);}catch{return {refreshPending:true,...result};}
    return result;
   }catch(error){
    try{db.transitionRuntimeOperation(id,'uncertain');}catch{}
    throw error;
   }
  });
 }

 // Notion drafts -------------------------------------------------------------------------
 async function notionReview(operation:string,id='',draft:Row={}):Promise<Row> {
  const connection=store.writable&&!store.sampleEnabled()&&store.state.cloudConsent&&['prepare','commit','check','reviews','discard'].includes(operation)?ctx.agentConnection('notion'):undefined;
  if(!connection)throw new WorldletError('Connect Notion in your personal world first.');
  const index=ctx.currentSourceIndex(connection);
  if(index<0)throw new WorldletError('Notion is disconnected.');
  const row=store.state.connections[index];
  if(!row.cursors?.reviewGrant){row.cursors={...row.cursors??{},reviewGrant:crypto.randomUUID().toUpperCase()};store.changed();}
  const binding:string=row.cursors.reviewGrant;
  if(store.busy)throw new WorldletError('Wait for the current source operation to finish.');
  return ctx.busyWhile(async()=>{
   const db=store.ledger(),scope=digest(ctx.home()+'|'+connection.id+'|'+binding);
   if(operation==='commit'){db.prepareRuntimeOperation(id,'notion','notion.write',scope);db.transitionRuntimeOperation(id,'submit');}
   try{
    const result={...await ctx.sourceAccess().run({action:'sourceRequest',provider:'notion',operation,id,draft,binding},ctx.home())};
    const current=ctx.currentSourceIndex(connection);
    if(current<0||store.state.connections[current].cursors?.reviewGrant!==binding)throw new WorldletError('Notion connection changed. Check the page before submitting another copy.');
    if(operation==='prepare'&&typeof result.id==='string'){db.prepareRuntimeOperation(result.id,'notion','notion.write',scope);result.operationId=result.id;}
    if(['commit','check'].includes(operation)){
     const tracked=db.prepareRuntimeOperation(id,'notion','notion.write',scope);
     const event=core('runtimeNotionOutcome',{status:result.status??''});
     if(typeof event==='string'){
      // Existing backend attempted reviews migrate without becoming replayable.
      if(event==='uncertain'&&tracked.status==='prepared')db.transitionRuntimeOperation(id,'submit');
      db.transitionRuntimeOperation(id,event);
     }
     result.operationId=id;
     if(result.status==='review'&&tracked.status!=='prepared')result.status='unconfirmed';
    }
    if(operation==='reviews'&&Array.isArray(result.reviews)){
     const receipts=db.records('runtime-operations');
     result.reviews=result.reviews.map((review:Row)=>{
      const value={...review},receipt=typeof value.id==='string'?receipts.find(r=>r.id===value.id&&r.scope===scope):undefined;
      if(receipt){value.operationId=value.id;if(value.status==='review'&&receipt.status!=='prepared')value.status='unconfirmed';}
      return value;
     });
    }
    if(operation==='discard'){const existing=db.records('runtime-operations').find(r=>r.id===id&&r.scope===scope);if(existing?.status==='prepared')db.transitionRuntimeOperation(id,'cancel');}
    return result;
   }catch(error){
    if(operation==='commit')try{db.transitionRuntimeOperation(id,'uncertain');}catch{}
    throw error;
   }
  });
 }

 /** World tool host services served during a Fox turn. */
 async function serviceReply(name:string,args:Row,{quiet=false}:{quiet?:boolean}={}):Promise<Row|null> {
  if(name==='prepare_home_change'){
   const review=await prepareHomeChange(args);
   ctx.host.page.event('worldlet:home-review',review);
   return {status:'awaiting_user_confirmation',id:review.id??'',message:'The change is shown in Fox. Nothing has been written; the user must confirm.'};
  }
  if(name==='prepare_notion_change'){
   const draft=await notionReview('prepare','',args);
   ctx.host.page.event('worldlet:notion-review',draft);
   return {ok:true,status:'awaiting_user_confirmation',id:draft.id??'',operationId:draft.operationId??'',message:'The Notion draft is shown in Fox. Only the user can confirm writing. Nothing has been written.'};
  }
  if(name==='_email_review'){
   if(typeof args.body!=='string'||typeof args.to!=='string')throw new WorldletError('Email review is unavailable.');
   if(!Object.values(args).every(value=>typeof value==='string'))throw new WorldletError('Invalid prepared email.');
   const home=ctx.home(),id=mail.create(args as Record<string,string>,home),review=mail.review(id,home);
   prepareMailOperation(ctx,id,review);
   // Show exactly the stored draft Send uses, never a separately held copy (#1623). Background work's drafts (the
   // morning brief, owner Order 2026-10-07) wait as reply cards in the Journal, where the person sends them.
   if(quiet){ctx.host.page.event('worldlet:email-drafted',{id});return {ok:true,status:'awaiting_user_confirmation',id,operationId:id,message:'The draft is saved as a reply card in the Journal. Only the user can send it. Nothing has been sent.'};}
   ctx.host.page.event('worldlet:email-review',{id,draft:review.draft});
   return {ok:true,status:'awaiting_user_confirmation',id,operationId:id,message:'The draft is shown in Fox. Only the user can authorize sending with Send. Nothing has been sent.'};
  }
  return null;
 }
 return {
  emailAction,homeReview,serviceReply,
  notionReview:(body:Row)=>{
   const operation=typeof body.operation==='string'?body.operation:'reviews';
   if(!['commit','check','reviews','discard'].includes(operation))throw new WorldletError('Unsupported review action.');
   return notionReview(operation,typeof body.id==='string'?body.id:'');
  },
  clearMail:()=>mail.clear(),
  cancel:()=>{mailService?.cancel();}
 };
}
