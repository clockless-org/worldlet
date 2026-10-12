/** A repeatable preview of the production Notes component with fictional records. */
import {build} from 'esbuild';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
export async function buildNotesPreview(root:string){
 const output=path.join(root,'output/notes-notebook');await mkdir(output,{recursive:true});
 await build({entryPoints:[path.join(root,'scripts/fixtures/notes-notebook/main.ts')],outfile:path.join(output,'notes.js'),bundle:true,format:'iife'});
 await writeFile(path.join(output,'index.html'),`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Notes · Fictional sample notebook</title><link rel="stylesheet" href="/dist/WorldletWeb/worldlet-ui.css"><link rel="stylesheet" href="/ui/shell/pixi-world.css"><link rel="stylesheet" href="/ui/applets/scene/applet-scene.css"><link rel="stylesheet" href="/ui/applets/apple-notes/open.css"><style>html,body{margin:0;width:100%;height:100%;overflow:hidden}#notionWorld{position:fixed;inset:0}#viewport{position:absolute;inset:0}</style></head><body><div id="notionWorld" class="notion-world native-console"><main id="viewport" class="pixi-applet-stage" data-scene="apple-notes" data-applet="apple-notes"></main></div><script src="notes.js"></script></body></html>`);
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await buildNotesPreview(fileURLToPath(new URL('../',import.meta.url)));
