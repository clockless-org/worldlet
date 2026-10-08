// Deterministic sprite-sheet preparation: chroma matte, equal cells and ground registration.
// No generative retouching. Source sheets remain beside the output for reproducibility.
import sharp from 'sharp';
import path from 'node:path';
const root=path.resolve('resources/styles/builtin/assets/animations/home');
for(const key of process.argv.slice(2)){
 const input=path.join(root,key+'-source.png');
 const {data,info}=await sharp(input).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 for(let i=0;i<data.length;i+=4){const r=data[i],g=data[i+1],b=data[i+2];const spill=Math.min(r,b)-g;
  if(spill>35&&r>g*1.25&&b>g*1.25){const opacity=1-Math.min(1,(spill-35)/70);data[i+3]=Math.round(255*opacity);if(opacity>0){data[i]=Math.min(r,g+35);data[i+2]=Math.min(b,g+35);}}
  else data[i+3]=255;
 }
 const cw=Math.floor(info.width/3),ch=Math.floor(info.height/2),cells=[];let baseBottom=0,baseCenter=0;
 for(let n=0;n<6;n++){
  const left=n%3*cw,top=Math.floor(n/3)*ch;let bottom=0,sum=0,count=0;
  for(let y=Math.floor(ch*.75);y<ch;y++)for(let x=0;x<cw;x++)if(data[((top+y)*info.width+left+x)*4+3]>220){bottom=Math.max(bottom,y);sum+=x;count++;}
  const center=count?sum/count:cw/2;if(!n){baseBottom=bottom;baseCenter=center;}
  const dx=Math.round(baseCenter-center),dy=baseBottom-bottom;
  const raw=await sharp(data,{raw:{width:info.width,height:info.height,channels:4}}).extract({left,top,width:cw,height:ch}).png().toBuffer();
  const resized=await sharp(raw).resize(Math.round(cw*.92),Math.round(ch*.92)).toBuffer();
  const cell=await sharp({create:{width:cw,height:ch,channels:4,background:'#00000000'}}).composite([{input:resized,left:Math.round(cw*.04+dx*.92),top:Math.round(ch*.04+dy*.92)}]).png().toBuffer();cells.push({input:cell,left,top});
 }
 await sharp({create:{width:cw*3,height:ch*2,channels:4,background:'#00000000'}}).composite(cells).png().toFile(path.join(root,key+'.png'));
 console.log('Prepared',key,cw,ch);
}
