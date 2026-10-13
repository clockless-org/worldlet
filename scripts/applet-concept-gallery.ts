import {existsSync, readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
const ref='resources/styles/builtin/references/registered-scenes';
const theme='ui/theme-packages/village';
const library=JSON.parse(readFileSync(path.join(root,theme,'scene-library.json'),'utf8'));
const asset=(file:string)=>{const bytes=readFileSync(path.join(root,file));return {path:file,sha256:createHash('sha256').update(bytes).digest('hex')};};
const entries=library.entries.map((entry:{id:string;title:string;collection:string;icon:string;background:string;registrationKey?:string|null})=>{
  const directory=`${ref}/${entry.collection==='branded'?'brands':'concepts'}/${entry.id}`;
  const effect=`${directory}/effect.webp`;
  const runtimeBackground=`${theme}/${entry.background}`;
  const background=entry.collection==='branded'&&!entry.registrationKey?`${directory}/background.webp`:runtimeBackground;
  return {...entry,icon:asset(`${theme}/${entry.icon}`),background:existsSync(path.join(root,background))?asset(background):null,effect:existsSync(path.join(root,effect))?asset(effect):null};
});
const manifest={schemaVersion:1,generator:'built-in imagegen',status:'Historical image-generated design studies; backgrounds use the current measured scene. Website applets render their original sites.',entries};
const output=path.join(root,'output/applet-concept-gallery');mkdirSync(output,{recursive:true});
writeFileSync(path.join(output,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
const escape=(value:string)=>value.replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c]!));
const cards=entries.map((e:any)=>`<article data-collection="${e.collection}" data-name="${escape(e.title.toLowerCase())}"><h2><img class="icon" src="/${e.icon.path}" alt="">${escape(e.title)} <small>${e.effect?'🟢 Concept ready':'🟡 Generating'}</small></h2><div class="pair"><figure>${e.background?`<a href="/${e.background.path}"><img loading="lazy" src="/${e.background.path}" alt="${escape(e.title)} background"></a>`:'<p>Background pending</p>'}<figcaption>Background</figcaption></figure><figure>${e.effect?`<a href="/${e.effect.path}"><img loading="lazy" src="/${e.effect.path}" alt="${escape(e.title)} image-generated concept"></a>`:'<p>Concept pending</p>'}<figcaption>Earlier image-generated concept · original proportions</figcaption></figure></div></article>`).join('\n');
writeFileSync(path.join(output,'index.html'),`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Village · Image-generated Applet concepts</title><style>*{box-sizing:border-box}body{margin:0;background:#eee8db;color:#263b30;font:16px/1.5 system-ui}header{padding:24px 4vw;background:#fff9ee;border-bottom:1px solid #cfc4ae;position:sticky;top:0;z-index:1}h1{font:32px Georgia;margin:0}p{margin:8px 0}select,input{font:inherit;padding:8px 12px;background:#fffdf8;border:1px solid #baad94;border-radius:6px}main{padding:8px 3vw}article{margin:28px 0 44px}h2{display:flex;align-items:center;gap:12px;font:26px Georgia}small{font:13px system-ui;margin-left:auto}.icon{width:64px;height:64px;object-fit:contain}.pair{display:grid;grid-template-columns:1fr 1fr;gap:18px}figure{margin:0;background:#fff9ef;border-radius:8px;overflow:hidden;min-height:180px}figure img{display:block;width:100%;aspect-ratio:16/9;object-fit:contain}figcaption{padding:9px 14px;font-size:13px}figure p{padding:50px;color:#766b59}a{color:inherit}article[hidden]{display:none}@media(max-width:800px){.pair{grid-template-columns:1fr}header{position:static}h1{font-size:26px}}</style><header><h1>Village · Applet concepts</h1><p>${entries.filter((e:any)=>e.effect).length} / 140 image-generated concepts · 24 core · 16 generic · 100 branded</p><p>Current backgrounds beside earlier visual studies. These studies retain the earlier proportions; website Applets use the real site. Select an image to inspect it at full size.</p><label>Collection <select id="collection"><option value="all">All</option><option value="core">Core · 24</option><option value="generic">Generic · 16</option><option value="branded">Branded · 100</option></select></label> <input id="search" aria-label="Search Applets" placeholder="Search Applets"></header><main>${cards}</main><script>const collection=document.querySelector('#collection'),search=document.querySelector('#search');function filter(){for(const article of document.querySelectorAll('article'))article.hidden=(collection.value!=='all'&&article.dataset.collection!==collection.value)||!article.dataset.name.includes(search.value.toLowerCase());}collection.onchange=filter;search.oninput=filter;</script></html>`);
console.log(`Concept gallery: ${entries.filter((e:any)=>e.effect).length}/140 effects; ${entries.filter((e:any)=>e.collection==='branded'&&e.background).length}/100 branded backgrounds.`);
if(process.argv.includes('--complete')&&(entries.some((e:any)=>!e.effect||!e.background)))throw new Error('The complete concept collection has missing images.');

