// Builds the Node host (platform/server): one CommonJS file for Node 22, with `electron` aliased to the host's shim, the
// host and the `worldlet` command line in one program (src/cli.ts), and the Worldlet skill it copies into Agents.
// Output: dist/node/worldlet.cjs (or `--out <dir>`). It runs beside dist/WorldletWeb in a checkout.
import {build} from 'esbuild';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {mkdir,readFile} from 'node:fs/promises';
import {buildInfo} from './build-info.ts';
const root=fileURLToPath(new URL('../',import.meta.url));
const index=process.argv.indexOf('--out');
const out=index>0?path.resolve(process.argv[index+1]):path.join(root,'dist/node');
await mkdir(out,{recursive:true});
await build({
 entryPoints:[path.join(root,'platform/server/src/cli.ts')],outfile:path.join(out,'worldlet.cjs'),
 bundle:true,platform:'node',format:'cjs',target:'node22',loader:{'.sql':'text'},sourcemap:'linked',logLevel:'warning',
 alias:{electron:path.join(root,'platform/server/src/electron-shim.ts')},
 define:{__WORLDLET_NODE_VERSION__:JSON.stringify(buildInfo().version),__WORLDLET_SKILL__:JSON.stringify(await readFile(path.join(root,'harness/skills/worldlet/SKILL.md'),'utf8'))},
});
console.log('Built Node host → '+path.relative(root,path.join(out,'worldlet.cjs')));
