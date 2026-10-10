import {drawAnatomySkin} from './fox-anatomy-skin.ts';

type Mesh={uv:Float32Array;positions:Float32Array;uvBuffer:WebGLBuffer;positionBuffer:WebGLBuffer;indexBuffer:WebGLBuffer;count:number};
type Target={texture:WebGLTexture;buffer:WebGLFramebuffer};
type SkinTexture={texture:WebGLTexture;width:number;height:number;dirty:boolean};
/** GPU rasterization of the same registered skin vertices as the Canvas
 * reference. Immutable part textures and topology stay resident; only positions
 * change. Frame/depth transactions stay on GPU until the final composite;
 * props and contact-aware occlusion still need production integration. */
export function createAnatomyGPUSkin(surface=document.createElement('canvas')){
 const gl=surface.getContext('webgl',{alpha:true,premultipliedAlpha:true,antialias:true,preserveDrawingBuffer:true});
 const textures=new Map<HTMLCanvasElement,SkinTexture>(),meshes=new Map<string,Mesh>();
 let textureAllocations=0,textureUpdates=0;
 let disposed=false,lost=false,program:WebGLProgram|undefined,position=-1,uv=-1,draws=0,uploads=0,compositedPixels=0,frameCopies=0,mixPasses=0,bounds:WebGLUniformLocation|undefined,opacity:WebGLUniformLocation|undefined,flipY:WebGLUniformLocation|undefined;
 let frame:{ctx:CanvasRenderingContext2D;width:number;height:number}|undefined;
 let mix:{ctx:CanvasRenderingContext2D;width:number;height:number;weight:number}|undefined;
 let targets:{width:number;height:number;items:Target[]}|undefined;
 const shaders:WebGLShader[]=[];
 const onLost=(event:Event)=>{event.preventDefault();lost=true;};
 surface.addEventListener('webglcontextlost',onLost);
 function releaseTargets(){if(gl)targets?.items.forEach(t=>{gl.deleteFramebuffer(t.buffer);gl.deleteTexture(t.texture);});targets=undefined;}
 function release(){
  releaseTargets();
  if(gl){textures.forEach(t=>gl.deleteTexture(t.texture));meshes.forEach(m=>{gl.deleteBuffer(m.uvBuffer);gl.deleteBuffer(m.positionBuffer);gl.deleteBuffer(m.indexBuffer);});shaders.forEach(s=>gl.deleteShader(s));if(program)gl.deleteProgram(program);}
  textures.clear();meshes.clear();shaders.length=0;program=undefined;
 }
 if(gl)try{
  const compile=(type:number,source:string)=>{const s=gl.createShader(type)!;shaders.push(s);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error('Fox skin shader compilation failed');return s;};
  const vertex=compile(gl.VERTEX_SHADER,'attribute vec2 position;attribute vec2 uv;uniform vec4 bounds;varying vec2 tex;void main(){tex=uv;vec2 p=(position-bounds.xy)/bounds.zw;gl_Position=vec4(p.x*2.-1.,1.-p.y*2.,0.,1.);}');
  const fragment=compile(gl.FRAGMENT_SHADER,'precision highp float;varying vec2 tex;uniform sampler2D skin;uniform float opacity;uniform float flipY;void main(){gl_FragColor=texture2D(skin,vec2(tex.x,mix(tex.y,1.-tex.y,flipY)))*opacity;}');
  program=gl.createProgram()!;gl.attachShader(program,vertex);gl.attachShader(program,fragment);gl.linkProgram(program);
  if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error('Fox skin shader linking failed');
  gl.useProgram(program);gl.uniform1i(gl.getUniformLocation(program,'skin'),0);position=gl.getAttribLocation(program,'position');uv=gl.getAttribLocation(program,'uv');bounds=gl.getUniformLocation(program,'bounds');opacity=gl.getUniformLocation(program,'opacity');flipY=gl.getUniformLocation(program,'flipY');
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,true);gl.disable(gl.DEPTH_TEST);gl.disable(gl.BLEND);
 }catch{release();lost=true;}
 const usable=()=>Boolean(gl&&program&&!lost&&!gl.isContextLost()&&!disposed);
 function meshFor(columns:number,rows:number){
  const key=columns+'x'+rows;let mesh=meshes.get(key);
  if(!mesh){
   const coordinates=new Float32Array((columns+1)*(rows+1)*2),indices:number[]=[];
   for(let y=0;y<=rows;y++)for(let x=0;x<=columns;x++){
    const n=y*(columns+1)+x;coordinates[n*2]=x/columns;coordinates[n*2+1]=y/rows;
    if(x<columns&&y<rows)indices.push(n,n+1,n+columns+2,n,n+columns+2,n+columns+1);
   }
   mesh={uv:coordinates,positions:new Float32Array(coordinates.length),uvBuffer:gl!.createBuffer()!,positionBuffer:gl!.createBuffer()!,indexBuffer:gl!.createBuffer()!,count:indices.length};
   gl!.bindBuffer(gl!.ARRAY_BUFFER,mesh.uvBuffer);gl!.bufferData(gl!.ARRAY_BUFFER,mesh.uv,gl!.STATIC_DRAW);
   gl!.bindBuffer(gl!.ARRAY_BUFFER,mesh.positionBuffer);gl!.bufferData(gl!.ARRAY_BUFFER,mesh.positions.byteLength,gl!.DYNAMIC_DRAW);
   gl!.bindBuffer(gl!.ELEMENT_ARRAY_BUFFER,mesh.indexBuffer);gl!.bufferData(gl!.ELEMENT_ARRAY_BUFFER,new Uint16Array(indices),gl!.STATIC_DRAW);meshes.set(key,mesh);
  }
  return mesh;
 }
 function bindMesh(mesh:Mesh){
  gl!.bindBuffer(gl!.ARRAY_BUFFER,mesh.uvBuffer);gl!.enableVertexAttribArray(uv);gl!.vertexAttribPointer(uv,2,gl!.FLOAT,false,0,0);
  gl!.bindBuffer(gl!.ARRAY_BUFFER,mesh.positionBuffer);gl!.bufferSubData(gl!.ARRAY_BUFFER,0,mesh.positions);gl!.enableVertexAttribArray(position);gl!.vertexAttribPointer(position,2,gl!.FLOAT,false,0,0);
  gl!.bindBuffer(gl!.ELEMENT_ARRAY_BUFFER,mesh.indexBuffer);
 }
 function ensureTargets(width:number,height:number){
  if(targets?.width===width&&targets.height===height)return;
  releaseTargets();targets={width,height,items:[]};gl!.activeTexture(gl!.TEXTURE0);
  for(let i=0;i<2;i++){
   const texture=gl!.createTexture()!,buffer=gl!.createFramebuffer()!;targets.items.push({texture,buffer});
   gl!.bindTexture(gl!.TEXTURE_2D,texture);gl!.texParameteri(gl!.TEXTURE_2D,gl!.TEXTURE_MIN_FILTER,gl!.LINEAR);gl!.texParameteri(gl!.TEXTURE_2D,gl!.TEXTURE_MAG_FILTER,gl!.LINEAR);
   gl!.texParameteri(gl!.TEXTURE_2D,gl!.TEXTURE_WRAP_S,gl!.CLAMP_TO_EDGE);gl!.texParameteri(gl!.TEXTURE_2D,gl!.TEXTURE_WRAP_T,gl!.CLAMP_TO_EDGE);
   gl!.texImage2D(gl!.TEXTURE_2D,0,gl!.RGBA,width,height,0,gl!.RGBA,gl!.UNSIGNED_BYTE,null);
   gl!.bindFramebuffer(gl!.FRAMEBUFFER,buffer);gl!.framebufferTexture2D(gl!.FRAMEBUFFER,gl!.COLOR_ATTACHMENT0,gl!.TEXTURE_2D,texture,0);
   if(gl!.checkFramebufferStatus(gl!.FRAMEBUFFER)!==gl!.FRAMEBUFFER_COMPLETE)throw Error('Fox GPU blend target unavailable');
  }
 }
 function blit(texture:WebGLTexture,weight:number,additive:boolean){
  const mesh=meshFor(1,1);mesh.positions.set([0,0,1,0,0,1,1,1]);
  gl!.useProgram(program!);gl!.uniform4f(bounds!,0,0,1,1);gl!.uniform1f(opacity!,weight);gl!.uniform1f(flipY!,1);gl!.activeTexture(gl!.TEXTURE0);gl!.bindTexture(gl!.TEXTURE_2D,texture);
  if(additive){gl!.enable(gl!.BLEND);gl!.blendFunc(gl!.ONE,gl!.ONE);}else gl!.disable(gl!.BLEND);
  bindMesh(mesh);gl!.drawElements(gl!.TRIANGLES,mesh.count,gl!.UNSIGNED_SHORT,0);
 }
 function present(ctx:CanvasRenderingContext2D,width:number,height:number){
  ctx.save();ctx.resetTransform();ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';ctx.drawImage(surface,0,0,width,height);ctx.restore();compositedPixels+=width*height;frameCopies++;
 }
 const draw:typeof drawAnatomySkin=(ctx,layer,sourceSize,targetSize,vertex,columns=16,rows=32)=>{
  if(disposed)throw Error('Fox skin renderer is disposed');
  if(!Number.isInteger(columns)||!Number.isInteger(rows)||columns<1||rows<1||(columns+1)*(rows+1)>65536)throw Error('Invalid Fox skin grid');
  if(sourceSize.some(v=>!Number.isFinite(v)||v<=0)||targetSize.some(v=>!Number.isInteger(v)||v<=0))throw Error('Invalid Fox skin dimensions');
  if(frame&&(frame.ctx!==ctx||frame.width!==targetSize[0]||frame.height!==targetSize[1]))throw Error('Mismatched Fox GPU frame target');
  if(!usable()){if(!frame&&!mix)drawAnatomySkin(ctx,layer,sourceSize,targetSize,vertex,columns,rows);return;}
  if(mix&&!frame)throw Error('Mixed Fox pass must begin a frame');
  const width=targetSize[0],height=targetSize[1],mesh=meshFor(columns,rows);
  gl!.activeTexture(gl!.TEXTURE0);let texture=textures.get(layer.canvas);
  if(!texture){
   texture={texture:gl!.createTexture()!,width:layer.canvas.width,height:layer.canvas.height,dirty:false};textureAllocations++;gl!.bindTexture(gl!.TEXTURE_2D,texture.texture);
   gl!.texParameteri(gl!.TEXTURE_2D,gl!.TEXTURE_MIN_FILTER,gl!.LINEAR);gl!.texParameteri(gl!.TEXTURE_2D,gl!.TEXTURE_MAG_FILTER,gl!.LINEAR);
   gl!.texParameteri(gl!.TEXTURE_2D,gl!.TEXTURE_WRAP_S,gl!.CLAMP_TO_EDGE);gl!.texParameteri(gl!.TEXTURE_2D,gl!.TEXTURE_WRAP_T,gl!.CLAMP_TO_EDGE);
   gl!.texImage2D(gl!.TEXTURE_2D,0,gl!.RGBA,gl!.RGBA,gl!.UNSIGNED_BYTE,layer.canvas);textures.set(layer.canvas,texture);uploads++;
  }else{
   gl!.bindTexture(gl!.TEXTURE_2D,texture.texture);
   if(texture.dirty||texture.width!==layer.canvas.width||texture.height!==layer.canvas.height){
    // Animated eyes/ear roots change pixels, not texture ownership. Keep their
    // allocation resident; eviction is a separate explicit release operation.
    if(texture.width===layer.canvas.width&&texture.height===layer.canvas.height){
     gl!.texSubImage2D(gl!.TEXTURE_2D,0,0,0,gl!.RGBA,gl!.UNSIGNED_BYTE,layer.canvas);textureUpdates++;
    }else{
     gl!.texImage2D(gl!.TEXTURE_2D,0,gl!.RGBA,gl!.RGBA,gl!.UNSIGNED_BYTE,layer.canvas);textureAllocations++;
    }
    texture.width=layer.canvas.width;texture.height=layer.canvas.height;texture.dirty=false;uploads++;
   }
  }
  let left=Infinity,top=Infinity,right=-Infinity,bottom=-Infinity;
  const matrix=frame?ctx.getTransform():undefined;
  for(let i=0;i<mesh.uv.length;i+=2){
   let p=vertex([(layer.x+mesh.uv[i]*layer.canvas.width)/sourceSize[0],(layer.y+mesh.uv[i+1]*layer.canvas.height)/sourceSize[1]]);
   if(matrix)p=[(matrix.a*p[0]*width+matrix.c*p[1]*height+matrix.e)/width,(matrix.b*p[0]*width+matrix.d*p[1]*height+matrix.f)/height];
   if(!p.every(Number.isFinite))throw Error('Non-finite Fox skin vertex');mesh.positions[i]=p[0];mesh.positions[i+1]=p[1];
   left=Math.min(left,p[0]*width);right=Math.max(right,p[0]*width);top=Math.min(top,p[1]*height);bottom=Math.max(bottom,p[1]*height);
  }
  // Composite only the moving part's tile, not a full transparent Fox-sized
  // surface per limb. Small allocation buckets avoid reallocating for each px.
  left=Math.floor(left)-2;top=Math.floor(top)-2;
  const tileWidth=frame?width:Math.max(32,Math.ceil((Math.ceil(right)-left+2)/32)*32),tileHeight=frame?height:Math.max(32,Math.ceil((Math.ceil(bottom)-top+2)/32)*32);
  if(frame){left=0;top=0;}
  if(surface.width!==tileWidth)surface.width=tileWidth;if(surface.height!==tileHeight)surface.height=tileHeight;
  gl!.useProgram(program!);gl!.uniform4f(bounds!,left/width,top/height,tileWidth/width,tileHeight/height);gl!.uniform1f(opacity!,frame?ctx.globalAlpha:1);gl!.uniform1f(flipY!,0);gl!.viewport(0,0,tileWidth,tileHeight);
  if(frame){if(ctx.globalCompositeOperation!=='source-over')throw Error('Unsupported Fox GPU frame blend');gl!.enable(gl!.BLEND);gl!.blendFunc(gl!.ONE,gl!.ONE_MINUS_SRC_ALPHA);}
  else{gl!.disable(gl!.BLEND);gl!.clearColor(0,0,0,0);gl!.clear(gl!.COLOR_BUFFER_BIT);}
  bindMesh(mesh);gl!.drawElements(gl!.TRIANGLES,mesh.count,gl!.UNSIGNED_SHORT,0);
  draws++;if(!frame){ctx.drawImage(surface,left,top,tileWidth,tileHeight);compositedPixels+=tileWidth*tileHeight;}
 };
 return {draw,
  beginFrame(ctx:CanvasRenderingContext2D,width:number,height:number){
   if(disposed||frame)throw Error('Fox GPU frame is unavailable or already open');
   if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1)throw Error('Invalid Fox GPU frame size');
   if(mix&&(mix.ctx!==ctx||mix.width!==width||mix.height!==height))throw Error('Mismatched Fox GPU mix target');
   if(!usable())return false;
   frame={ctx,width,height};if(surface.width!==width)surface.width=width;if(surface.height!==height)surface.height=height;
   gl!.bindFramebuffer(gl!.FRAMEBUFFER,mix?targets!.items[0].buffer:null);gl!.viewport(0,0,width,height);gl!.clearColor(0,0,0,0);gl!.clear(gl!.COLOR_BUFFER_BIT);return true;
  },
  endFrame(weight=1){
   if(!Number.isFinite(weight)||weight<0||weight>1||(!mix&&weight!==1)||(mix&&mix.weight+weight>1+1e-6))throw Error('Invalid Fox GPU mix weight');
   if(!frame)throw Error('No Fox GPU frame to finish');const {ctx,width,height}=frame;frame=undefined;
   if(!usable())return false;
   if(mix){gl!.bindFramebuffer(gl!.FRAMEBUFFER,targets!.items[1].buffer);blit(targets!.items[0].texture,weight,true);mix.weight+=weight;mixPasses++;return true;}
   present(ctx,width,height);return usable();
  },
  abortFrame(){frame=undefined;},
  beginMix(ctx:CanvasRenderingContext2D,width:number,height:number){
   if(disposed||frame||mix)throw Error('Fox GPU mix is unavailable or already open');
   if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1)throw Error('Invalid Fox GPU mix size');
   if(!usable())return false;
   try{ensureTargets(width,height);}catch{releaseTargets();gl!.bindFramebuffer(gl!.FRAMEBUFFER,null);return false;}
   if(surface.width!==width)surface.width=width;if(surface.height!==height)surface.height=height;
   mix={ctx,width,height,weight:0};gl!.bindFramebuffer(gl!.FRAMEBUFFER,targets!.items[1].buffer);gl!.viewport(0,0,width,height);gl!.clearColor(0,0,0,0);gl!.clear(gl!.COLOR_BUFFER_BIT);return true;
  },
  endMix(){
   if(!mix||frame)throw Error('Unfinished Fox GPU mix pass');const {ctx,width,height,weight}=mix;
   if(usable()&&Math.abs(weight-1)>1e-6)throw Error('Incomplete Fox GPU mix weights');mix=undefined;
   if(!usable())return false;
   gl!.bindFramebuffer(gl!.FRAMEBUFFER,null);gl!.viewport(0,0,width,height);gl!.clearColor(0,0,0,0);gl!.clear(gl!.COLOR_BUFFER_BIT);blit(targets!.items[1].texture,1,false);present(ctx,width,height);return usable();
  },
  abortMix(){mix=undefined;frame=undefined;if(usable())gl!.bindFramebuffer(gl!.FRAMEBUFFER,null);},
  stats:()=>({backend:usable()?'webgl':'canvas',textures:textures.size,meshes:meshes.size,uploads,textureAllocations,textureUpdates,draws,compositedPixels,frameCopies,mixPasses,framebuffers:targets?.items.length??0,disposed}),
  invalidate(source:HTMLCanvasElement){const t=textures.get(source);if(t)t.dirty=true;},
  releaseTexture(source:HTMLCanvasElement){const t=textures.get(source);if(t){gl!.deleteTexture(t.texture);textures.delete(source);}},
  dispose(){if(disposed)return;disposed=true;frame=undefined;mix=undefined;surface.removeEventListener('webglcontextlost',onLost);release();surface.width=surface.height=1;}
 };
}
