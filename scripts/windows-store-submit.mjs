import {existsSync,mkdirSync,readFileSync,readdirSync,statSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {crc32} from 'node:zlib';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

// Microsoft Store delivery for an already built Store MSIX. It records the live package and any
// pending submission separately; a pending, certifying or certified submission is never published.
// Only the Store reports "live", and only for the exact candidate version.
const api='https://manage.devcenter.microsoft.com/v1.0/my';
const settled=new Set(['Published','CommitFailed','PreProcessingFailed','CertificationFailed','PublishFailed','ReleaseFailed','Canceled']);
export const credentialKeys=['WORLDLET_STORE_TENANT_ID','WORLDLET_STORE_CLIENT_ID','WORLDLET_STORE_CLIENT_SECRET'];

// Store package versions are four numeric parts; compare them numerically, not as text.
export function compareVersions(a,b){const x=a.split('.').map(Number),y=b.split('.').map(Number);for(let i=0;i<4;i++)if((x[i]||0)!==(y[i]||0))return (x[i]||0)-(y[i]||0);return 0;}
const versions=submission=>(submission?.applicationPackages||[]).filter(p=>p.fileStatus!=='PendingDelete'&&p.version).map(p=>p.version).sort(compareVersions);
// Separate evidence stages: saved (draft updated), submitted (committed), certification,
// certified (release/publishing), live (published) and failed.
export function stageFor(status){
 if(!status)return 'none';
 if(/Failed$|^Canceled$/.test(status))return 'failed';
 if(status==='Published')return 'live';
 if(['Release','Publishing'].includes(status))return 'certified';
 if(status==='Certification')return 'certification';
 if(['CommitStarted','PreProcessing'].includes(status))return 'submitted';
 return 'saved'; // PendingCommit and any draft state the Store has not accepted yet.
}
// Minimal stored (uncompressed) ZIP holding one file; MSIX content is already compressed.
export function zipOne(name,data){
 const file=Buffer.from(name),crc=crc32(data),local=Buffer.alloc(30),central=Buffer.alloc(46),end=Buffer.alloc(22);
 local.writeUInt32LE(0x04034b50,0);local.writeUInt16LE(20,4);local.writeUInt32LE(crc,14);local.writeUInt32LE(data.length,18);local.writeUInt32LE(data.length,22);local.writeUInt16LE(file.length,26);
 central.writeUInt32LE(0x02014b50,0);central.writeUInt16LE(20,4);central.writeUInt16LE(20,6);central.writeUInt32LE(crc,16);central.writeUInt32LE(data.length,20);central.writeUInt32LE(data.length,24);central.writeUInt16LE(file.length,28);
 const offset=local.length+file.length+data.length;
 end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(1,8);end.writeUInt16LE(1,10);end.writeUInt32LE(central.length+file.length,12);end.writeUInt32LE(offset,16);
 return Buffer.concat([local,file,data,central,file,end]);
}
export function latestCandidate(root){
 const dir=path.join(root,'dist/windows-msix');
 const files=existsSync(dir)?readdirSync(dir).filter(f=>/^store-.+\.msix$/.test(f)).map(f=>path.join(dir,f)):[];
 return files.sort((a,b)=>statSync(b).mtimeMs-statSync(a).mtimeMs)[0];
}
export function readCandidate(file,store){
 const meta=JSON.parse(readFileSync(file+'.json','utf8'));
 if(meta.testOnly||meta.packageName!==store.name||meta.distributionChannel!=='microsoft-store'||!/^\d+\.\d+\.0\.0$/.test(meta.packageVersion))throw Error('Not a Microsoft Store submission candidate.');
 const data=readFileSync(file);
 if(createHash('sha256').update(data).digest('hex')!==meta.sha256)throw Error('MSIX does not match its recorded SHA-256.');
 return {meta,data};
}

export async function deliverStore({file,store,env,dryRun=false,fetchImpl=fetch,sleep=ms=>new Promise(r=>setTimeout(r,ms)),polls=30,interval=10000,blockSize=32*1024*1024,now=()=>new Date().toISOString(),log=()=>{}}){
 const {meta,data}=readCandidate(file,store);
 const record={checkedAt:now(),storeId:store.storeId,dryRun,candidate:{packageVersion:meta.packageVersion,version:meta.version,build:meta.build,sourceCommit:meta.sourceCommit,sha256:meta.sha256},live:null,pending:null,submission:null,state:'unknown'};
 if(credentialKeys.some(key=>!env[key])){record.state='not-configured';record.note='Store API credentials are not configured; live and pending were not queried and nothing was submitted.';return record;}
 const token=await (async()=>{
  const response=await fetchImpl(`https://login.microsoftonline.com/${encodeURIComponent(env.WORLDLET_STORE_TENANT_ID)}/oauth2/token`,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'client_credentials',client_id:env.WORLDLET_STORE_CLIENT_ID,client_secret:env.WORLDLET_STORE_CLIENT_SECRET,resource:'https://manage.devcenter.microsoft.com'}).toString()});
  if(!response.ok)throw Error(`Store API authentication failed (${response.status}).`);
  return (await response.json()).access_token;
 })();
 const call=async(method,url,body)=>{
  const response=await fetchImpl(api+url,{method,headers:{authorization:'Bearer '+token,...(body?{'content-type':'application/json'}:{})},body:body&&JSON.stringify(body)});
  if(!response.ok)throw Error(`Store API ${method} ${url.replace(/\/[0-9]{6,}/g,'/…')} failed (${response.status}).`);
  const text=await response.text();return text?JSON.parse(text):{};
 };
 const app='/applications/'+encodeURIComponent(store.storeId);
 const read=async()=>{
  const info=await call('GET',app);
  const published=info.lastPublishedApplicationSubmission?.id,pendingId=info.pendingApplicationSubmission?.id;
  const last=published&&await call('GET',`${app}/submissions/${published}`);
  const pending=pendingId&&await call('GET',`${app}/submissions/${pendingId}`);
  record.live=last?{submissionId:published,versions:versions(last)}:{submissionId:null,versions:[]};
  record.pending=pending?{submissionId:pendingId,status:pending.status,stage:stageFor(pending.status),versions:versions(pending)}:null;
  return {last,pending};
 };
 const liveNow=()=>record.live.versions.includes(meta.packageVersion);
 let {last,pending}=await read();
 const finish=state=>{record.state=state;record.checkedAt=now();return record;};
 if(liveNow())return finish('live');
 if(record.live.versions.some(v=>compareVersions(v,meta.packageVersion)>0))return finish('superseded');
 // A pending submission that carries this candidate is ours (an earlier run); report its stage.
 // Any other pending submission (for example a manual Partner Center draft) is left untouched.
 if(pending){
  if(!record.pending.versions.includes(meta.packageVersion))return finish('pending-other');
  record.submission={id:record.pending.submissionId,status:pending.status};return finish(stageFor(pending.status));
 }
 if(dryRun)return finish('dry-run');
 if(!last)return finish('no-live-submission'); // First publication stays a Partner Center decision.
 const created=await call('POST',`${app}/submissions`);
 record.submission={id:created.id,status:created.status};
 const fileName=`Worldlet-${meta.packageVersion}-x64.msix`;
 const upload=zipOne(fileName,data),blocks=[];
 log(`Uploading ${fileName} (${upload.length} bytes).`);
 for(let offset=0;offset<upload.length;offset+=blockSize){
  const id=Buffer.from(String(blocks.length).padStart(6,'0')).toString('base64');blocks.push(id);
  const response=await fetchImpl(`${created.fileUploadUrl}&comp=block&blockid=${encodeURIComponent(id)}`,{method:'PUT',headers:{'x-ms-blob-type':'BlockBlob'},body:upload.subarray(offset,offset+blockSize)});
  if(!response.ok)throw Error(`Store package upload failed (${response.status}).`);
 }
 const list=`<?xml version="1.0" encoding="utf-8"?><BlockList>${blocks.map(id=>`<Latest>${id}</Latest>`).join('')}</BlockList>`;
 const committed=await fetchImpl(`${created.fileUploadUrl}&comp=blocklist`,{method:'PUT',headers:{'content-type':'application/xml'},body:list});
 if(!committed.ok)throw Error(`Store package upload failed (${committed.status}).`);
 // Replace the previous x64 package with this candidate; listings and other fields stay as cloned.
 const packages=(created.applicationPackages||[]).map(p=>({...p,fileStatus:'PendingDelete'}));
 packages.push({fileName,fileStatus:'PendingUpload',minimumDirectXVersion:'None',minimumSystemRam:'None'});
 await call('PUT',`${app}/submissions/${created.id}`,{...created,applicationPackages:packages});
 record.submission.status='PendingCommit';finish('saved');
 await call('POST',`${app}/submissions/${created.id}/commit`);
 let status='CommitStarted';
 for(let i=0;i<polls&&status==='CommitStarted';i++){await sleep(interval);status=(await call('GET',`${app}/submissions/${created.id}/status`)).status;}
 record.submission.status=status;
 ({last,pending}=await read());
 if(liveNow())return finish('live');
 return finish(stageFor(status)==='saved'?'submitted':stageFor(status));
}

