import {ACTIVE_THEME,validateSceneMotion,type SceneMotion} from '../themes/index.ts';
export type {SceneMotion} from '../themes/index.ts';
// Data-only portable world packages; never execute code from a world archive.
export type WorldPoint=[number,number];
export type WorldRect=[number,number,number,number];
export type WorldLayer={id:string;kind:'environment'|'architecture'|'atmosphere'|'foreground';src:string;lighting:'day'|'night';bounds:WorldRect;sourceSize?:[number,number];prompt?:string;parallax?:number;opacity?:number};
/** Full-canvas silhouettes traced separately against the day and night architecture. */
export type WorldOcclusion={id:string;depth:number;day:WorldPoint[];night:WorldPoint[]};
/** An authored Area close view keeps the same slot IDs and user assignments as the World. */
export type AreaView={
 src:string;
 slots:Array<{id:string;anchor:WorldPoint;maxSize:WorldPoint}>;
 devices?:Record<string,string>;
 /** Rectangles of the clean plate redrawn in front of objects, e.g. a desk's front edge. */
 occlusion?:WorldRect[];
 /** Small ambient details registered to fixtures in this plate, below live Applets. */
 ambience?:SceneMotion[];
};
export interface WorldPack {
 schemaVersion:1;
 id:string;
 title:string;
 version:string;
 style:{id:string;version:string};
 artStatus:'draft'|'approved';
 canvas:{width:number;height:number;coordinates:'normalized';origin:'top-left'};
 camera:{projection:'fixed-oblique';overview:WorldRect};
 layers:WorldLayer[];
 /** Decorative overview fields registered to the painting, below devices and live HUD. */
 ambience?:SceneMotion[];
 hudSafeAreas:WorldRect[];
 occlusion?:WorldOcclusion[];
 areas:Array<{
  id:string;title:string;legacyIds:string[];purpose:string;bounds:WorldRect;focus:WorldPoint;label:WorldPoint;
  slots:Array<{id:string;anchor:WorldPoint;maxSize:WorldPoint;surface:string;depth:number}>;
  closeView?:AreaView;
 }>;
 provenance:{mode:'image-api';model:string;size:string;quality:string;prompt:string;generatedAt:string;upscaled:false};
}