if (process.argv.includes('--write-docs')) {
  writeFileSync(path.join(root, ref, 'concept-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  const relative = (file: string) => path.relative(path.join(root, ref), path.join(root, file)).split(path.sep).join('/');
  const groups = [{id: 'core', title: 'Core applications and games', count: 24}, {id: 'generic', title: 'Generic scenes', count: 16}, {id: 'branded', title: 'Branded applications and games', count: 100}];
  const document = [
    '# Village image-generated Applet concepts',
    '',
    'These raster design studies establish the visual target. They are not HTML screenshots or working applications. All displayed records and conversations are fictional. Text, calculations and game positions are illustrative and must be validated during implementation.',
    '',
    '| Collection | Backgrounds | Effects | Runtime integration |',
    '| --- | ---: | ---: | --- |',
    ...groups.map(g => `| ${g.title} | ${entries.filter((e: any) => e.collection === g.id && e.background).length}/${g.count} | ${entries.filter((e: any) => e.collection === g.id && e.effect).length}/${g.count} | 🟡 Design study |`),
    '',
    'Each pair shows the current registered background followed by an earlier image-generated effect. The effects retain their original proportions and are visual references, not screenshots of the current runtime. Current backgrounds target approximately 70% width and 80% height for content, with extracted transparent foregrounds covering the inner seams. Website Applets use their original sites in the host browser surface.',
    '',
    'Build the searchable local gallery with `node scripts/applet-concept-gallery.ts --complete`, serve the repository root and open `/output/applet-concept-gallery/`. Rebuild this document and the hash manifest with `--write-docs`.',
    '',
    '## Implementation guidance',
    '',
    '- Keep the left content surface large, continuous and close to front-facing. Use a normalized region relative to the source image, with a measured inner safe inset.',
    '- Build the right side around useful objects related to the application: filing cabinets, instruments, travel equipment, books, tools or food. Match the existing icon and preserve the Village world style.',
    '- Treat the scene and frame as artwork. Render dynamic text, controls and records as HTML inside the surface; use images for thumbnails, textures and small illustrations.',
    '- Match paper, linen, wood and brass shading to the scene lighting. Do not bake interactive text into the runtime background.',
    '- Measure companion placement against the host HUD. Rich scenery does not imply that its entire right-hand area is safe for a dialogue panel.',
    '- Check text contrast, overflow, keyboard focus, empty and loading states, and different viewport sizes when implementing HTML. A concept image does not establish these behaviors.',
    '',
    'See [the scene inventory](README.md), [generation direction](concept-direction.json), and [asset manifest](concept-manifest.json). Prompts and provenance are stored beside each generated image.',
    ...groups.flatMap(g => ['', `## ${g.title}`, '', ...entries.filter((e: any) => e.collection === g.id).flatMap((e: any) => [
      `### ${e.title}`, '', `<img src="${relative(e.icon.path)}" alt="${e.title} icon" width="96">`, '',
      '| Background | Image-generated effect |', '| --- | --- |',
      `| ${e.background ? `![${e.title} background](${relative(e.background.path)})` : 'Pending'} | ${e.effect ? `![${e.title} effect](${relative(e.effect.path)})` : 'Pending'} |`, '',
    ])]),
  ].join('\n');
  writeFileSync(path.join(root, ref, 'CONCEPTS.md'), document.trimEnd() + '\n');
}
