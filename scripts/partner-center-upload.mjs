// Upload a Store MSIX to a Partner Center submission with Playwright (owner decision 2026-10-02: fully automatic
// on 01). Claude in Chrome uploads at most 10 MB and computer use cannot operate a browser's file dialog, so the
// package goes straight into the page's file input of a real Chrome. The Chrome profile is this host's own
// (.local/partner-center-profile); the owner signs in to Partner Center in it once and the script never types
// credentials. It opens the product's draft submission or starts an update (--product), uploads the package unless
// the submission already has it, waits for validation, removes every other package (and duplicates of this one)
// and saves. With --submit (owner decision 2026-10-02: "以后自动提交") it then completes Submission options and
// presses Submit for certification.
// node scripts/partner-center-upload.mjs --file <msix> (--product <Store ID> | --submission <packages URL>)
//   [--submit] [--out <dir>] [--profile <dir>]
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export const defaultProfile=root=>path.join(root,'.local/partner-center-profile');
const arg=(name,fallback)=>{const i=process.argv.indexOf('--'+name);return i>0?process.argv[i+1]:fallback;};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const flat=t=>String(t||'').replace(/\s+/g,' ').trim();
// Progress of an upload in the drop zone; the package list below it only shows finished packages.
export const busy=text=>/Analyzing package|Uploading|Validating\.\.\.|\bPause\b/i.test(text);
// The MSIX always gets "restricted capabilities require approval ... runFullTrust", which the submission's
// Restricted capabilities note answers: warnings are reported, not failures.
export const rejected=text=>flat(text).match(/[^.]*(validation error|upload failed|failed to upload|is not valid)[^.]*\./i)?.[0]?.trim();
export const warnings=text=>[...new Set(String(text||'').split('\n').map(l=>l.trim()).filter(l=>/warning:/i.test(l)))];

