import {FOX_ANATOMY,anatomyMatrices,anatomyOwner,transform,tailVertex,anatomyArmVertex} from './fox-anatomy.ts';
import type {AnatomyPose,RigMatrix,RigPoint} from './fox-anatomy.ts';
import type {ReadingPresentation} from './fox-anatomy-transition.ts';
import {drawAnatomySkin} from './fox-anatomy-skin.ts';
import {createAnatomyGPUSkin} from './fox-anatomy-gpu-skin.ts';
import {registerAnatomyArt} from './fox-anatomy-art.ts';
import {createReadingStudy} from './fox-reading-study.ts';
import {createReadingLeftGripArt} from './fox-reading-grip-study.ts';
import {createDraftingStudy} from './fox-drafting-study.ts';
import type {DraftingPresentation} from './fox-drafting-finish.ts';
import {createEarVertexSampler} from './fox-ear-skin.ts';
import {registerOpenPalm,turningPawVertex} from './fox-paw-turn.ts';
import {registerWorkingDevice,workingDevicePoint,workingLidPoint,placeWorkingPoint,type WorkingPlacement} from './fox-working-device.ts';
import {seatedBodyVertex,seatedTailVertex} from './fox-seated-support.ts';
import {registerSearchProp,searchPropVertex,searchDockVertex} from './fox-search-prop.ts';
import {createGraspStudy,type GraspControls} from './fox-grasp-study.ts';
import {createEyelidOcclusionStudy} from './fox-eyelid-occlusion-study.ts';

/** Original-pixel anatomical extraction, shared by the registration inspector
 * and development portrait adapter. New paw studies remain separately opt-in.
 * Missing overlap/underpainting is intentionally visible; do not disguise it by
 * scaling/stretching adjacent parts. */
