import definition from '../../resources/styles/builtin/drafts/fox-states-v1/drafting-rig.json' with {type:'json'};
import {draftingArmPoint,draftingPaperPoint} from './fox-drafting-registration.ts';
import {draftingWritingArm} from './fox-drafting-motion.ts';
import type {RigPoint} from './fox-anatomy.ts';
import type {drawAnatomySkin} from './fox-anatomy-skin.ts';
import releaseDefinition from '../../resources/styles/builtin/drafts/fox-states-v1/drafting-release-rig.json' with {type:'json'};
import {draftingPencilPoint} from './fox-drafting-pencil.ts';
import {draftingRelease} from './fox-drafting-release.ts';
import {draftingNotebookRest} from './fox-drafting-notebook-rest.ts';
import {draftingSupportSkin} from './fox-drafting-support-skin.ts';
import {draftingWritingSkin} from './fox-drafting-writing-skin.ts';
import {drawAnatomySkin as canvasSkin} from './fox-anatomy-skin.ts';

/** Isolated registration study, deliberately not wired into the live portrait.
 * Overlap cuts need full-character silhouette/depth acceptance before promotion. */
export async function createDraftingStudy(url:string,releaseURL?:string){
 const image=new Image();image.src=url;await image.decode();
 if(image.width!==1536||image.height!==1024)throw Error('Unexpected drafting atlas dimensions');
 let release:HTMLImageElement|undefined;
 if(releaseURL){release=new Image();release.src=releaseURL;await release.decode();if(release.width!==1536||release.height!==1024)throw Error('Unexpected pencil-release atlas dimensions');}
 const cut=(mask:number[][],extra?:number[][],source=image)=>{
  const c=document.createElement('canvas');c.width=image.width;c.height=image.height;const ctx=c.getContext('2d')!;
  for(const polygon of [mask,...extra?[extra]:[]]){ctx.beginPath();polygon.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();ctx.clip();}
  ctx.drawImage(source,0,0);return c;
 };
 const paper=cut(definition.masks.paper),support=cut(definition.masks.support);
 const upper=cut(definition.masks.writing,[[0,380],[440,380],[440,700],[340,840],[0,840]]);
 const fore=cut(definition.masks.writing,[[0,730],[390,730],[440,520],[800,520],[800,1000],[0,1000]],release??image);
 const pencil=release?cut(releaseDefinition.pencilMask,undefined,release):undefined;
 const emptyArm=release?cut(definition.masks.writing,undefined,release):undefined;
 let disposed=false;
 return {
  draw(ctx:CanvasRenderingContext2D,size:number,time:number,reduced=false,pauseWeight=0,drawSkin?:typeof drawAnatomySkin,releaseTime?:number,notebookRestTime?:number,tipTarget?:RigPoint){
   if(disposed)throw Error('Drafting study disposed');
   const motion=draftingWritingArm(time,reduced,pauseWeight,tipTarget);
   const part=(image:HTMLCanvasElement,vertex:(p:RigPoint)=>RigPoint)=>{
    if(drawSkin){drawSkin(ctx,{canvas:image,x:0,y:0},[1536,1024],[size,size],p=>vertex([p[0]*1536,p[1]*1024]),1,1);return;}
    const a=vertex([0,0]),x=vertex([1,0]),y=vertex([0,1]);ctx.save();
    ctx.transform((x[0]-a[0])*size,(x[1]-a[1])*size,(y[0]-a[0])*size,(y[1]-a[1])*size,a[0]*size,a[1]*size);
    ctx.drawImage(image,0,0);ctx.restore();
   };
   if(releaseTime!==undefined||notebookRestTime!==undefined){
    if(!pencil||!emptyArm)throw Error('Independent pencil and empty paw required for release');
    const rest=notebookRestTime===undefined?undefined:draftingNotebookRest(reduced?3000:notebookRestTime);
    const r=rest??draftingRelease(reduced?2500:releaseTime!);
    (drawSkin??canvasSkin)(ctx,{canvas:support,x:0,y:0},[1536,1024],[size,size],p=>draftingSupportSkin([p[0]*1536,p[1]*1024],r.support),48,48);
    part(paper,rest?rest.paper:p=>{const q=draftingPaperPoint(p),offset=(r as ReturnType<typeof draftingRelease>).paperOffset;return [q[0]+offset[0],q[1]+offset[1]];});
    part(pencil,p=>r.pencil(draftingPencilPoint(p)));
    (drawSkin??canvasSkin)(ctx,{canvas:emptyArm,x:0,y:0},[1536,1024],[size,size],p=>draftingWritingSkin([p[0]*1536,p[1]*1024],r.vertex),48,48);
    return {contact:r.attached,checking:false};
   }
   if(emptyArm&&pencil){
    // Keep the same textures, mesh and paint order before and after release.
    // A rigid cut arm -> continuous sleeve switch is visibly discontinuous
    // even when every bone has exactly the same bind-pose coordinates.
    (drawSkin??canvasSkin)(ctx,{canvas:support,x:0,y:0},[1536,1024],[size,size],p=>draftingArmPoint('support',[p[0]*1536,p[1]*1024]),48,48);
    part(paper,draftingPaperPoint);part(pencil,p=>motion.vertex(draftingPencilPoint(p),'forearm'));
    (drawSkin??canvasSkin)(ctx,{canvas:emptyArm,x:0,y:0},[1536,1024],[size,size],p=>draftingWritingSkin([p[0]*1536,p[1]*1024],(p,segment)=>motion.vertex(p,segment==='paw'?'forearm':segment)),48,48);
   }else{
    part(support,p=>draftingArmPoint('support',p));part(paper,draftingPaperPoint);
    part(upper,p=>motion.vertex(p,'upper'));part(fore,p=>motion.vertex(p,'forearm'));
   }
   return {contact:motion.contact,checking:motion.checking};
  },
  dispose(){if(disposed)return;disposed=true;for(const c of [paper,support,upper,fore,pencil,emptyArm])if(c)c.width=c.height=1;}
 };
}
