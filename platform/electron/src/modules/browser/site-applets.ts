import crypto from 'node:crypto';
import {SITE_APPLET_LIMITS,mailIconURL,readSiteApplet,siteAppletFor,siteAppletPage,siteAppletRecord,validSiteAppletId,type SiteAppletRecord} from '../../../../../core/applets/index.ts';
import {WorldletError} from '../../files.ts';
import type {Host} from '../../host/types.ts';
import {readImage} from '../sources/mail-avatar.ts';

/** Website Applets made from the Browser (core/applets/site-applet.ts). The Browser's Make Applet button sends the
 * page it shows; the record (name, page, the site's icon as a data: image) is kept as a `site` row of the
 * person's own Applets (core/applets/MY-APPLETS.md#one-table), and the World page builds a device for each one from the snapshot. */
export function installSiteApplets(host:Host){
 const {store}=host;
 const own=()=>store.writable&&!store.sampleEnabled();
 const records=():SiteAppletRecord[]=>{
  if(!own())return [];
  try{return store.ledger().myApplets('site').flatMap(row=>{const record=readSiteApplet(row.record);return record?[record]:[];}).sort((a,b)=>a.createdAt-b.createdAt);}
  catch(error){host.diagnostics.record(error,'siteApplets');return [];}
 };
 const extras=store.snapshotExtras;
 store.snapshotExtras=()=>({...extras(),siteApplets:records()});
 host.register({
  siteApplets:async request=>{
   const operation=typeof request.operation==='string'?request.operation:'list';
   if(operation==='list')return {applets:records().map(({icon:_icon,...record})=>record)};
   if(!own())throw new WorldletError('Applets are made in your own world. The practice world has none.');
   if(operation==='make'){
    const url=siteAppletPage(request.url);
    if(!url)throw new WorldletError('This page can’t become an Applet. Open the site’s own page first.');
    const all=records(),existing=siteAppletFor(all,url.href);
    if(existing)return {ok:true,id:existing.id,title:existing.title,existing:true};
    if(all.length>=SITE_APPLET_LIMITS.applets)throw new WorldletError(`This world already has ${SITE_APPLET_LIMITS.applets} Applets made from websites. Delete one first.`);
    // The site's icon, read once through the same favicon service Mail uses for organizations; none is fine.
    let icon='';try{icon=await readImage(mailIconURL(url.hostname.toLowerCase().replace(/^www\./,'')),SITE_APPLET_LIMITS.icon,32);}catch{}
    const record=siteAppletRecord({url,title:request.title,icon},{id:'site-'+crypto.randomBytes(6).toString('hex'),now:Math.floor(Date.now()/1000)});
    store.ledger().saveMyApplet(record.id,'site',record as any);store.worldChanged();
    return {ok:true,id:record.id,title:record.title};
   }
   // No question first (owner request 2026-10-07): the website and the sign-in to it stay, and Make Applet
   // in the Browser brings the Applet back in one press.
   if(operation==='delete'){
    const id=request.id,record=validSiteAppletId(id)?records().find(r=>r.id===id):undefined;
    if(!record)throw new WorldletError('That Applet is not in this world any more.');
    store.ledger().deleteMyApplets([record.id]);store.worldChanged();
    return {ok:true};
   }
   throw new WorldletError('Unknown Applet request.');
  },
 });
}