export async function createAnatomyInspector(canvas:HTMLCanvasElement,source:string,eyes?:{half:string;closed:string;down?:string;underpaint?:string;sclera?:string},bodySource?:string,limbSource?:string,readingSource?:string,turnArmSource?:string,earRootSource?:string,neckSource?:string,openPalmSource?:string,workingSource?:string|{device:string;base:string},searchSource?:string,searchDockSource?:string,graspSource?:string,sidePalmSource?:string,draftingSource?:string|{held:string;release:string},readingGripSources?:{upper:string;forearm:string}){
 const load=(url:string)=>new Promise<HTMLImageElement>((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(Error('Fox source missing'));img.src=url;});
 const [image,...eyeImages]=await Promise.all([load(source),...(eyes?[load(eyes.half),load(eyes.closed),...(eyes.down?[load(eyes.down)]:[])]:[])]);
 const bodyImage=bodySource?await load(bodySource):undefined;
 const w=image.width,h=image.height,original=document.createElement('canvas');original.width=w;original.height=h;
 const registered=bodyImage&&limbSource?registerAnatomyArt(bodyImage,await load(limbSource),w,h):undefined;
 const openPalm=registered&&openPalmSource?registerOpenPalm(await load(openPalmSource),registered.distal.get('R')!,w,h,sidePalmSource?await load(sidePalmSource):undefined):undefined;
 const grasp=registered&&graspSource?await createGraspStudy(graspSource,{texture:registered.distal.get('R')!,size:[w,h]}):undefined;
 const workstation=workingSource?registerWorkingDevice(await load(typeof workingSource==='string'?workingSource:workingSource.device),typeof workingSource==='object'?await load(workingSource.base):undefined):undefined;
 const magnifier=searchSource?registerSearchProp(await load(searchSource)):undefined;
 const searchDock=searchDockSource?registerSearchProp(await load(searchDockSource)):undefined;
 const reading=readingSource?await createReadingStudy(readingSource,turnArmSource):undefined;
 const readingGrip=readingGripSources?await createReadingLeftGripArt(readingGripSources):undefined;
 const drafting=draftingSource?await createDraftingStudy(typeof draftingSource==='string'?draftingSource:draftingSource.held,typeof draftingSource==='string'?undefined:draftingSource.release):undefined;
 const originalContext=original.getContext('2d',{willReadFrequently:true})!;originalContext.drawImage(image,0,0);
 const pixels=originalContext.getImageData(0,0,w,h),owners=new Uint8Array(w*h);
 let eyeOcclusion:ReturnType<typeof createEyelidOcclusionStudy>|undefined;
 if(eyes?.underpaint){
  const read=(img:HTMLImageElement)=>{const c=document.createElement('canvas');c.width=w;c.height=h;const context=c.getContext('2d')!;context.drawImage(img,0,0,w,h);const data=context.getImageData(0,0,w,h);c.width=c.height=1;return data;};
  eyeOcclusion=createEyelidOcclusionStudy(pixels,read(await load(eyes.underpaint)),read(eyeImages[1]),eyes.sclera?read(await load(eyes.sclera)):undefined);
 }
 const bounds=FOX_ANATOMY.parts.map(()=>({x:w,y:h,right:0,bottom:0,count:0}));
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const offset=y*w+x;if(!pixels.data[offset*4+3])continue;
  const owner=anatomyOwner((x+.5)/w,(y+.5)/h);owners[offset]=owner;
  const b=bounds[owner];b.x=Math.min(b.x,x);b.y=Math.min(b.y,y);b.right=Math.max(b.right,x+1);b.bottom=Math.max(b.bottom,y+1);b.count++;
 }
 const layers=bounds.map((b,index)=>{
  const layer=document.createElement('canvas');layer.width=Math.max(1,b.right-b.x);layer.height=Math.max(1,b.bottom-b.y);
  const context=layer.getContext('2d')!,data=context.createImageData(layer.width,layer.height);
  for(let y=b.y;y<b.bottom;y++)for(let x=b.x;x<b.right;x++){
   const offset=y*w+x;if(owners[offset]!==index)continue;
   data.data.set(pixels.data.subarray(offset*4,offset*4+4),((y-b.y)*layer.width+x-b.x)*4);
  }
  context.putImageData(data,0,0);return {canvas:layer,...b,...FOX_ANATOMY.parts[index]};
 });
 // Only hidden ear-root pixels may come from this authored plate. The face,
 // brows, eyes and muzzle always retain their original layers.
 const earRoots=new Map<string,HTMLCanvasElement>();
 if(earRootSource){
  const backing=document.createElement('canvas');backing.width=w;backing.height=h;
  const bc=backing.getContext('2d')!;bc.drawImage(await load(earRootSource),0,0,w,h);const data=bc.getImageData(0,0,w,h);
  for(const id of ['earL','earR']){
   const index=FOX_ANATOMY.parts.findIndex(p=>p.id===id),layer=layers[index],c=document.createElement('canvas');c.width=layer.canvas.width;c.height=layer.canvas.height;
   const cc=c.getContext('2d')!,out=cc.createImageData(c.width,c.height);
   for(let y=layer.y;y<layer.bottom;y++)for(let x=layer.x;x<layer.right;x++)if(owners[y*w+x]===index){const i=(y*w+x)*4;out.data.set(data.data.subarray(i,i+4),((y-layer.y)*c.width+x-layer.x)*4);}
   cc.putImageData(out,0,0);earRoots.set(id,c);
  }backing.width=backing.height=1;
 }
 const ctx=canvas.getContext('2d')!,group=document.createElement('canvas');group.width=w;group.height=h;
 const earVertices={L:createEarVertexSampler('L'),R:createEarVertexSampler('R')};
 let neckBacking:HTMLCanvasElement|undefined;
 if(neckSource){
  neckBacking=document.createElement('canvas');neckBacking.width=w;neckBacking.height=h;
  const nc=neckBacking.getContext('2d')!,rect=FOX_ANATOMY.registeredArt.neck.crop;
  nc.save();nc.beginPath();nc.rect(rect[0]*w,rect[1]*h,rect[2]*w,rect[3]*h);nc.clip();nc.drawImage(await load(neckSource),0,0,w,h);nc.restore();
  const data=nc.getImageData(0,0,w,h),headIds=new Set(['head','jaw','mouth','nose','earL','earR','eyeL','eyeR','browL','browR']);
  for(let i=0;i<owners.length;i++)if(!pixels.data[i*4+3]||!headIds.has(FOX_ANATOMY.parts[owners[i]].id))data.data[i*4+3]=0;
  nc.putImageData(data,0,0);
 }
 const groupContext=group.getContext('2d')!;
 let gpuSkin:ReturnType<typeof createAnatomyGPUSkin>|undefined;
 const frameGroups=new Map<string,{canvas:HTMLCanvasElement;x:number;y:number;revision:string}>();
 let groupRasterizations=0;
 const depthMix=document.createElement('canvas');depthMix.width=canvas.width;depthMix.height=canvas.height;
 const arms=new Map<string,{canvas:HTMLCanvasElement;x:number;y:number;backing:HTMLCanvasElement;members:string[]}>();
 for(const side of ['L','R']){
  const members=['upperArm'+side,'forearm'+side,'paw'+side],parts=layers.filter(l=>members.includes(l.id));
  const x=Math.min(...parts.map(p=>p.x)),y=Math.min(...parts.map(p=>p.y)),right=Math.max(...parts.map(p=>p.right)),bottom=Math.max(...parts.map(p=>p.bottom));
  const skin=document.createElement('canvas');skin.width=right-x;skin.height=bottom-y;const sc=skin.getContext('2d')!;
  parts.forEach(p=>sc.drawImage(p.canvas,p.x-x,p.y-y));
  const backing=document.createElement('canvas');backing.width=skin.width;backing.height=skin.height;
  if(bodyImage){
   const bc=backing.getContext('2d')!;bc.drawImage(bodyImage,0,0,bodyImage.width,bodyImage.height,-x,-y,w,h);
   const data=bc.getImageData(0,0,backing.width,backing.height),mask=sc.getImageData(0,0,skin.width,skin.height);
   for(let i=0;i<data.data.length;i+=4)if(!mask.data[i+3])data.data[i+3]=0;
   bc.putImageData(data,0,0);
  }
  arms.set(side,{canvas:skin,x,y,backing,members});
 }
 // Only the already-authored eye pixels are replaced; the head, brows, muzzle,
 // silhouette and original alpha never come from a regenerated full-face image.
 const eyeLayers=new Map<string,{base:ImageData;half:ImageData;closed:ImageData;down?:ImageData;frame:ImageData;surface:HTMLCanvasElement;context:CanvasRenderingContext2D}>();
 for(const layer of layers.filter(l=>l.id==='eyeL'||l.id==='eyeR')){
  if(!eyes)continue;
  const variants=eyeImages.map(img=>{
   const full=document.createElement('canvas');full.width=w;full.height=h;const fc=full.getContext('2d')!;fc.drawImage(img,0,0,w,h);
   const variant=fc.getImageData(layer.x,layer.y,layer.canvas.width,layer.canvas.height),base=layer.canvas.getContext('2d')!.getImageData(0,0,layer.canvas.width,layer.canvas.height);
   const [cx,cy,rx,ry]=layer.ellipse!;
   for(let i=0;i<variant.data.length;i+=4){
    const x=(layer.x+(i/4)%layer.canvas.width+.5)/w,y=(layer.y+Math.floor((i/4)/layer.canvas.width)+.5)/h;
    const distance=Math.hypot((x-cx)/rx,(y-cy)/ry),t=Math.max(0,Math.min(1,(distance-.82)/.18)),mask=1-t*t*(3-2*t);
    for(let k=0;k<3;k++)variant.data[i+k]=Math.round(base.data[i+k]+(variant.data[i+k]-base.data[i+k])*mask);
    variant.data[i+3]=base.data[i+3];
   }
   full.width=full.height=1;return variant;
  });
  const surface=document.createElement('canvas');surface.width=layer.canvas.width;surface.height=layer.canvas.height;
  const context=surface.getContext('2d')!;
  eyeLayers.set(layer.id,{base:layer.canvas.getContext('2d')!.getImageData(0,0,layer.canvas.width,layer.canvas.height),half:variants[0],closed:variants[1],down:variants[2],frame:context.createImageData(surface.width,surface.height),surface,context});
 }
 return {
  skinStats:()=>({...gpuSkin?.stats()??{backend:'canvas',textures:0,meshes:0,uploads:0,draws:0,disposed:false},frameGroups:frameGroups.size,groupRasterizations}),
  layers:layers.map(({canvas:_,...metadata})=>metadata),
  draw: function draw(pose:AnatomyPose={},options:{workingCarry?:boolean;workingParked?:boolean;workingPlacement?:WorkingPlacement;readingGrip?:boolean;eyeOcclusion?:boolean;drafting?:DraftingPresentation;sidePalmR?:boolean;graspR?:GraspControls;searchDock?:boolean;magnifierPose?:AnatomyPose;magnifier?:number;workstation?:number;workingLidClosure?:number;pawTurnR?:number;gpuPassWeight?:number;gpuFrame?:boolean;gpu?:boolean;selected?:string;isolate?:boolean;anchors?:boolean;explode?:number;reference?:boolean;underpaint?:boolean;authored?:boolean;frontPaws?:readonly ('L'|'R')[];frontMix?:Readonly<Record<'L'|'R',number>>;reading?:Pick<ReadingPresentation,'time'>&Partial<ReadingPresentation>;gazeDown?:number;gazeX?:number}={}){
   if(options.eyeOcclusion&&!eyeOcclusion)throw Error('Independent eyelid underpaint is required');
   if((options.readingGrip||options.reading?.completeRight)&&!readingGrip)throw Error('Complete reading grip artwork is required');
   if(options.drafting){
    if(!drafting)throw Error('Drafting artwork is required');
    if(options.reading||options.workstation&&!options.workingParked||options.magnifier)throw Error('Drafting prop study cannot share another held prop');
   }
   if(options.reading&&[options.reading.time,options.reading.pageTime??options.reading.time].some(t=>!Number.isFinite(t)||t<0))throw Error('Invalid reading presentation clock');
   if(options.reading&&!reading)throw Error('Reading artwork is required');
   if(options.magnifier!==undefined&&(!Number.isFinite(options.magnifier)||options.magnifier<0||options.magnifier>1))throw Error('Invalid magnifier visibility');
   if(options.workstation!==undefined&&(!Number.isFinite(options.workstation)||options.workstation<0||options.workstation>1))throw Error('Invalid workstation visibility');
   if(options.workingPlacement)placeWorkingPoint([0,0],options.workingPlacement);
   if(options.workingLidClosure!==undefined){
    workingLidPoint([0,0],options.workingLidClosure);
    if(typeof workingSource!=='object')throw Error('Closing the device requires its complete base artwork');
   }
   if(options.pawTurnR!==undefined&&(!Number.isFinite(options.pawTurnR)||options.pawTurnR<0||options.pawTurnR>1))throw Error('Invalid paw turn');
   if(options.frontMix&&options.authored&&registered&&!options.isolate&&!options.explode&&!options.reference){
    const {frontMix,...rest}=options,L=Math.max(0,Math.min(1,frontMix.L)),R=Math.max(0,Math.min(1,frontMix.R));
    if(!Number.isFinite(L)||!Number.isFinite(R))throw Error('Invalid anatomical depth weight');
    if((L===0||L===1)&&(R===0||R===1)){draw(pose,{...rest,frontPaws:([...L===1?['L']:[],...R===1?['R']:[]]) as ('L'|'R')[]});return;}
    // Identical geometry, different occlusion. GPU passes accumulate weighted
    // premultiplied color without copying each intermediate frame to Canvas.
    if(options.gpuFrame&&!options.anchors&&(gpuSkin??=createAnatomyGPUSkin()).beginMix(ctx,canvas.width,canvas.height)){
     try{
      for(const l of [0,1])for(const r of [0,1]){
       const weight=(l?L:1-L)*(r?R:1-R);if(weight===0)continue;
       draw(pose,{...rest,gpuPassWeight:weight,frontPaws:([...l?['L']:[],...r?['R']:[]]) as ('L'|'R')[]});
      }
      if(gpuSkin!.endMix())return;
     }catch(error){gpuSkin!.abortMix();throw error;}
     draw(pose,{...options,gpuFrame:false,gpu:false});return;
    }
    // Canvas reference for missing GPU support, props and diagnostic overlays.
    if(depthMix.width!==canvas.width||depthMix.height!==canvas.height){depthMix.width=canvas.width;depthMix.height=canvas.height;}
    const mix=depthMix.getContext('2d')!;mix.clearRect(0,0,depthMix.width,depthMix.height);mix.save();mix.globalCompositeOperation='lighter';
    for(const l of [0,1])for(const r of [0,1]){
     const weight=(l?L:1-L)*(r?R:1-R);if(weight===0)continue;
     draw(pose,{...rest,frontPaws:([...l?['L']:[],...r?['R']:[]]) as ('L'|'R')[]});mix.globalAlpha=weight;mix.drawImage(canvas,0,0);
    }
    mix.restore();ctx.clearRect(0,0,canvas.width,canvas.height);ctx.drawImage(depthMix,0,0);return;
   }
   ctx.clearRect(0,0,canvas.width,canvas.height);
   if(options.reference){ctx.drawImage(original,0,0,canvas.width,canvas.height);return;}
   const matrices=anatomyMatrices(pose);
   const batch=Boolean(options.gpuFrame&&options.authored&&registered&&!options.isolate&&!options.explode&&(gpuSkin??=createAnatomyGPUSkin()).beginFrame(ctx,canvas.width,canvas.height));
   try{
   const drawSkin=options.gpu||batch?(gpuSkin??=createAnatomyGPUSkin()).draw:drawAnatomySkin;
   if(neckBacking&&options.underpaint!==false&&!options.isolate&&!options.explode){
    const head=pose.head,motion=Math.abs(head?.angle||0)/.6+Math.hypot(head?.x||0,head?.y||0)/.003,t=Math.min(1,motion);
    if(t){ctx.save();ctx.globalAlpha=t*t*(3-2*t);if(batch)drawSkin(ctx,{canvas:neckBacking,x:0,y:0},[w,h],[canvas.width,canvas.height],p=>transform(matrices.get('chest')!,p),1,1);else{ctx.scale(canvas.width,canvas.height);ctx.transform(...matrices.get('chest')!);ctx.drawImage(neckBacking,0,0,1,1);}ctx.restore();}
   }
   const authored=options.authored&&registered&&!options.isolate&&!options.explode;
   // The shared torso/tail attachment is needed even with neutral haunches:
   // secondary tail motion must never pull the ownership cut off the body.
   const supported=authored;
   const holdingBook=authored&&reading&&options.reading;
   const independentBook=Boolean(holdingBook&&holdingBook.restingOnly);
   const bookAboveParkedDevice=Boolean(holdingBook&&!independentBook&&options.workingParked);
   const drawReading=(stage:'back'|'front')=>{
    if(!holdingBook)return;
    // The registered shoulders, grips and book share the torso's rigid frame.
    // Applying it once preserves page contact while the seated body breathes.
    const m=matrices.get('chest')!;ctx.save();
    ctx.transform(m[0],m[1],m[2],m[3],m[4]*canvas.width,m[5]*canvas.height);
    try{reading!.draw(stage,ctx,[canvas.width,canvas.height],holdingBook.time,holdingBook.reduced,holdingBook.turning,holdingBook.pageTime,drawSkin,{
     offset:holdingBook.offset,closure:holdingBook.closure,placement:holdingBook.placement,release:holdingBook.release,restingOnly:holdingBook.restingOnly,rightHand:holdingBook.rightHand,
     leftGrip:options.readingGrip&&readingGrip?target=>readingGrip.draw(stage,ctx,[canvas.width,canvas.height],target,drawSkin):undefined,
     rightGrip:holdingBook.completeRight&&readingGrip?(target,partStage)=>readingGrip.draw(partStage,ctx,[canvas.width,canvas.height],target,drawSkin,'R'):undefined});
    }finally{ctx.restore();}
   };
   const writing=authored&&drafting&&options.drafting;
   const articulated=new Set(['L','R'].filter(side=>['upperArm','forearm','paw'].some(id=>{const p=pose[id+side];return p&&(p.angle||p.x||p.y);}))),drawnArms=new Set<string>();
   // Adjacent layers sharing a transform are assembled BEFORE rotation. Otherwise
   // antialiasing both sides of a cut creates a hairline through an intact face.
   let current:number[]|undefined;
   let paints:(()=>void)[]=[];
   const paint=(operation:()=>void)=>{if(batch)paints.push(operation);else operation();};
   if(!batch)groupContext.clearRect(0,0,w,h);
   let members:string[]=[],revisions:string[]=[],bounds=[w,h,0,0];
   const member=(id:string,texture:{canvas:HTMLCanvasElement;x:number;y:number},revision='')=>{members.push(id);revisions.push(revision);bounds=[Math.min(bounds[0],texture.x),Math.min(bounds[1],texture.y),Math.max(bounds[2],texture.x+texture.canvas.width),Math.max(bounds[3],texture.y+texture.canvas.height)];};
   const flush=()=>{
    if(!current)return;
    if(batch){
     const key=members.join('|'),revision=revisions.join('|');let cached=frameGroups.get(key);
     if(!cached){
      if(frameGroups.size>=16){const first=frameGroups.keys().next().value!,old=frameGroups.get(first)!;gpuSkin!.releaseTexture(old.canvas);old.canvas.width=old.canvas.height=1;frameGroups.delete(first);}
      const c=document.createElement('canvas');c.width=Math.max(1,bounds[2]-bounds[0]);c.height=Math.max(1,bounds[3]-bounds[1]);cached={canvas:c,x:bounds[0],y:bounds[1],revision:'uninitialized'};
     }
     if(cached.revision!==revision){groupRasterizations++;groupContext.clearRect(0,0,w,h);for(const operation of paints)operation();const cc=cached.canvas.getContext('2d')!;cc.clearRect(0,0,cached.canvas.width,cached.canvas.height);cc.drawImage(group,-cached.x,-cached.y);cached.revision=revision;gpuSkin!.invalidate(cached.canvas);}
     frameGroups.delete(key);frameGroups.set(key,cached);
     drawSkin(ctx,cached,[w,h],[canvas.width,canvas.height],p=>transform(current as unknown as RigMatrix,p),1,1);
    }else{ctx.save();ctx.scale(canvas.width,canvas.height);ctx.transform(current[0],current[1],current[2],current[3],current[4],current[5]);ctx.drawImage(group,0,0,1,1);ctx.restore();}
    if(!batch)groupContext.clearRect(0,0,w,h);current=undefined;members=[];revisions=[];paints=[];bounds=[w,h,0,0];
   };
   const drawRegisteredArm=(side:'L'|'R',segment:'proximal'|'distal'|'full'='proximal')=>{
    if(side==='R'&&segment==='distal'&&options.graspR){
     if(!grasp)throw Error('Grasp draft artwork is required');
     grasp.drawBound(ctx,options.graspR,matrices,drawSkin);return;
    }
    if(side==='R'&&segment==='distal'&&options.pawTurnR){
     if(!openPalm)throw Error('Open-palm artwork is required for wrist turns');
     const turn=options.pawTurnR;
     const edge=options.sidePalmR?openPalm.paintedEdge:openPalm.edge;
     if(!edge)throw Error('Painted paw-side artwork is required');
     drawSkin(ctx,edge,[w,h],[canvas.width,canvas.height],p=>turningPawVertex(p,matrices,turn,options.sidePalmR?'painted-edge':'edge'),16,64);
     drawSkin(ctx,turn<.5?openPalm.closed:openPalm.open,[w,h],[canvas.width,canvas.height],p=>turningPawVertex(p,matrices,turn),16,64);return;
    }
    const texture=(segment==='full'?registered!.arms:segment==='distal'?registered!.distal:registered!.proximal).get(side)!;
    drawSkin(ctx,texture,[w,h],[canvas.width,canvas.height],p=>anatomyArmVertex(side,p,matrices));
   };
   const drawWorkstation=(stage:'base'|'screen')=>{
    if(!options.workstation||!authored)return;
    if(!workstation)throw Error('Working device artwork is required');
    const project=(p:RigPoint)=>placeWorkingPoint(stage==='screen'&&options.workingLidClosure!==undefined?workingLidPoint(p,options.workingLidClosure):workingDevicePoint(p),options.workingPlacement);
    ctx.save();ctx.globalAlpha*=options.workstation;drawSkin(ctx,workstation[stage],workstation.size,[canvas.width,canvas.height],project,1,1);ctx.restore();
   };
   for(const layer of layers){
    if(!layer.count||options.isolate&&options.selected!==layer.id)continue;
    const m=matrices.get(layer.joint)!,joint=FOX_ANATOMY.joints.find(j=>j.id===layer.joint)!,amount=options.explode||0;
    const dx=(joint.pivot[0]-.6)*amount,dy=(joint.pivot[1]-.6)*amount;
    const side=layer.id.endsWith('L')?'L':'R',arm=arms.get(side)!;
    if(authored){
     if(layer.id==='head'){
      flush();drawWorkstation('base');if(holdingBook&&!bookAboveParkedDevice)drawReading('front');
      else if(writing){const m=matrices.get('chest')!;ctx.save();ctx.transform(m[0],m[1],m[2],m[3],m[4]*canvas.width,m[5]*canvas.height);drafting!.draw(ctx,canvas.width,writing.time,writing.reduced,writing.pauseWeight,options.gpu||batch?drawSkin:undefined,writing.releaseTime,writing.notebookRestTime,writing.tipTarget);ctx.restore();}
      if((!holdingBook||independentBook)&&!writing)for(const s of ['L','R'] as const)if(!options.frontPaws?.includes(s))drawRegisteredArm(s,'distal');
     }
     if(arm.members.includes(layer.id)){
      if(writing){drawnArms.add(side);continue;}
      if(holdingBook&&!independentBook){if(drawnArms.size===0){flush();drawReading('back');}drawnArms.add(side);continue;}
      // A paw crossing the face must not also move its shoulder in front of
      // the scarf. Keep the proximal attachment in one anatomical depth lane.
      if(!drawnArms.has(side)){flush();drawRegisteredArm(side);drawnArms.add(side);}continue;
     }
     const bodyTexture=registered!.bodyLayers.get(layer.id);
     if(bodyTexture){
      if(supported){
       if(layer.id==='pelvis'||layer.id==='chest'){
        flush();drawSkin(ctx,layer.id==='pelvis'?bodyTexture:registered!.supportBody,[w,h],[canvas.width,canvas.height],p=>seatedBodyVertex(p,matrices),32,48);
       }
       continue;
      }
      const next=[...m];if(!current||current.some((v,i)=>v!==next[i])){flush();current=next;}
      paint(()=>groupContext.drawImage(bodyTexture.canvas,bodyTexture.x,bodyTexture.y));if(batch)member('body:'+layer.id,bodyTexture);continue;
     }
    }
    if(articulated.has(side)&&arm.members.includes(layer.id)&&!amount){
     if(drawnArms.has(side))continue;
     flush();
     if(!options.isolate&&bodyImage&&options.underpaint!==false){
      const parent=matrices.get('chest')!;ctx.save();ctx.scale(canvas.width,canvas.height);ctx.transform(...parent);ctx.drawImage(arm.backing,arm.x/w,arm.y/h,arm.backing.width/w,arm.backing.height/h);ctx.restore();
     }
     drawSkin(ctx,options.isolate?layer:arm,[w,h],[canvas.width,canvas.height],p=>anatomyArmVertex(side,p,matrices));
     if(!options.isolate)drawnArms.add(side);continue;
    }
    if(layer.id==='tail'&&(supported||['tailMid','tailTip'].some(id=>matrices.get(id)!.some((value,i)=>value!==m[i])))){
     flush();ctx.save();ctx.translate(dx*canvas.width,dy*canvas.height);
     drawSkin(ctx,layer,[w,h],[canvas.width,canvas.height],p=>supported?seatedTailVertex(p,matrices):tailVertex(p,matrices),supported?32:24,supported?48:24);ctx.restore();continue;
    }
    if((layer.id==='earL'||layer.id==='earR')&&!options.explode&&m.some((v,i)=>v!==matrices.get('head')![i])){
     flush();drawSkin(ctx,layer,[w,h],[canvas.width,canvas.height],p=>earVertices[side](p,matrices),32,32);continue;
    }
    const next=[m[0],m[1],m[2],m[3],m[4]+m[0]*dx+m[2]*dy,m[5]+m[1]*dx+m[3]*dy];
    if(!current||current.some((v,i)=>v!==next[i])){flush();current=next;}
    if(layer.id==='head'&&options.underpaint!==false&&!options.isolate&&!options.explode)for(const id of ['earL','earR']){
     const backing=earRoots.get(id),ear=layers.find(l=>l.id===id)!,angle=Math.abs(pose[id]?.angle||0),weight=Math.min(1,angle/.6);
     if(backing&&weight){paint(()=>{groupContext.save();groupContext.globalAlpha=weight*weight*(3-2*weight);groupContext.drawImage(backing,ear.x,ear.y);groupContext.restore();});if(batch)member('backing:'+id,{canvas:backing,x:ear.x,y:ear.y},String(weight));}
    }
    const eye=eyeLayers.get(layer.id),closure=pose[layer.id==='eyeL'?'lidL':'lidR']?.closure??0;
    const gaze=Math.max(0,Math.min(1,options.gazeDown||0));
    const horizontal=Math.max(-1,Math.min(1,options.gazeX||0));
    const occlude=Boolean(options.eyeOcclusion);
    if(batch)member(layer.id,layer,eye?closure+':'+gaze+':'+horizontal+':'+occlude:'');
    if(eye&&Number.isFinite(closure)&&(closure>0||gaze>0||horizontal!==0)){
     // In the batched path an unchanged face group is already on the GPU.
     // Defer the pixel blend too, not just drawImage: otherwise a held gaze
     // still rewrites both eye buffers every frame despite the group cache.
     paint(()=>{
     const t=Math.max(0,Math.min(1,closure)),a=t<.5?eye.base.data:eye.half.data,b=t<.5?eye.half.data:eye.closed.data,blend=t<.5?t*2:(t-.5)*2;
     // Source-over crossfades would increase translucent source alpha. Mix RGB
     // explicitly and retain the original alpha exactly at every closure value.
     if(occlude){
      eyeOcclusion!(eye.frame,t,{x:layer.x,y:layer.y},gaze,horizontal);
      for(let i=3;i<eye.frame.data.length;i+=4)eye.frame.data[i]=eye.base.data[i];
     }else for(let i=0;i<a.length;i+=4){for(let k=0;k<3;k++){
      const base=a[i+k]+(t<.5&&eye.down?(eye.down.data[i+k]-a[i+k])*gaze:0);
      eye.frame.data[i+k]=Math.round(base+(b[i+k]-base)*blend);
     }eye.frame.data[i+3]=eye.base.data[i+3];}
     eye.context.putImageData(eye.frame,0,0);
     groupContext.drawImage(eye.surface,layer.x,layer.y);
     });
    }else paint(()=>groupContext.drawImage(layer.canvas,layer.x,layer.y));
   }
   flush();
   // The offering right paw stays behind the left chest/chin paw. A change
   // in face depth must not also reverse arm-to-arm occlusion. Never let the
   // caller's frontPaws array order change the anatomy.
   if(authored&&options.searchDock){
    if(!searchDock)throw Error('Search dock artwork is required');
    drawSkin(ctx,searchDock.texture,searchDock.size,[canvas.width,canvas.height],p=>searchDockVertex(p,searchDock.size),1,1);
   }
   if(authored&&options.magnifier){
    if(!magnifier)throw Error('Search prop artwork is required');
    const propMatrices=options.magnifierPose?anatomyMatrices(options.magnifierPose):matrices;
    ctx.save();ctx.globalAlpha*=options.magnifier;drawSkin(ctx,magnifier.texture,magnifier.size,[canvas.width,canvas.height],p=>searchPropVertex(p,propMatrices),1,1);ctx.restore();
   }
   if(authored&&(!holdingBook||independentBook)&&!writing)for(const s of ['R','L'] as const)if(options.frontPaws?.includes(s))drawRegisteredArm(s,'distal');
   drawWorkstation('screen');
   // A new held book is above the parked computer. Draw its front once, not
   // as a translucent duplicate; carried laptop hands still stay behind the
   // painted lid, hiding the distal atlas cut just as during lid closure.
   if(bookAboveParkedDevice)drawReading('front');
   // The closing paw presses from the far/right edge of the lid. Keep the
   // continuous arm behind it: promoting only the distal atlas exposes its
   // straight wrist/forearm split as a rectangular patch on the near surface.
   if(batch&&!gpuSkin!.endFrame(options.gpuPassWeight??1)){if(options.gpuPassWeight===undefined)draw(pose,{...options,gpuFrame:false,gpu:false});return;}
   if(options.anchors){
    ctx.save();ctx.strokeStyle='#56bce0';ctx.fillStyle='#f9d092';ctx.lineWidth=1;
    for(const joint of FOX_ANATOMY.joints){
     const p=transform(matrices.get(joint.id)!,joint.pivot as [number,number]);
     if(joint.parent){const parent=FOX_ANATOMY.joints.find(j=>j.id===joint.parent)!,q=transform(matrices.get(parent.id)!,parent.pivot as [number,number]);ctx.beginPath();ctx.moveTo(q[0]*canvas.width,q[1]*canvas.height);ctx.lineTo(p[0]*canvas.width,p[1]*canvas.height);ctx.stroke();}
     ctx.beginPath();ctx.arc(p[0]*canvas.width,p[1]*canvas.height,options.selected===joint.id?5:2.5,0,Math.PI*2);ctx.fill();
    }ctx.restore();
   }
   }catch(error){if(batch)gpuSkin!.abortFrame();throw error;}
  },
  dispose(){readingGrip?.dispose();drafting?.dispose();grasp?.dispose();gpuSkin?.dispose();frameGroups.forEach(g=>{g.canvas.width=g.canvas.height=1});frameGroups.clear();reading?.dispose();registered?.dispose();openPalm?.dispose();workstation?.dispose();magnifier?.dispose();searchDock?.dispose();if(neckBacking)neckBacking.width=neckBacking.height=1;earRoots.forEach(c=>{c.width=c.height=1});earRoots.clear();layers.forEach(layer=>{layer.canvas.width=layer.canvas.height=1});arms.forEach(a=>{a.canvas.width=a.canvas.height=a.backing.width=a.backing.height=1});arms.clear();eyeLayers.forEach(e=>{e.surface.width=e.surface.height=1});eyeLayers.clear();original.width=original.height=group.width=group.height=depthMix.width=depthMix.height=1;}
 };
}
