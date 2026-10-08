// After an upload, hands the build to the public beta: waits for App Store Connect to finish processing it, adds it to
// the app's external TestFlight groups (the public link is one) and submits it for Beta App Review, so external testers
// get every new build without anyone clicking in App Store Connect (owner question 2026-10-04). It needs an App Store
// Connect API key on the development host: `.local/app-store-connect.json` holding {"issuerId","keyId"} and optionally
// "keyPath" (default ~/.appstoreconnect/private_keys/AuthKey_<keyId>.p8) and "groups" (external group names; default
// every external group with a public link, else every external group). Without the file uploads still reach internal
// testers and this step reports `no key`.
import {createPrivateKey,sign} from 'node:crypto';
import {existsSync,readFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const BUNDLE_ID='app.worldlet.ios';
const API='https://api.appstoreconnect.apple.com/v1';
const b64=value=>Buffer.from(typeof value==='string'?value:JSON.stringify(value)).toString('base64url');

/** The key file, or null when this host has none. */
export function readKey(root,home=os.homedir()){
 const file=path.join(root,'.local/app-store-connect.json');
 if(!existsSync(file))return null;
 const config=JSON.parse(readFileSync(file,'utf8'));
 if(!config?.issuerId||!config?.keyId)throw new Error('.local/app-store-connect.json needs issuerId and keyId');
 const keyPath=config.keyPath||path.join(home,'.appstoreconnect/private_keys',`AuthKey_${config.keyId}.p8`);
 return {...config,keyPath,privateKey:readFileSync(keyPath,'utf8')};
}
/** xcodebuild's App Store Connect API-key sign-in: with it, archive and upload sign through the key (cloud signing)
 * and need no Apple ID in Xcode › Settings › Accounts. Empty without a key. */
export const xcodeAuth=key=>key?['-authenticationKeyPath',key.keyPath,'-authenticationKeyID',key.keyId,'-authenticationKeyIssuerID',key.issuerId]:[];

/** A 20-minute ES256 token for the App Store Connect API. */
export function token({issuerId,keyId,privateKey},now=Date.now()){
 const iat=Math.floor(now/1000);
 const body=b64({alg:'ES256',kid:keyId,typ:'JWT'})+'.'+b64({iss:issuerId,iat,exp:iat+19*60,aud:'appstoreconnect-v1'});
 return body+'.'+sign('sha256',Buffer.from(body),{key:createPrivateKey(privateKey),dsaEncoding:'ieee-p1363'}).toString('base64url');
}

/** Which external groups get the build: the named ones, else those with a public link, else all external groups. */
export function pickGroups(groups,names){
 const external=groups.filter(g=>!g.attributes?.isInternalGroup);
 if(names?.length)return external.filter(g=>names.includes(g.attributes?.name));
 const open=external.filter(g=>g.attributes?.publicLinkEnabled);
 return open.length?open:external;
}

/** Waits for `build` to be processed, then adds it to the external groups and submits it for Beta App Review. */
export async function distribute({key,build,whatsNew,fetch=globalThis.fetch,wait=ms=>new Promise(r=>setTimeout(r,ms)),log=console.log,pollMs=60_000,maxPolls=90}){
 const call=async(method,url,body)=>{
  const response=await fetch(API+url,{method,headers:{authorization:'Bearer '+token(key),'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
  const text=await response.text();
  const json=text?JSON.parse(text):null;
  if(!response.ok){const error=new Error(`${method} ${url}: ${response.status} ${json?.errors?.[0]?.detail||json?.errors?.[0]?.title||text}`.slice(0,300));error.status=response.status;throw error;}
  return json;
 };
 const app=(await call('GET',`/apps?filter[bundleId]=${BUNDLE_ID}&limit=1`)).data?.[0];
 if(!app)throw new Error('no App Store Connect app for '+BUNDLE_ID);
 let found=null;
 for(let i=0;i<maxPolls;i++){
  found=(await call('GET',`/builds?filter[app]=${app.id}&filter[version]=${encodeURIComponent(build)}&limit=1`)).data?.[0];
  const state=found?.attributes?.processingState;
  if(state==='VALID')break;
  if(state==='FAILED'||state==='INVALID')throw new Error(`build ${build} processing ${state}`);
  found=null;await wait(pollMs);
 }
 if(!found)throw new Error(`build ${build} still processing`);
 if(whatsNew){
  try{
   const loc=(await call('GET',`/builds/${found.id}/betaBuildLocalizations`)).data?.[0];
   if(loc)await call('PATCH',`/betaBuildLocalizations/${loc.id}`,{data:{type:'betaBuildLocalizations',id:loc.id,attributes:{whatsNew}}});
   else await call('POST','/betaBuildLocalizations',{data:{type:'betaBuildLocalizations',attributes:{locale:'en-US',whatsNew},relationships:{build:{data:{type:'builds',id:found.id}}}}});
  }catch(error){log('testflight: what to test not set:',error.message);}
 }
 const groups=pickGroups((await call('GET',`/betaGroups?filter[app]=${app.id}&limit=50`)).data||[],key.groups);
 if(!groups.length)throw new Error('no external TestFlight group');
 for(const group of groups)await call('POST',`/betaGroups/${group.id}/relationships/builds`,{data:[{type:'builds',id:found.id}]});
 let review='submitted';
 try{await call('POST','/betaAppReviewSubmissions',{data:{type:'betaAppReviewSubmissions',relationships:{build:{data:{type:'builds',id:found.id}}}}});}
 catch(error){if(error.status!==409)throw error;review='already submitted';}
 log('testflight: build',build,'added to',groups.map(g=>g.attributes?.name).join(', '),'and',review,'for beta review');
 return {groups:groups.map(g=>g.attributes?.name),review};
}