export const overviewUrl=product=>'https://partner.microsoft.com/en-us/dashboard/products/'+product+'/overview';
// The release part of the product overview, above the read-only Store presence section.
export const releaseText=text=>String(text||'').split('Store presence')[0];
export const inFlight=release=>/Certification status|In certification|Publishing|Pre-processing/i.test(release)&&!/In draft/i.test(release);
const signedInAt=async(page,url,ready)=>page.url().startsWith(url)&&await ready()&&!await page.getByRole('heading',{name:'Sign in required'}).isVisible().catch(()=>false);
async function waitSignedIn(page,url,ready,{signInMs,log}){
 for(const end=Date.now()+signInMs;!await signedInAt(page,url,ready);){
  if(Date.now()>end)return false;
  log('waiting for the owner to sign in to Partner Center in the opened Chrome window');await sleep(5000);
  if(!page.url().includes('login')&&!page.url().startsWith(url)&&page.url().startsWith('https://partner.microsoft.com/'))await page.goto(url,{waitUntil:'domcontentloaded'}).catch(()=>{});
 }
 return true;
}
// The draft submission's packages page, or a new update submission's when none is in draft. A submission already
// in certification or publishing is left alone: the package waits (deferred).
async function resolveSubmission(page,product,{signInMs,log,snap}){
 const url=overviewUrl(product);
 await page.goto(url,{waitUntil:'domcontentloaded'});
 if(!await waitSignedIn(page,url,async()=>/Product release/.test(await page.locator('main').innerText().catch(()=>'')),{signInMs,log}))return {state:'blocked',summary:"Partner Center was not signed in in this host's Chrome profile"};
 await sleep(5000);
 const release=releaseText(await page.locator('main').innerText().catch(()=>''));
 if(inFlight(release)){await snap(page,'in-flight');return {state:'deferred',summary:'A submission of the product is in certification or publishing; the package waits for it.'};}
 const draft=()=>page.evaluate(()=>[...document.querySelectorAll('a[href*="/submissions/"]')].map(a=>a.href.match(/\/submissions\/(\d+)\//)?.[1]).find(Boolean));
 let id=/In draft/i.test(release)?await draft():null;
 if(!id){
  log('starting an update submission');
  const start=page.locator('he-button:not([disabled]),button:not([disabled])').filter({hasText:/^\s*(Update|Start update|Start your submission|Create a new submission)\s*$/});
  if(!await start.first().waitFor({timeout:60000}).then(()=>start.first().click()).then(()=>true,()=>false)){await snap(page,'no-update');return {state:'blocked',summary:'No draft submission and no way to start an update was found on the product overview'};}
  await page.waitForURL(/\/submissions\/\d+\//,{timeout:180000}).catch(()=>{});
  id=page.url().match(/\/submissions\/(\d+)\//)?.[1]||await draft();
  if(!id){await snap(page,'no-submission');return {state:'blocked',summary:'Starting an update did not open a submission'};}
 }
 return {submission:url.replace(/\/overview$/,'/submissions/'+id+'/packages')};
}

export async function upload({file,submission,product,out,profile,submit=false,signInMs=30*60000,uploadMs=90*60000,log=console.log}){
 if(!product&&!/^https:\/\/partner\.microsoft\.com\/.+\/submissions\/\d+\/packages$/.test(submission||''))throw Error('--submission must be a Partner Center submission packages URL');
 if(product&&!/^[0-9A-Z]{12}$/.test(product))throw Error('--product must be a Store ID');
 const name=path.basename(file);fs.statSync(file);fs.mkdirSync(out,{recursive:true});
 let shot=0;const snap=async(page,label)=>{const f=path.join(out,`${String(++shot).padStart(2,'0')}-${label}.png`);await page.screenshot({path:f,fullPage:true}).catch(()=>{});return f;};
 const ctx=await chromium.launchPersistentContext(profile,{channel:'chrome',headless:false,viewport:null,args:['--start-maximized']});
 try{
  const page=ctx.pages()[0]||await ctx.newPage();
  if(product){const r=await resolveSubmission(page,product,{signInMs,log,snap});if(!r.submission)return r;submission=r.submission;log('submission '+submission);}
  await page.goto(submission,{waitUntil:'domcontentloaded'});
  // Signed in when the submission's package drop zone is there; otherwise the owner signs in in this window.
  const input=page.locator('input[type=file]');
  if(!await waitSignedIn(page,submission,async()=>await input.count()>0,{signInMs,log})){await snap(page,'not-signed-in');return {state:'blocked',summary:"Partner Center was not signed in in this host's Chrome profile"};}
  // Each package of the submission is one app-package-details-submission element; the list renders after the
  // drop zone, so wait for it (a submission without packages has none).
  const list=page.locator('app-package-details-submission');
  const row=()=>list.filter({hasText:name});
  const body=()=>page.locator('main').innerText().catch(()=>'');
  await list.first().waitFor({timeout:60000}).catch(()=>{});await sleep(3000);
  await snap(page,'before');
  if(await row().count()===0){log(`uploading ${name}`);await input.first().setInputFiles(file);}
  else log(`${name} is already in the submission`);
  for(let tick=0,end=Date.now()+uploadMs;;tick++){
   const text=await body(),n=await row().count();
   if(tick%6===0){log(`${n} row(s) for ${name}${busy(text)?', upload in progress':''}`);await page.screenshot({path:path.join(out,'progress.png'),fullPage:true}).catch(()=>{});}
   const bad=rejected(text);
   if(bad){await snap(page,'rejected');return {state:'blocked',summary:`Partner Center rejected ${name}: ${bad}`};}
   if(n>0&&!busy(text))break;
   if(Date.now()>end){await snap(page,'upload-timeout');return {state:'blocked',summary:`${name} did not finish uploading and validating`};}
   await sleep(10000);
  }
  await snap(page,'uploaded');
  // Partner Center refuses to save two uploads of one package identity: the first one stays. Every other
  // package goes; one Partner Center already marks for removal has no Remove button. Playwright locators did not
  // reach these Angular buttons on the live page, so the clicks are DOM clicks on data-l10n-key buttons.
  const removed=await page.evaluate(name=>{
   const out=[];let kept=false;
   for(const row of document.querySelectorAll('app-package-details-submission')){
    const label=row.innerText.split(/[\t\n]/)[0].trim(),button=row.querySelector('button[data-l10n-key="app_package_action_remove"]');
    if(label===name&&!kept){kept=true;continue;}
    if(button){button.click();out.push(label===name?`duplicate ${name}`:label);}
   }
   return out;
  },name);
  await sleep(3000);
  const found=warnings(await body());
  await snap(page,'removed');
  if(!await page.evaluate(()=>{const b=[...document.querySelectorAll('input[type=button],button')].find(b=>(b.value||b.textContent).trim()==='Save'&&!b.disabled);b?.click();return !!b;}))
   {await snap(page,'no-save');return {state:'blocked',summary:`Save was not available after uploading ${name}`};}
  await page.waitForLoadState('networkidle',{timeout:120000}).catch(()=>{});await sleep(5000);
  // Save returns to the product overview; the packages page is opened again to read what was saved.
  await page.goto(submission,{waitUntil:'domcontentloaded'});await list.first().waitFor({timeout:60000}).catch(()=>{});await sleep(3000);
  const after=await snap(page,'saved');
  const left=(await list.allInnerTexts()).map(t=>flat(t).split(' Show details')[0]);
  const ok=left.length===1&&left[0]===name;
  const uploaded={submission,state:ok?'uploaded':'blocked',summary:`${ok?'Uploaded':'Upload not confirmed for'} ${name}${removed.length?`, removed ${removed.join(', ')}`:''}, saved.${found.length?` Warnings: ${found.join(' ')}`:''} Packages after reload: ${left.join(', ')||'none'}`,screenshot:after};
  if(!ok||!submit)return uploaded;
  const sent=await submitForCertification(page,submission,{snap,log});
  return {...sent,submission,summary:`${uploaded.summary} ${sent.summary}`};
 }finally{await ctx.close();}
}

// Answer for the restricted capability Partner Center asks about on Submission options (at most 500 characters).
export const runFullTrustNote="Worldlet is a per-user Electron desktop app. runFullTrust runs its desktop process and the child processes it needs: a bundled Chromium-based website engine, local SQLite storage for the user's notes and files, DPAPI-protected credential storage, OAuth loopback sign-in and a per-user Python assistant runtime prepared on first use. Data stays in per-user app data. No admin rights, drivers or services are needed. Microphone use is optional dictation. Updates come only from Microsoft Store.";
const clickValue=(page,label)=>page.evaluate(label=>{const b=[...document.querySelectorAll('input[type=button],input[type=submit],button,a')].find(b=>(b.value||b.textContent).trim()===label&&!b.disabled&&b.getAttribute('aria-disabled')!=='true');b?.click();return !!b;},label);
// Submission options must carry a runFullTrust note within the limit, every overview section must be complete,
// then Submit for certification. A submission that is already in certification is left alone.
export async function submitForCertification(page,submission,{snap,log=console.log}){
 const base=submission.replace(/\/packages$/,''),overview=submission.replace(/\/submissions\/\d+\/packages$/,'/overview');
 await page.goto(base+'/options',{waitUntil:'domcontentloaded'});
 const note=page.locator('textarea').first();
 if(await note.waitFor({timeout:30000}).then(()=>true,()=>false)){
  const v=await note.inputValue();
  if(!v.trim()||v.length>500){
   log('setting the runFullTrust note');await note.fill(runFullTrustNote);await sleep(1000);
   if(!await clickValue(page,'Save')){await snap(page,'options-no-save');return {state:'blocked',summary:'Submission options could not be saved'};}
   await page.waitForLoadState('networkidle',{timeout:120000}).catch(()=>{});await sleep(5000);
  }
 }
 await page.goto(overview,{waitUntil:'domcontentloaded'});await sleep(8000);
 const text=await page.locator('main').innerText().catch(()=>'');
 const release=releaseText(text);
 if(inFlight(release)){await snap(page,'already-submitted');return {state:'submitted',summary:'The submission is already in certification.'};}
 const missing=[...release.matchAll(/\n([^\n]+)\n(?:[^\n]*\n)??Incomplete/g)].map(m=>m[1].trim());
 if(/Incomplete/.test(release)){await snap(page,'incomplete');return {state:'blocked',summary:`The submission is incomplete in Partner Center (${missing.join(', ')||'see overview'})`};}
 // Submit is an he-button web component that stays disabled while the overview computes the sections.
 log('submitting for certification');
 const submitButton=page.locator('he-button:not([disabled])').filter({hasText:/^\s*Submit for certification\s*$/});
 if(!await submitButton.first().waitFor({timeout:120000}).then(()=>submitButton.first().click()).then(()=>true,()=>false)){await snap(page,'no-submit');return {state:'blocked',summary:'Submit for certification was not available'};}
 await page.waitForLoadState('networkidle',{timeout:120000}).catch(()=>{});await sleep(15000);
 const after=await page.locator('main').innerText().catch(()=>'');const shot=await snap(page,'submitted');
 const ok=/certification|pre-processing|in progress|publishing/i.test(after)&&!/In draft/i.test(after.split('Store presence')[0]);
 return {state:ok?'submitted':'blocked',summary:ok?`Submitted for certification; Partner Center shows: ${flat(after).slice(0,300)}`:`Submit was pressed but the status is not confirmed: ${flat(after).slice(0,300)}`,screenshot:shot};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const file=arg('file'),submission=arg('submission'),product=arg('product');
 if(!file||!(submission||product))throw Error('Usage: --file <msix> (--product <Store ID> | --submission <packages URL>) [--submit] [--out <dir>] [--profile <dir>]');
 const out=path.resolve(arg('out',path.join(root,'.local/machine-store/partner-center-'+Date.now())));
 const submit=process.argv.includes('--submit');
 const result=await upload({file:path.resolve(file),submission,product,out,submit,profile:path.resolve(arg('profile',defaultProfile(root)))});
 fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,1));
 console.log(JSON.stringify(result));
 if(result.state!==(submit?'submitted':'uploaded'))process.exitCode=1;
}
