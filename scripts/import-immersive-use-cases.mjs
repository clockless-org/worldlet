import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import {createHash} from 'node:crypto';
const base='resources/styles/builtin',out='output/immersive-v5',target=base+'/references/immersive/use-cases.json';
const inventory=JSON.parse(fs.readFileSync(out+'/inventory.json')),manifest=JSON.parse(fs.readFileSync(base+'/manifest.json'));
const coverage=fs.existsSync(target)?JSON.parse(fs.readFileSync(target)):{date:'2026-10-06',authorization:'Sentinel_c14672e6e8d081918382aa56647088e0: all118 approved to proceed after Oura/PayPal/Strava samples',direction:'Product-use-case driven, varied indoor/outdoor/open settings; close complete activity in right third, quiet continuous left environment',items:inventory.map(a=>({...a,generation:'pending',integration:'pending',visual:'pending',interaction:'pending',history:[]}))};
const records=new Map();
function add(key,file,extra={}){records.set(key,{...JSON.parse(fs.readFileSync(file)),key,record:path.resolve(file),...extra});}
for(const key of ['youtube','meetings','google-calendar'])add(key,'output/immersive-v3/'+key+'.json',{approvedSample:true,setting:key==='youtube'?'outdoor':'open'});
for(const key of ['oura','paypal','strava'])add(key,out+'/'+key+(key==='oura'?'':'-refined')+'.json',{approvedSample:true,setting:key==='paypal'?'open':'outdoor'});
for(const key of ['gmail','apple-notes','weather','voice-memos','airbnb','tiktok','little-alchemy-2','cookie-clicker','spotify'])add(key,'output/immersive-v4/'+(key==='weather'?'revision-':'generated-')+key+'.json',{reusedFunctionalScene:true,setting:key==='weather'?'open':'indoor'});
for(const file of fs.readdirSync(out).filter(f=>/^generated-.*\.json$/.test(f))){const r=JSON.parse(fs.readFileSync(out+'/'+file));add(r.key,out+'/'+file);}
for(const file of fs.readdirSync(out).filter(f=>/^revision-.*\.json$/.test(f))){const r=JSON.parse(fs.readFileSync(out+'/'+file));if(file==='revision-'+r.key+'.json')add(r.key,out+'/'+file);}
const hash=b=>createHash('sha256').update(b).digest('hex');
for(const r of records.values()){
 const item=coverage.items.find(a=>a.key===r.key);if(!item)throw Error('Unknown Applet '+r.key);
 const input=r.output_hint.match(/ as (\/[^\n]+\.png) by default/)?.[1];if(!input||!fs.existsSync(input))throw Error('Missing source '+r.key);
 const sourceSha256=hash(fs.readFileSync(input)),encoding='webp86-max1600-v1';
 if(item.sourceSha256===sourceSha256&&item.encoding===encoding&&item.integration==='complete')continue;
 const file=base+'/assets/applets/'+r.key+'/immersive.webp';
 await sharp(input).resize({width:1600,withoutEnlargement:true}).webp({quality:86,effort:6}).toFile(file);
 const original=await sharp(input).metadata(),encoded=await sharp(file).metadata();
 const history=[...(item.history||[]),{source:input,sourceSha256,record:r.record,prompt:r.prompt,references:r.refs||r.references||[],generator:r.generator||'built-in imagegen',date:r.date||'2026-10-06'}];
 Object.assign(item,{generation:'complete',integration:'complete',visual:r.approvedSample?'owner-approved-source':'pending',interaction:'pending',approvedSample:!!r.approvedSample,reusedFunctionalScene:!!r.reusedFunctionalScene,setting:r.setting||'pending-classification',brief:r.brief||null,focus:file,source:input,sourceSha256,sha256:hash(fs.readFileSync(file)),sourceWidth:original.width,sourceHeight:original.height,width:encoded.width,height:encoded.height,bytes:fs.statSync(file).size,encoding,prompt:r.prompt,references:r.refs||r.references||[],record:r.record,generator:'built-in imagegen',model:'not exposed',history});
 manifest.applets[r.key].focus=file;
}
coverage.counts={total:coverage.items.length,generated:coverage.items.filter(a=>a.generation==='complete').length,integrated:coverage.items.filter(a=>a.integration==='complete').length,visualPassed:coverage.items.filter(a=>a.visual==='pass').length,interactionPassed:coverage.items.filter(a=>a.interaction==='pass').length,bytes:coverage.items.reduce((n,a)=>n+(a.bytes||0),0)};
fs.writeFileSync(target,JSON.stringify(coverage,null,2)+'\n');fs.writeFileSync(base+'/manifest.json',JSON.stringify(manifest,null,2)+'\n');console.log(coverage.counts);
