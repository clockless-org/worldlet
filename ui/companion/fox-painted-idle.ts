import {smooth} from './fox-skeleton.ts';
/** Fixed-view painted deformation. Keeps the original pixels outside eye patches. */
export type PaintedPose = {breath:number;look:number;sniff:number;earL:number;earR:number;tail:number;blink:number;lean?:number;shoulders?:number;nod?:number;pawL?:number;pawR?:number};
const bump=(x:number,c:number,w:number)=>Math.exp(-(((x-c)/w)**2));
export function paintedPose(milliseconds:number,reduced=false):PaintedPose {
 if(reduced)return {breath:0,look:0,sniff:0,earL:0,earR:0,tail:0,blink:0};
 const t=((milliseconds/1000)%12+12)%12;
 const blink=(at:number)=>smooth((t-at)/.065)*(1-smooth((t-at-.12)/.11));
 const look=smooth((t-3.2)/.7)*(1-smooth((t-6.2)/.9));
 return {breath:Math.sin(t*Math.PI/2),look,
  sniff:bump(t,5,.35)*Math.sin((t-5)*Math.PI*7),
  earL:bump(t,3.8,.28)*Math.sin((t-3.8)*14),
  earR:bump(t,4.02,.34)*Math.sin((t-4.02)*12),
  tail:Math.sin(t*Math.PI/6)*.6+Math.sin(t*Math.PI/3)*.15,
  blink:Math.max(blink(1.6),blink(7.8),blink(8.12))};
}
// Pose-independent vertex weights. The mesh is fixed, so the rig computes them
// once; only the pose terms below change per frame.
const WEIGHTS=11;
type Weights=Float64Array;
function vertexWeights(u:number,v:number,w:Weights,o:number){
 const feet=1-smooth((v-.87)/.075);
 // The complete face, jaw and ear roots share one rigid parent. Blend only
 // below the jaw, into the scarf/neck, not across the cheeks or forehead.
 w[o]=(1-smooth((v-.605)/.065))*smooth((u-.23)/.05);
 w[o+1]=bump(u,.60,.24)*bump(v,.73,.21)*feet;
 w[o+2]=smooth((u-.27)/.16)*feet;
 w[o+3]=bump(v,.69,.26);
 w[o+4]=bump(u,.545,.057)*bump(v,.889,.067);
 w[o+5]=bump(u,.676,.057)*bump(v,.889,.067);
 w[o+6]=bump(u,.51,.045)*bump(v,.382,.047)+bump(u,.695,.039)*bump(v,.346,.043);
 w[o+7]=bump(u,.635,.071)*bump(v,.419,.060);
 w[o+8]=bump(u,.36,.09)*smooth((.40-v)/.20);
 w[o+9]=bump(u,.716,.09)*smooth((.34-v)/.20);
 w[o+10]=(1-smooth((u-.32)/.10))*smooth((v-.52)/.09)*feet;
}
// Unrolled: this runs for every mesh vertex on every frame.
function deformVertex(u:number,v:number,p:PaintedPose,w:Weights,o:number,cos:number,sin:number,out:{[i:number]:number},i:number){
 const head=w[o],torso=w[o+1],body=w[o+2],left=w[o+4],right=w[o+5],eyes=w[o+6],nose=w[o+7],earL=w[o+8],earR=w[o+9],tail=w[o+10];
 let x=u+(u-.60)*p.breath*.009*torso;
 let y=v-p.breath*.003*torso;
 // Shift weight above the planted hind paws; shoulders lead and head follows.
 x+=(p.lean||0)*.019*(.96-v)*body;
 y-=(p.shoulders||0)*.012*w[o+3]*body;
 // Local forepaw flex, never sliding the whole seated character along the floor.
 const pawL=p.pawL||0,pawR=p.pawR||0;
 x+=pawL*.004*left;y-=pawL*.009*left;
 x+=pawR*.004*right;y-=pawR*.009*right;
 // Replace the body's position-dependent shear with a single rigid head
 // transform. Shoulder elevation moves the head without changing its height;
 // a look is rotation, not the old two-axis shear that stretched the face.
 const hx=.60+(u-.60)*cos-(v-.58)*sin+p.look*.006+(p.lean||0)*.008;
 const hy=.58+(u-.60)*sin+(v-.58)*cos-p.breath*.0015-(p.shoulders||0)*.009+(p.nod||0)*.010;
 x+=(hx-x)*head;y+=(hy-y)*head;
 x+=p.look*.003*eyes;
 x+=p.sniff*.0018*nose;y-=p.sniff*.0034*nose;
 x+=p.earL*.012*earL;y+=p.earL*(u-.36)*.028*earL;
 x+=p.earR*.012*earR;y+=p.earR*(u-.716)*.028*earR;
 x+=p.tail*(.89-v)*.017*tail;y+=p.tail*(u-.39)*.014*tail;
 out[i]=x;out[i+1]=y;
}
const headAngle=(p:PaintedPose)=>-p.look*.013;
export function paintedVertex(u:number,v:number,p:PaintedPose):[number,number] {
 const w=new Float64Array(WEIGHTS),out:[number,number]=[0,0],angle=headAngle(p);
 vertexWeights(u,v,w,0);deformVertex(u,v,p,w,0,Math.cos(angle),Math.sin(angle),out,0);
 return out;
}
export async function createPaintedIdle(canvas:HTMLCanvasElement,sources:string[],deform=paintedVertex) {
 const images=await Promise.all(sources.map(source=>new Promise<HTMLImageElement>((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(Error('Missing painted Fox image'));img.src=source;})));
 const gl=canvas.getContext('webgl',{alpha:true,premultipliedAlpha:false,antialias:true,preserveDrawingBuffer:true});
 if(!gl)throw Error('WebGL unavailable: painted idle preview requires WebGL');
 const shader=(type:number,source:string)=>{const s=gl.createShader(type)!;gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s)||'Shader error');return s;};
 const vertex=shader(gl.VERTEX_SHADER,`attribute vec2 position;attribute vec2 uv;varying vec2 tex;void main(){tex=uv;gl_Position=vec4(position.x*2.-1.,1.-position.y*2.,0.,1.);}`);
 const fragment=shader(gl.FRAGMENT_SHADER,`precision mediump float;varying vec2 tex;uniform sampler2D original;uniform sampler2D halfEye;uniform sampler2D closedEye;uniform float blink;
 float eye(vec2 center,vec2 radius){float d=length((tex-center)/radius);return 1.-smoothstep(.82,1.,d);}
 void main(){vec4 base=texture2D(original,tex);vec4 halfPose=texture2D(halfEye,tex);vec4 shut=texture2D(closedEye,tex);
 float mask=max(eye(vec2(.510,.382),vec2(.073,.086)),eye(vec2(.695,.346),vec2(.060,.073)));
 vec4 pose=blink<.5?mix(base,halfPose,blink*2.):mix(halfPose,shut,(blink-.5)*2.);
 gl_FragColor=vec4(mix(base.rgb,pose.rgb,mask),base.a);}`);
 const program=gl.createProgram()!;gl.attachShader(program,vertex);gl.attachShader(program,fragment);gl.linkProgram(program);
 if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program)||'Program error');gl.useProgram(program);
 const textures:WebGLTexture[]=[];
 for(let i=0;i<3;i++){
  const image=images[i];
  const texture=gl.createTexture()!;textures.push(texture);gl.activeTexture(gl.TEXTURE0+i);gl.bindTexture(gl.TEXTURE_2D,texture);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);
  gl.uniform1i(gl.getUniformLocation(program,['original','halfEye','closedEye'][i]),i);
 }
 const grid=64,uv=new Float32Array((grid+1)**2*2),positions=new Float32Array(uv.length),indices:number[]=[];
 for(let y=0;y<=grid;y++)for(let x=0;x<=grid;x++){const i=(y*(grid+1)+x)*2;uv[i]=x/grid;uv[i+1]=y/grid;if(x<grid&&y<grid){const n=i/2;indices.push(n,n+1,n+grid+1,n+1,n+grid+2,n+grid+1);}}
 // The default deformation's weights depend only on the fixed mesh: compute them once per rig.
 const weights=deform===paintedVertex?new Float64Array(uv.length/2*WEIGHTS):null;
 if(weights)for(let i=0,o=0;i<uv.length;i+=2,o+=WEIGHTS)vertexWeights(uv[i],uv[i+1],weights,o);
 const buffers:WebGLBuffer[]=[];
 const bind=(name:string,data:Float32Array,usage:number)=>{const buffer=gl.createBuffer()!;buffers.push(buffer);gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,data,usage);const attr=gl.getAttribLocation(program,name);gl.enableVertexAttribArray(attr);gl.vertexAttribPointer(attr,2,gl.FLOAT,false,0,0);return buffer;};
 bind('uv',uv,gl.STATIC_DRAW);const positionBuffer=bind('position',positions,gl.DYNAMIC_DRAW);
 const indexBuffer=gl.createBuffer()!;buffers.push(indexBuffer);gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,indexBuffer);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,new Uint16Array(indices),gl.STATIC_DRAW);
 const blinkLocation=gl.getUniformLocation(program,'blink');
 return {draw(ms:number,reduced=false,override?:Partial<PaintedPose>){
  const pose={...paintedPose(ms,reduced),...override};
  if(weights){const angle=headAngle(pose),cos=Math.cos(angle),sin=Math.sin(angle);for(let i=0,o=0;i<uv.length;i+=2,o+=WEIGHTS)deformVertex(uv[i],uv[i+1],pose,weights,o,cos,sin,positions,i);}
  else for(let i=0;i<uv.length;i+=2){const point=deform(uv[i],uv[i+1],pose);positions[i]=point[0];positions[i+1]=point[1];}
  gl.viewport(0,0,canvas.width,canvas.height);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);
  gl.bindBuffer(gl.ARRAY_BUFFER,positionBuffer);gl.bufferSubData(gl.ARRAY_BUFFER,0,positions);gl.uniform1f(blinkLocation,pose.blink);
  gl.drawElements(gl.TRIANGLES,indices.length,gl.UNSIGNED_SHORT,0);return pose;
 },dispose(){textures.forEach(t=>gl.deleteTexture(t));buffers.forEach(b=>gl.deleteBuffer(b));gl.deleteProgram(program);gl.deleteShader(vertex);gl.deleteShader(fragment);}};
}
