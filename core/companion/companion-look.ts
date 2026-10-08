/** The companion's look: which colors it wears on the same rig and performances.
 * A look recolors the painted part textures (fur and scarf) and never changes the
 * skeleton or the 32 performances, so every look plays every action. Looks are
 * species-agnostic: the base painting is a fox today, the look only names colors. */
export interface CompanionLook {preset:string;fur:string|null;scarf:string|null}

export const COMPANION_LOOK_PRESETS:readonly {id:string;title:string;fur:string|null;scarf:string|null}[]=[
 {id:'classic',title:'Classic',fur:null,scarf:null},
 {id:'snow',title:'Snow',fur:'#eeeae4',scarf:'#a33a3a'},
 {id:'midnight',title:'Midnight',fur:'#3b4160',scarf:'#d9b04a'},
 {id:'frost',title:'Frost',fur:'#8fb3d9',scarf:'#2f4f7f'},
 {id:'blossom',title:'Blossom',fur:'#f2a6bf',scarf:'#7a5fb0'},
 {id:'sand',title:'Sand',fur:'#e8c27a',scarf:'#3f7ab0'},
 {id:'mint',title:'Mint',fur:'#7fcbb0',scarf:'#e07a4a'},
];
export const COMPANION_SCARF_COLORS=['#5d6b3f','#a33a3a','#d9b04a','#2f4f7f','#7a5fb0','#e07a4a','#f4f1ea'] as const;
export const CLASSIC_LOOK:CompanionLook={preset:'classic',fur:null,scarf:null};

const HEX=/^#[0-9a-f]{6}$/;
const color=(value:unknown)=>typeof value==='string'&&HEX.test(value.toLowerCase())?value.toLowerCase():null;

/** A stored or received look, or the classic look when it is missing or malformed. */
export function normalizeCompanionLook(value:unknown):CompanionLook {
 if(!value||typeof value!=='object')return CLASSIC_LOOK;
 const row=value as Record<string,unknown>,preset=COMPANION_LOOK_PRESETS.find(p=>p.id===row.preset);
 const fur=row.fur===undefined?preset?.fur??null:color(row.fur),scarf=row.scarf===undefined?preset?.scarf??null:color(row.scarf);
 if(!fur&&!scarf)return CLASSIC_LOOK;
 const match=COMPANION_LOOK_PRESETS.find(p=>p.fur===fur&&p.scarf===scarf);
 return {preset:match?.id??'custom',fur,scarf};
}

/** Reads the tool form: a preset id and/or `fur=#rrggbb` and `scarf=#rrggbb`, e.g.
 * "snow", "fur=#334455 scarf=#aa2233" or "midnight scarf=#a33a3a". Throws on anything else. */
export function parseCompanionLook(text:string):CompanionLook {
 const tokens=text.trim().toLowerCase().split(/[\s,;]+/).filter(Boolean);
 if(!tokens.length||tokens.length>3)throw Error('Describe the look as a preset and/or fur=#rrggbb scarf=#rrggbb.');
 let fur:string|null|undefined,scarf:string|null|undefined,preset:typeof COMPANION_LOOK_PRESETS[number]|undefined;
 for(const token of tokens){
  const [key,value]=token.split(/[=:]/);
  if(value===undefined){
   const found=COMPANION_LOOK_PRESETS.find(p=>p.id===key);
   if(!found||preset)throw Error('Unknown look: '+key+'. Presets: '+COMPANION_LOOK_PRESETS.map(p=>p.id).join(', ')+'.');
   preset=found;continue;
  }
  const hex=value==='default'?null:color(value);
  if(hex===null&&value!=='default')throw Error('Colors are #rrggbb.');
  if(key==='fur')fur=hex;else if(key==='scarf')scarf=hex;else throw Error('Only fur and scarf colors can change.');
 }
 return normalizeCompanionLook({preset:'custom',fur:fur===undefined?preset?.fur??null:fur,scarf:scarf===undefined?preset?.scarf??null:scarf});
}

export const companionLookIsClassic=(look:CompanionLook)=>!look.fur&&!look.scarf;
export const companionLookKey=(look:CompanionLook)=>(look.fur??'-')+'/'+(look.scarf??'-');

// The painted reference colors the recolor maps from (HSV: degrees, 0-1, 0-1),
// measured on the approved painting's fur and sage scarf.
const FUR={h:20,s:.70,v:.86},SCARF={h:55,s:.40,v:.45};

function hsv(hex:string){
 const n=parseInt(hex.slice(1),16),r=(n>>16&255)/255,g=(n>>8&255)/255,b=(n&255)/255;
 return toHsv(r,g,b);
}
function toHsv(r:number,g:number,b:number){
 const max=Math.max(r,g,b),min=Math.min(r,g,b),d=max-min;
 let h=0;
 if(d>0)h=max===r?((g-b)/d+6)%6:max===g?(b-r)/d+2:(r-g)/d+4;
 return {h:h*60,s:max>0?d/max:0,v:max};
}
function fromHsv(h:number,s:number,v:number,out:number[]){
 const c=v*s,hp=((h%360)+360)%360/60,x=c*(1-Math.abs(hp%2-1)),m=v-c,i=Math.floor(hp);
 const [r,g,b]=i===0?[c,x,0]:i===1?[x,c,0]:i===2?[0,c,x]:i===3?[0,x,c]:i===4?[x,0,c]:[c,0,x];
 out[0]=r+m;out[1]=g+m;out[2]=b+m;
}
const step=(e0:number,e1:number,x:number)=>{const t=Math.min(1,Math.max(0,(x-e0)/(e1-e0)));return t*t*(3-2*t);};
const near=(h:number,center:number,width:number,soft:number)=>1-step(width,width+soft,Math.abs(((h-center+540)%360)-180));

/** Recolors straight-alpha RGBA pixels in place. Fur is the orange family, the scarf
 * the sage family; cream, white, eyes and outlines keep their paint. `face` keeps the
 * dark eye, nose and brow paint on head layers. */
export function recolorCompanionPixels(data:Uint8ClampedArray|Uint8Array,look:CompanionLook,{face=false}:{face?:boolean}={}){
 if(companionLookIsClassic(look))return data;
 const targets=[[look.fur,FUR],[look.scarf,SCARF]].filter(([t])=>t).map(([t,base])=>({to:hsv(t as string),base:base as typeof FUR,fur:base===FUR}));
 const mixed=[0,0,0];
 for(let i=0;i<data.length;i+=4){
  if(data[i+3]===0)continue;
  const r=data[i]/255,g=data[i+1]/255,b=data[i+2]/255,{h,s,v}=toHsv(r,g,b);
  const furWeight=near(h,20,24,12)*step(.22,.40,s)*(face?step(.42,.6,v):1);
  let R=r,G=g,B=b;
  for(const {to,base,fur} of targets){
   const w=fur?furWeight:near(h,62,22,14)*step(.10,.22,s)*(1-furWeight);
   if(w<=0)continue;
   const s2=Math.min(1,s*to.s/base.s),v2=to.v>=base.v?v+(1-v)*(to.v-base.v)/(1-base.v):v*to.v/base.v;
   fromHsv(h+(to.h-base.h),s2,v2,mixed);
   R+=(mixed[0]-R)*w;G+=(mixed[1]-G)*w;B+=(mixed[2]-B)*w;
  }
  data[i]=Math.round(R*255);data[i+1]=Math.round(G*255);data[i+2]=Math.round(B*255);
 }
 return data;
}
