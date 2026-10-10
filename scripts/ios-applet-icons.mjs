// node scripts/ios-applet-icons.mjs: the iPhone app's Applet icons are the computer's own Applet devices (owner
// request 2026-10-04: "applet 用我们的 icons"). For every Applet in the built-in style (resources/styles/builtin/
// manifest.json `applets`), its Peek device art is trimmed to the device, centred on a transparent square and kept
// at 180 px (a 60-point tile at 3x) as ios/App/Assets.xcassets/Applets/applet-<key>.imageset, palette-compressed so
// the whole set stays small. `moment` (Moment Applets) and `ongoing` (things brought from other Agents) are there
// too. Run it again after Applet art changes; `--check` (part of npm run test:ios) fails when an Applet has no icon.
import {mkdirSync,readFileSync,readdirSync,rmSync,writeFileSync,existsSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
const manifest=JSON.parse(readFileSync(path.join(root,'ui/theme-packages/village/style.json'),'utf8'));
const folder=path.join(root,'ios/App/Assets.xcassets/Applets');
const SIZE=180,INFO={author:'xcode',version:1};
const keys=Object.keys(manifest.applets).filter(k=>manifest.applets[k]?.peek).sort();

if(process.argv.includes('--check')){
 const missing=keys.filter(k=>!existsSync(path.join(folder,`applet-${k}.imageset/applet-${k}.png`)));
 if(missing.length){console.error('FAIL iOS Applet icons missing (run node scripts/ios-applet-icons.mjs): '+missing.join(', '));process.exit(1);}
 console.log(`PASS iOS Applet icons: ${keys.length}`);process.exit(0);
}

const {default:sharp}=await import('sharp');
rmSync(folder,{recursive:true,force:true});
mkdirSync(folder,{recursive:true});
writeFileSync(path.join(folder,'Contents.json'),JSON.stringify({info:INFO})+'\n');
let bytes=0;
for(const key of keys){
 const name=`applet-${key}`,dir=path.join(folder,name+'.imageset');
 const device=await sharp(path.join(root,manifest.applets[key].peek)).ensureAlpha().trim({threshold:1}).toBuffer();
 const png=await sharp(device).resize(SIZE,SIZE,{fit:'contain',background:{r:0,g:0,b:0,alpha:0},kernel:'lanczos3'})
  .png({palette:true,quality:92,effort:10,dither:0.6}).toBuffer();
 mkdirSync(dir,{recursive:true});
 writeFileSync(path.join(dir,name+'.png'),png);
 writeFileSync(path.join(dir,'Contents.json'),JSON.stringify({images:[{filename:name+'.png',idiom:'universal'}],info:INFO})+'\n');
 bytes+=png.length;
}
console.log(`${keys.length} Applet icons, ${(bytes/1024/1024).toFixed(1)} MB, in ${path.relative(root,folder)}`);
for(const extra of readdirSync(folder))if(extra.endsWith('.imageset')&&!keys.includes(extra.slice(7,-9)))console.warn('unexpected '+extra);
