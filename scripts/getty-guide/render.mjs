// Renders resources/styles/builtin/drafts/getty-guide/scene.html (the Getty Center miniature, three.js) to render.png and where each stop lands on it
// (pins.json). Needs three next to scene.html: `npm i --prefix <tmp> three@0.169` and link <tmp>/node_modules/three
// into that folder as ./three (it is not a repository dependency). See README.md.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {writeFileSync} from 'node:fs';
import {extname,join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
const here=join(dirname(fileURLToPath(import.meta.url)),'../../resources/styles/builtin/drafts/getty-guide'),types={'.html':'text/html','.js':'text/javascript'};
const server=createServer(async(req,res)=>{try{const path=join(here,decodeURIComponent(new URL(req.url,'http://x').pathname));
 res.writeHead(200,{'content-type':types[extname(path)]||'application/octet-stream'});res.end(await readFile(path));}catch{res.writeHead(404);res.end();}});
await new Promise(ok=>server.listen(0,ok));
const browser=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
 const page=await browser.newPage({viewport:{width:1400,height:1000}});
 await page.goto(`http://localhost:${server.address().port}/scene.html?w=1400&h=1000`);
 await page.waitForFunction(()=>window.READY,null,{timeout:120000});
 writeFileSync(join(here,'pins.json'),JSON.stringify(await page.evaluate(()=>window.PINS))+'\n');
 await page.locator('canvas').screenshot({path:join(here,'render.png'),omitBackground:true});
}finally{await browser.close();server.close();}
