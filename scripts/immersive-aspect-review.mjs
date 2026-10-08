import fs from 'node:fs';import sharp from 'sharp';
const root='output/immersive-v5',folder=root+'/aspect-review',coverage=JSON.parse(fs.readFileSync('resources/styles/builtin/references/immersive/use-cases.json')),report=JSON.parse(fs.readFileSync(root+'/acceptance/report.json'));
const composition=JSON.parse(fs.readFileSync('resources/styles/builtin/references/immersive/composition.json'));
const sizes=[1600,820,2560],rows=coverage.items.filter(a=>a.integration==='complete'&&sizes.every(w=>report.some(r=>r.key===a.key&&r.width===w&&r.status==='rendered'&&r.sourceSha256===a.sourceSha256&&r.state?.focus?.geometry?.subjectLeft===composition.items[a.key].subjectLeft)));
fs.mkdirSync(folder,{recursive:true});const sheets=[];
for(let start=0;start<rows.length;start+=6){const inputs=[],part=rows.slice(start,start+6);
 for(const [i,a] of part.entries()){
  const x=i%3*360,y=Math.floor(i/3)*560;
  inputs.push({input:Buffer.from(`<svg width="360" height="27"><rect width="360" height="27" fill="white"/><text x="5" y="19" font-family="Arial" font-size="16">${a.key} | 1600 / 820 / 2560</text></svg>`),left:x,top:y});
  inputs.push({input:await sharp(a.focus).resize(360,203).png().toBuffer(),left:x,top:y+27});
  for(const [j,w] of sizes.entries()){
   const file=root+'/acceptance/'+a.key+'-'+w+'.png',m=await sharp(file).metadata(),left=Math.round(w*(w===820?.40:.60));
   inputs.push({input:await sharp(file).extract({left,top:0,width:w-left,height:m.height}).resize(120,330,{fit:'contain',background:'#eee'}).png().toBuffer(),left:x+j*120,top:y+230});
  }
 }
 const file=folder+'/'+String(start/6+1).padStart(2,'0')+'.png';await sharp({create:{width:1080,height:1120,channels:3,background:'#ddd'}}).composite(inputs).png().toFile(file);sheets.push({file,items:part.map(a=>({key:a.key,sourceSha256:a.sourceSha256}))});
}
fs.writeFileSync(folder+'/index.json',JSON.stringify(sheets,null,2)+'\n');console.log({currentHashMatchedScenes:rows.length,sheets:sheets.length});
