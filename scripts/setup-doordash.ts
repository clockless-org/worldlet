// Official pinned consumer CLI. No login, PATH edits or skills installed in other agents.
import {mkdir,mkdtemp,rm,writeFile,rename,chmod,access} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
if(process.platform!=='darwin'||process.arch!=='arm64')throw Error('DoorDash CLI currently supports Apple Silicon Macs.');
const version='0.2.4',name=`dd-cli-v${version}-darwin-arm64`,base=path.join(os.homedir(),'.local/share/worldlet/dd-cli'),dest=path.join(base,version);
try{await access(path.join(dest,name));console.log(`DoorDash CLI ${version} is installed. Sign in from the bridge-side Applet.`);process.exit(0);}catch{}
await mkdir(base,{recursive:true});const temp=await mkdtemp(path.join(base,'.install-'));
try{
 const response=await fetch(`https://github.com/doordash-oss/doordash-cli/releases/download/v${version}/${name}.tar.gz`);if(!response.ok)throw Error('Could not download the official CLI.');
 const bytes=Buffer.from(await response.arrayBuffer());if(createHash('sha256').update(bytes).digest('hex')!=='996c3519eb67e48872f546f2e14fd4d2058f81e051182219f91c5260ca50725b')throw Error('DoorDash download checksum mismatch.');
 const archive=path.join(temp,'cli.tar.gz');await writeFile(archive,bytes);execFileSync('tar',['-xzf',archive,'-C',temp]);
 const folder=path.join(temp,name);await chmod(path.join(folder,name),0o755);await rename(folder,dest);
 console.log(`Installed DoorDash CLI ${version}. Open the bridge-side Applet to sign in. Early-access approval is required.`);
}finally{await rm(temp,{recursive:true,force:true});}
