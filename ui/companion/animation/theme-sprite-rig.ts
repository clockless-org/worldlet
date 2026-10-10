export type PoseRig={kind?:undefined;perches?:Record<string,string>;image:string;frames:number[][];feet?:number[][];scale?:number;performances:Record<string,number>};
export type ThemeSpriteRig=PoseRig;

/** A theme owns its anatomy and acting. It never borrows Fox's bones or task decisions. */
export async function loadThemeSpriteRig(rig:ThemeSpriteRig){
 const image=new Image();image.src=rig.image;await image.decode();
 const perches:Record<string,HTMLImageElement>={};
 for(const [place,src] of Object.entries(rig.perches||{})){const perch=new Image();perch.src=src;await perch.decode();perches[place]=perch;}
 const world=document.querySelector('#notionWorld');
 return {draw(ctx:CanvasRenderingContext2D,state:string,elapsed:number,now:number,reduced:boolean){
  const aliases:Record<string,string>={talking:'explaining',writing:'drafting',happy:'delighted',waving:'greeting',preparing:'thinking',transcribing:'listening',concerned:'blocked'};
  const index=rig.performances[aliases[state]||state]??0,[x,y,w,h]=rig.frames[index]||rig.frames[0];
  const t=reduced?0:now/1000,breath=reduced?0:Math.sin(t*2)*.008;
  ctx.clearRect(0,0,ctx.canvas.width,ctx.canvas.height);
  const depth=world?.getAttribute('data-depth'),perch=perches[depth==='object'?'reading':depth==='building'?'room':'overview'];
  if(perch)ctx.drawImage(perch,105,247,110,110*perch.height/perch.width);
  ctx.save();ctx.translate(160,perch?295:314);ctx.scale(1,1+breath);
  const scale=rig.scale??Math.min(304/443,300/450),foot=rig.feet?.[index]||[.5,1];ctx.drawImage(image,x,y,w,h,-w*scale*foot[0],-h*scale*foot[1],w*scale,h*scale);ctx.restore();
  return {sheet:'theme-rig',frame:index,key:'theme-rig:'+state+':'+index+':'+(reduced?0:Math.floor(now/100))};
 },dispose(){}};
}