if(process.argv[1]===fileURLToPath(import.meta.url)){
 const root=fileURLToPath(new URL('../',import.meta.url)),args=process.argv.slice(2);
 const value=name=>{const i=args.indexOf(name);return i>=0?args[i+1]:undefined;};
 const file=value('--package')||latestCandidate(root);
 if(!file)throw Error('Build a Store MSIX first: node scripts/windows-msix.ts');
 const store=JSON.parse(readFileSync(path.join(root,'platform/electron/distribution/windows/store-identity.json'),'utf8'));
 const out=value('--record')||path.join(root,'.local/windows-store-delivery.json');
 const record=await deliverStore({file:path.resolve(file),store,env:process.env,dryRun:args.includes('--dry-run'),log:console.log});
 mkdirSync(path.dirname(out),{recursive:true});writeFileSync(out,JSON.stringify(record,null,2)+'\n');
 const list=v=>v?.length?v.join(', '):'none';
 console.log(`Store ${record.state}: candidate ${record.candidate.packageVersion} · live ${record.live?list(record.live.versions):'not queried'} · pending ${record.pending?`${list(record.pending.versions)} (${record.pending.status})`:record.live?'none':'not queried'}`);
 if(record.note)console.log(record.note);
 console.log('Only "live" means the Store serves this candidate; saved, submitted, certification and certified are pending.');
 if(record.state==='failed')process.exitCode=1;
}
