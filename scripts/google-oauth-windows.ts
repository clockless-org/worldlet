import {existsSync,mkdirSync,readFileSync,rmSync,statSync,writeFileSync} from 'node:fs';
import path from 'node:path';

// Same allowlist as google-oauth-bundle.py. Desktop registration is app identity,
// never an account grant. Keep it outside WorldletWeb's public file mapping.
export function stageGoogleRegistration(root:string,output:string,source=process.env.WORLDLET_GOOGLE_CLIENT_FILE){
 const target=path.join(output,'GoogleOAuthClient.json');
 const input=source||path.join(root,'.local','google-oauth-client.json');
 if(!source&&!existsSync(input)){rmSync(target,{force:true});return false;}
 if(statSync(input).size>64000)throw Error('The Google OAuth registration is too large.');
 let data;
 try{data=JSON.parse(readFileSync(input,'utf8'));}catch{throw Error('Choose a valid Google Desktop OAuth registration JSON.');}
 const client=data?.installed;
 if(!client||typeof client.client_id!=='string'||!(/^[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/).test(client.client_id))throw Error('A Google OAuth Desktop client registration is required.');
 if(typeof client.client_secret!=='string'||!client.client_secret)throw Error('The Google OAuth Desktop registration is incomplete.');
 const registration={installed:{client_id:client.client_id,client_secret:client.client_secret,
  auth_uri:'https://accounts.google.com/o/oauth2/auth',token_uri:'https://oauth2.googleapis.com/token',redirect_uris:['http://localhost']}};
 mkdirSync(output,{recursive:true});writeFileSync(target,JSON.stringify(registration)+'\n');return true;
}
