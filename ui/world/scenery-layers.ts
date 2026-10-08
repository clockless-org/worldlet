import {Container,Mesh,MeshGeometry,Shader,type Texture} from 'pixi.js';
import type {WorldLayer} from './world-pack.ts';
import {WORLD_WIDTH,WORLD_HEIGHT} from './world-design.ts';

// One quad samples both premultiplied textures. Fading two transparent sprites
// separately would make a solid wall translucent at dusk and reveal the lake.
export function sceneryPair(day:Texture,night:Texture,width:number,height:number){
 const geometry=new MeshGeometry({positions:new Float32Array([0,0,width,0,width,height,0,height]),uvs:new Float32Array([0,0,1,0,1,1,0,1]),indices:new Uint32Array([0,1,2,0,2,3])});
 const shader=Shader.from({gl:{name:'registered-scenery-pair',vertex:`
  in vec2 aPosition; in vec2 aUV; out vec2 vUV;
  uniform mat3 uProjectionMatrix; uniform mat3 uWorldTransformMatrix; uniform mat3 uTransformMatrix;
  void main(){vUV=aUV;gl_Position=vec4((uProjectionMatrix*uWorldTransformMatrix*uTransformMatrix*vec3(aPosition,1.0)).xy,0.0,1.0);}`,
 fragment:`in vec2 vUV; out vec4 finalColor;
  uniform sampler2D uDay; uniform sampler2D uNight; uniform float uNightAmount; uniform vec4 uColor;
  void main(){finalColor=mix(texture(uDay,vUV),texture(uNight,vUV),uNightAmount)*uColor;}`},
 resources:{uDay:day.source,uNight:night.source,lighting:{uNightAmount:{value:0,type:'f32'}}}});
 const mesh=new Mesh({geometry,shader});mesh.eventMode='none';
 return {mesh,setNight(amount:number){shader.resources.lighting.uniforms.uNightAmount=Math.max(0,Math.min(1,amount));},destroy(){mesh.destroy();shader.destroy();geometry.destroy();}};
}

type BuiltLayer=WorldLayer&{image:string};
/** Far landscape, fixed architecture and near parapet share registered coordinates.
 * Only decorative planes respond to the pointer; building floors and device hits never move. */
export async function createSceneryLayers(world:Container,specs:BuiltLayer[],image:(source:string)=>Promise<Texture>){
 const planes=[];
 for(const kind of ['environment','architecture','atmosphere','foreground']){
  const spec=specs.find(s=>s.kind===kind&&s.lighting==='day');if(!spec)continue;
  const moon=specs.find(s=>s.kind===kind&&s.lighting==='night')!;
  const day=await image(spec.image),night=await image(moon.image),[x,y,w,h]=spec.bounds;
  const pair=sceneryPair(day,night,w*WORLD_WIDTH,h*WORLD_HEIGHT),group=new Container();
  group.label='scenery:'+kind;group.eventMode='none';group.zIndex={environment:-10,architecture:10,atmosphere:40,foreground:3000}[kind];group.alpha=spec.opacity??1;
  group.position.set(x*WORLD_WIDTH,y*WORLD_HEIGHT);group.addChild(pair.mesh);world.addChild(group);
  // A slight overscan hides the moving planes' frame edges through the full pointer range.
  const overscan=1+2*Math.abs(spec.parallax||0);
  pair.mesh.scale.set(overscan);pair.mesh.position.set(-(overscan-1)*w*WORLD_WIDTH/2,-(overscan-1)*h*WORLD_HEIGHT/2);
  planes.push({kind,spec,pair,group,day,night,x:x*WORLD_WIDTH,y:y*WORLD_HEIGHT});
 }
 let x=0,y=0,last:number|undefined,active=false;
 return {
  architecture:planes.find(p=>p.kind==='architecture')!,
  update(night:number,time:number,enabled:boolean,pointer:[number,number]){
   const dt=last===undefined?0:Math.max(0,Math.min(.1,time-last));last=time;active=enabled;
   if(enabled){const amount=1-Math.exp(-dt*5);x+=(pointer[0]-x)*amount;y+=(pointer[1]-y)*amount;}
   for(const p of planes){p.pair.setNight(night);p.group.position.set(p.x+x*(p.spec.parallax||0)*WORLD_WIDTH,p.y+y*(p.spec.parallax||0)*WORLD_HEIGHT);}
  },
  get metrics(){return {active,offset:[x,y],layers:planes.map(p=>({kind:p.kind,parallax:p.spec.parallax||0,x:p.group.x,y:p.group.y}))};},
  destroy(){for(const p of planes){p.pair.destroy();p.group.destroy();}}
 };
}