const unit=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=1;
const point=(v:unknown):v is WorldPoint=>Array.isArray(v)&&v.length===2&&v.every(unit);
const rect=(v:unknown):v is WorldRect=>Array.isArray(v)&&v.length===4&&v.every(unit)&&v[2]>0&&v[3]>0&&v[0]+v[2]<=1&&v[1]+v[3]<=1;
const inside=(p:WorldPoint,r:WorldRect)=>p[0]>=r[0]&&p[0]<=r[0]+r[2]&&p[1]>=r[1]&&p[1]<=r[1]+r[3];
export function worldPackPath(value:unknown):string {
 if(typeof value!=='string'||!value||value.startsWith('/')||value.includes('\\')||value.split('/').some(p=>!p||p==='.'||p==='..')||/[:?#\x00-\x1f]/.test(value))throw Error('Unsafe world package path');
 return value;
}
export function parseWorldPack(value:unknown):WorldPack {
 const p=value as WorldPack;
 const requireValid=(ok:unknown,message:string)=>{if(!ok)throw Error('Invalid world package: '+message);};
 requireValid(p&&p.schemaVersion===1,'schema version');
 requireValid(/^[a-z][a-z0-9-]*$/.test(p.id),'id');
 requireValid(typeof p.title==='string'&&p.title.length>0,'title');
 requireValid(/^\d+\.\d+\.\d+$/.test(p.version),'version');
 requireValid(ACTIVE_THEME.pack.style.id===p.style?.id&&ACTIVE_THEME.pack.style.version===p.style?.version,'registered style');
 requireValid(p.artStatus==='draft'||p.artStatus==='approved','art review status');
 requireValid(p.canvas?.coordinates==='normalized'&&p.canvas.origin==='top-left','coordinate system');
 requireValid(Number.isInteger(p.canvas.width)&&Number.isInteger(p.canvas.height)&&p.canvas.width>0&&p.canvas.height>0,'canvas dimensions');
 requireValid(p.camera?.projection==='fixed-oblique'&&rect(p.camera.overview),'camera');
 requireValid(Array.isArray(p.layers)&&p.layers.length>0,'layers');
 const ids=new Set<string>();
 const unique=(id:string)=>{requireValid(typeof id==='string'&&/^[a-z][a-z0-9-]*$/.test(id)&&!ids.has(id),'unique stable identifier: '+id);ids.add(id);};
 for(const layer of p.layers){unique(layer.id);requireValid(['environment','architecture','atmosphere','foreground'].includes(layer.kind)&&['day','night'].includes(layer.lighting)&&rect(layer.bounds),'layer');worldPackPath(layer.src);if(layer.prompt)worldPackPath(layer.prompt);
  requireValid(layer.parallax===undefined||Number.isFinite(layer.parallax)&&Math.abs(layer.parallax)<=.01,'bounded scenery parallax');
  requireValid(layer.opacity===undefined||unit(layer.opacity),'scenery opacity');
  requireValid(layer.sourceSize===undefined||Array.isArray(layer.sourceSize)&&layer.sourceSize.length===2&&layer.sourceSize.every(n=>Number.isInteger(n)&&n>0),'native layer dimensions');
  requireValid(layer.kind!=='architecture'||!layer.parallax,'architecture and Applet anchors remain stationary');
 }
 if(p.layers.some(l=>l.kind!=='environment'))for(const kind of ['environment','architecture',...(p.layers.some(l=>l.kind==='atmosphere')?['atmosphere']:[]),'foreground']){
  const pair=p.layers.filter(l=>l.kind===kind),day=pair.find(l=>l.lighting==='day'),night=pair.find(l=>l.lighting==='night');
  requireValid(pair.length===2&&day&&night,'complete scenery layer pair: '+kind);
  requireValid(JSON.stringify(day.bounds)===JSON.stringify(night.bounds)&&day.parallax===night.parallax&&day.opacity===night.opacity,'registered scenery layer pair: '+kind);
 }
 if(p.occlusion!==undefined){
  requireValid(Array.isArray(p.occlusion)&&p.occlusion.length<=16,'occlusion layers');
  for(const layer of p.occlusion){
   unique(layer.id);requireValid(unit(layer.depth),'occlusion depth');
   for(const polygon of [layer.day,layer.night]){
    requireValid(Array.isArray(polygon)&&polygon.length>=3&&polygon.length<=64&&polygon.every(point),'occlusion polygon');
    requireValid(Math.abs(polygon.reduce((area,a,i)=>{const b=polygon[(i+1)%polygon.length];return area+a[0]*b[1]-b[0]*a[1];},0))>.00001,'occlusion area');
   }
   requireValid(layer.day.length===layer.night.length,'registered occlusion vertices');
  }
 }
 if(p.ambience!==undefined)validateSceneMotion(p.ambience);
 requireValid(Array.isArray(p.hudSafeAreas)&&p.hudSafeAreas.every(rect),'HUD safe areas');
 requireValid(Array.isArray(p.areas)&&p.areas.length>0,'areas');
 for(const a of p.areas){
  unique(a.id);requireValid(typeof a.title==='string'&&a.title.length>0&&typeof a.purpose==='string','area copy');
  requireValid(Array.isArray(a.legacyIds)&&a.legacyIds.every(id=>typeof id==='string'),'legacy IDs');
  requireValid(rect(a.bounds)&&point(a.focus)&&inside(a.focus,a.bounds)&&point(a.label),'area coordinates');
  requireValid(Array.isArray(a.slots)&&a.slots.length>0,'slots');
  for(const s of a.slots){
   unique(s.id);requireValid(point(s.anchor)&&inside(s.anchor,a.bounds),'slot inside area: '+s.id);
   requireValid(point(s.maxSize)&&s.maxSize.every(n=>n>0)&&s.anchor[0]-s.maxSize[0]/2>=0&&s.anchor[0]+s.maxSize[0]/2<=1&&s.anchor[1]-s.maxSize[1]>=0,'slot clearance: '+s.id);
   requireValid(typeof s.surface==='string'&&s.surface.length>0&&unit(s.depth),'slot support/depth');
   const footprint:WorldRect=[s.anchor[0]-s.maxSize[0]/2,s.anchor[1]-s.maxSize[1],s.maxSize[0],s.maxSize[1]];
   requireValid(!p.hudSafeAreas.some(r=>footprint[0]<r[0]+r[2]&&footprint[0]+footprint[2]>r[0]&&footprint[1]<r[1]+r[3]&&footprint[1]+footprint[3]>r[1]),'slot clears HUD: '+s.id);
  }
  if(a.closeView){
   const v=a.closeView;worldPackPath(v.src);
   requireValid(Array.isArray(v.slots)&&v.slots.length===a.slots.length,'close view preserves slot capacity');
   const closeIds=new Set<string>();
   for(const s of v.slots){
    requireValid(a.slots.some(base=>base.id===s.id)&&!closeIds.has(s.id),'close view preserves unique slot IDs');closeIds.add(s.id);
    requireValid(point(s.anchor)&&point(s.maxSize)&&s.maxSize.every(n=>n>0)&&s.anchor[0]-s.maxSize[0]/2>=0&&s.anchor[0]+s.maxSize[0]/2<=1&&s.anchor[1]-s.maxSize[1]>=0,'close view footprint');
   }
   requireValid(!v.occlusion||Array.isArray(v.occlusion)&&v.occlusion.every(rect),'close view occlusion');
   requireValid(!v.devices||typeof v.devices==='object'&&!Array.isArray(v.devices),'close view devices');
   for(const file of Object.values(v.devices||{}))worldPackPath(file);
   if(v.ambience!==undefined)validateSceneMotion(v.ambience);
  }
 }
 requireValid(p.provenance?.mode==='image-api'&&p.provenance.upscaled===false,'generation provenance');worldPackPath(p.provenance.prompt);
 return p;
}
