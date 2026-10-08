import assert from 'node:assert/strict';
import {existsSync,mkdirSync,mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {stageGoogleRegistration} from './google-oauth-windows.ts';

const root=mkdtempSync(path.join(tmpdir(),'worldlet-google-bundle-')),output=path.join(root,'app');
try{
 const source=path.join(root,'registration.json'),target=path.join(output,'GoogleOAuthClient.json');
 const client={client_id:'fixture.apps.googleusercontent.com',client_secret:'desktop-registration',auth_uri:'https://wrong.invalid',token_uri:'https://wrong.invalid',refresh_token:'private-refresh',access_token:'private-access'};
 writeFileSync(source,JSON.stringify({installed:client,refresh_token:'private-root',account:'private-account'}));
 assert.equal(stageGoogleRegistration(root,output,source),true);
 const staged=JSON.parse(readFileSync(target,'utf8'));
 assert.deepEqual(staged,{installed:{client_id:client.client_id,client_secret:client.client_secret,auth_uri:'https://accounts.google.com/o/oauth2/auth',token_uri:'https://oauth2.googleapis.com/token',redirect_uris:['http://localhost']}});
 assert(!existsSync(path.join(output,'WorldletWeb','GoogleOAuthClient.json')));
 assert.equal(stageGoogleRegistration(root,output,''),false);assert(!existsSync(target),'Removing registration must not leave a stale bundle');
 mkdirSync(path.join(root,'.local'));writeFileSync(path.join(root,'.local','google-oauth-client.json'),JSON.stringify({installed:client}));
 assert(stageGoogleRegistration(root,output,''),'Checkout-local app registration is supported');
 for(const invalid of [{web:client},{installed:{...client,client_id:'wrong'}},{installed:{...client,client_secret:''}},{refresh_token:'user-token'},null]){
  writeFileSync(source,JSON.stringify(invalid));assert.throws(()=>stageGoogleRegistration(root,output,source));
 }
 writeFileSync(source,'{\n"private-value":');assert.throws(()=>stageGoogleRegistration(root,output,source),error=>!String(error).includes('private-value'));
 writeFileSync(source,' '.repeat(64001));assert.throws(()=>stageGoogleRegistration(root,output,source),/too large/);
 assert.throws(()=>stageGoogleRegistration(root,output,path.join(root,'missing.json')),'An explicit missing registration fails the build');
 console.log('PASS Windows Google registration bundle: allowlisted fields, fixed endpoints, optional local source, stale removal and invalid input refusal.');
}finally{rmSync(root,{recursive:true,force:true});}
