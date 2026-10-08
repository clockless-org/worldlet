// Ship the pinned official executable: end users need neither Node nor a CLI install.
import {realpathSync} from 'node:fs';
import {copyFile, mkdir, chmod, readFile, mkdtemp, writeFile, rm} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const require=createRequire(import.meta.url);
export async function bundleStripe(contents){
  const arch=process.env.WORLDLET_TARGET_ARCH||'arm64';
  if(process.platform!=='darwin'||!['arm64','x86_64'].includes(arch))throw Error('Stripe bundling requires macOS arm64 or x86_64.');
  const helpers=path.join(contents,'Helpers');await mkdir(helpers,{recursive:true});
  const target=path.join(helpers,'stripe');
  if(arch===process.arch||(arch==='x86_64'&&process.arch==='x64')){
    await copyFile(require.resolve(`@stripe/cli-darwin-${process.arch}/bin/stripe`),target);
  }else{
    const lock=JSON.parse(await readFile(new URL('../package-lock.json',import.meta.url),'utf8'));
    const pkg=lock.packages['node_modules/@stripe/cli-darwin-x64'];
    if(arch!=='x86_64'||!pkg?.resolved?.startsWith('https://registry.npmjs.org/')||!pkg.integrity?.startsWith('sha512-'))throw Error('Missing pinned Intel Stripe CLI');
    const response=await fetch(pkg.resolved,{signal:AbortSignal.timeout(120000)});
    if(!response.ok)throw Error('Could not fetch pinned Intel Stripe CLI');
    const bytes=Buffer.from(await response.arrayBuffer());
    if(createHash('sha512').update(bytes).digest('base64')!==pkg.integrity.slice(7))throw Error('Intel Stripe CLI checksum mismatch');
    const temp=await mkdtemp(path.join(tmpdir(),'worldlet-stripe-'));
    try{
      const archive=path.join(temp,'stripe.tgz');await writeFile(archive,bytes);
      execFileSync('tar',['-xzf',archive,'-C',temp,'package/bin/stripe']);
      await copyFile(path.join(temp,'package/bin/stripe'),target);
    }finally{await rm(temp,{recursive:true,force:true});}
  }
  await chmod(target,0o755);
  const resources=path.join(contents,'Resources');await mkdir(resources,{recursive:true});
  await copyFile(new URL('../resources/common/STRIPE-CLI-LICENSE.txt',import.meta.url),path.join(resources,'STRIPE-CLI-LICENSE.txt'));
}
if(process.argv[1]&&realpathSync(process.argv[1])===realpathSync(fileURLToPath(import.meta.url))){if(!process.argv[2])throw Error('Usage: bundle-stripe.ts <app Contents>');await bundleStripe(path.resolve(process.argv[2]));}
