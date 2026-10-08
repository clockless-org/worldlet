import {readFile,mkdir,writeFile,realpath} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import sharp from 'sharp';
import {parseWorldPack,worldPackPath} from '../ui/world/world-pack.ts';

const root=await realpath(path.resolve(process.argv[2]||'resources/worlds/village'));
const pack=parseWorldPack(JSON.parse(await readFile(path.join(root,'manifest.json'),'utf8')));
if(pack.artStatus!=='approved')console.warn('DRAFT artwork: retained for review, not approved for runtime. Style: '+pack.style.id+'@'+pack.style.version);
const relativeFiles=[...new Set(['manifest.json','README.md',pack.provenance.prompt,...pack.layers.flatMap(l=>[l.src,...(l.prompt?[l.prompt]:[])]),...pack.areas.flatMap(a=>a.closeView?[a.closeView.src,...Object.values(a.closeView.devices||{})]:[])])];
const checksums={};
for(const relative of relativeFiles){
 worldPackPath(relative);const absolute=await realpath(path.join(root,relative));
 if(!absolute.startsWith(root+path.sep))throw Error('Package file escapes root: '+relative);
 checksums[relative]=createHash('sha256').update(await readFile(absolute)).digest('hex');
}
for(const layer of pack.layers){const info=await sharp(path.join(root,layer.src)).metadata(),[width,height]=layer.sourceSize||[pack.canvas.width,pack.canvas.height];if(info.width!==width||info.height!==height)throw Error('Actual image size differs from manifest: '+layer.id);}
const output=path.resolve('output/world-packs');await mkdir(output,{recursive:true});
const base=pack.id+'-'+pack.version,archive=path.join(output,base+'.zip');
// Archive is allowlisted: credentials, arbitrary neighboring files and draft art never enter it.
const zipped=spawnSync('zip',['-q','-FS',archive,...relativeFiles],{cwd:root,encoding:'utf8'});if(zipped.status!==0)throw Error(zipped.stderr||'zip failed');
await writeFile(path.join(output,base+'.sha256.json'),JSON.stringify(checksums,null,2)+'\n');
const scenery=(await Promise.all(pack.layers.filter(l=>l.lighting==='day').map(async l=>{
 const image='data:image/png;base64,'+(await readFile(path.join(root,l.src))).toString('base64'),[x,y,w,h]=l.bounds;
 return `<img alt="World scenery" src="${image}" style="left:${x*100}%;top:${y*100}%;width:${w*100}%;height:${h*100}%;opacity:${l.opacity??1}">`;
}))).join('');
const safeJSON=JSON.stringify(pack).replace(/</g,'\\u003c');
await writeFile(path.join(output,base+'.html'),`<!doctype html><meta charset="utf-8"><title>World package review</title><style>body{margin:0;background:#23302a;color:#f6f1e5;font:16px system-ui}header{padding:12px 20px;display:flex;gap:20px}main{position:relative;width:100%;aspect-ratio:${pack.canvas.width}/${pack.canvas.height}}img,svg{position:absolute;width:100%;height:100%}svg{overflow:visible}button{font:inherit}text{paint-order:stroke;stroke:#263b31;stroke-width:4;fill:white;font:20px system-ui}.hidden{display:none}</style><header><span id="title"></span><button id="toggle">Show/hide placement map</button><span>Dashed areas · crosses: ground anchors · boxes: maximum device clearance</span></header><main>${scenery}<svg id="map" viewBox="0 0 ${pack.canvas.width} ${pack.canvas.height}"></svg></main><script>const p=${safeJSON},w=p.canvas.width,h=p.canvas.height,svg=document.querySelector('svg'),ns='http://www.w3.org/2000/svg';document.querySelector('#title').textContent=p.title+' · '+w+' × '+h;const el=(tag,attrs,text)=>{const n=document.createElementNS(ns,tag);for(const[k,v]of Object.entries(attrs))n.setAttribute(k,v);if(text)n.textContent=text;svg.append(n)};for(const a of p.areas){el('rect',{x:a.bounds[0]*w,y:a.bounds[1]*h,width:a.bounds[2]*w,height:a.bounds[3]*h,fill:'none',stroke:'#ffdf89','stroke-width':2,'stroke-dasharray':'10 8'});el('text',{x:a.label[0]*w,y:a.label[1]*h,'text-anchor':'middle'},a.title);for(const s of a.slots){const x=s.anchor[0]*w,y=s.anchor[1]*h;el('rect',{x:x-s.maxSize[0]*w/2,y:y-s.maxSize[1]*h,width:s.maxSize[0]*w,height:s.maxSize[1]*h,fill:'#fff8','fill-opacity':.1,stroke:'#fff','stroke-width':1});el('path',{d:'M'+(x-10)+','+y+'h20 M'+x+','+(y-10)+'v20',stroke:'#ffdb79','stroke-width':3});el('text',{x,y:y+26,'text-anchor':'middle'},s.id.split('-').at(-1));}}for(const r of p.hudSafeAreas)el('rect',{x:r[0]*w,y:r[1]*h,width:r[2]*w,height:r[3]*h,fill:'#ec9a6044',stroke:'#ec9a60','stroke-width':2});document.querySelector('#toggle').onclick=()=>svg.classList.toggle('hidden');</script>`);
console.log(JSON.stringify({archive,preview:path.join(output,base+'.html'),areas:pack.areas.length,slots:pack.areas.reduce((n,a)=>n+a.slots.length,0),canvas:pack.canvas},null,2));
