// Builds the Node host (platform/node): one CommonJS file for Node 22, with `electron` aliased to the host's shim.
// Output: dist/node/worldlet.cjs (or `--out <dir>`). It runs beside dist/WorldletWeb in a checkout.
import {build} from 'esbuild';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {mkdir} from 'node:fs/promises';
import {buildInfo} from './build-info.ts';
const root=fileURLToPath(new URL('../',import.meta.url));
const index=process.argv.indexOf('--out');
const out=index>0?path.resolve(process.argv[index+1]):path.join(root,'dist/node');
await mkdir(out,{recursive:true});
await build({
 entryPoints:[path.join(root,'platform/node/src/main.ts')],outfile:path.join(out,'worldlet.cjs'),
 bundle:true,platform:'node',format:'cjs',target:'node22',loader:{'.sql':'text'},sourcemap:'linked',logLevel:'warning',
 alias:{electron:path.join(root,'platform/node/src/electron-shim.ts')},
 define:{__WORLDLET_NODE_VERSION__:JSON.stringify(buildInfo().version)},
});
console.log('Built Node host → '+path.relative(root,path.join(out,'worldlet.cjs')));
