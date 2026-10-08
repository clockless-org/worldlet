// Builds the Electron Platform host: main process and the trusted World preload.
import {build} from 'esbuild';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {mkdir,writeFile} from 'node:fs/promises';
import {cachedAgentBrowser} from './package-agent-browser.ts';
import {cachedImsg} from './package-imsg.ts';
import {buildWebEngine} from './build-web-engine.ts';
const root=fileURLToPath(new URL('../',import.meta.url));
const index=process.argv.indexOf('--out');
const out=index>0?path.resolve(process.argv[index+1]):path.join(root,'dist/electron');
await mkdir(out,{recursive:true});
const common={bundle:true,platform:'node' as const,format:'cjs' as const,target:'node24',external:['electron'],loader:{'.sql':'text' as const},sourcemap:'linked' as const,logLevel:'warning' as const};
await Promise.all([
 build({...common,entryPoints:[path.join(root,'platform/electron/src/main.ts')],outfile:path.join(out,'main.cjs')}),
 build({...common,entryPoints:[path.join(root,'platform/electron/src/world/preload.ts')],outfile:path.join(out,'world-preload.cjs')}),
 build({...common,entryPoints:[path.join(root,'platform/electron/src/modules/browser/engine/surface-preload.ts')],outfile:path.join(out,'web-surface-preload.cjs')})
]);
await writeFile(path.join(out,'package.json'),JSON.stringify({name:'worldlet',productName:'Worldlet',main:'main.cjs',private:true},null,1));
// Development hosts find the browser driver in .local/browser-driver (platform/electron/src/resources.ts).
// Offline builds still succeed; Fox's browser tasks then report the missing driver.
if(!process.env.WORLDLET_AGENT_BROWSER)await cachedAgentBrowser(root).catch(error=>console.warn('Browser driver not prepared: '+error.message));
// The Messages Applet's imsg (scripts/package-imsg.ts) in .local/imsg, Mac only.
if(process.platform==='darwin'&&!process.env.WORLDLET_IMSG)await cachedImsg(root).catch(error=>console.warn('imsg not prepared: '+error.message));
// Website pages use the CEF engine (platform/web-engine) where it is built; an unbuilt engine leaves
// them on Electron's own views. Packaged apps build it in scripts/package-electron.ts.
if(['darwin','win32','linux'].includes(process.platform)&&!process.env.WORLDLET_SKIP_WEB_ENGINE)await buildWebEngine().catch(error=>console.warn('Website engine not built: '+error.message));
console.log('Built Electron host → '+path.relative(root,out));
