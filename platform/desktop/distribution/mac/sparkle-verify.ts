// Verifies a Sparkle EdDSA signature against a raw base64 Ed25519 public key.
// Usage: node sparkle-verify.ts <public-key-base64> <file> <signature-base64>
import {createPublicKey,verify} from 'node:crypto';
import {readFileSync} from 'node:fs';
export function sparkleSignatureValid(publicKey:string,data:Buffer,signature:string){
 const raw=Buffer.from(publicKey,'base64');
 if(raw.length!==32)throw Error('Invalid Sparkle public key.');
 // SPKI prefix for a raw Ed25519 public key.
 const key=createPublicKey({key:Buffer.concat([Buffer.from('302a300506032b6570032100','hex'),raw]),format:'der',type:'spki'});
 return verify(null,data,key,Buffer.from(signature,'base64'));
}
if(process.argv[1]?.endsWith('sparkle-verify.ts')){
 const [,,key,file,signature]=process.argv;
 if(!key||!file||!signature){console.error('Usage: sparkle-verify.ts <public-key> <file> <signature>');process.exit(2);}
 process.exit(sparkleSignatureValid(key,readFileSync(file),signature)?0:1);
}
