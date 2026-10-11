import {triangle,type Point} from './fox-skeleton.ts';
import type {RigPoint} from './fox-anatomy.ts';

/** Canvas reference renderer for registered skins. Production GPU promotion is
 * separate; this path makes the exact same vertex mapping inspectable. */
export function drawAnatomySkin(ctx:CanvasRenderingContext2D,layer:{canvas:HTMLCanvasElement;x:number;y:number},sourceSize:RigPoint,targetSize:RigPoint,vertex:(point:RigPoint)=>RigPoint,columns=16,rows=32){
 // Neighbouring cells share corners. Map each grid vertex once, the first time
 // a cell reaches it, as the GPU path does; the mapping itself is unchanged.
 const src:Point[]=new Array((columns+1)*(rows+1)),dst:Point[]=new Array(src.length);
 const corner=(col:number,row:number)=>{
  const n=row*(columns+1)+col;
  if(!src[n]){
   const p={x:col/columns*layer.canvas.width,y:row/rows*layer.canvas.height},q=vertex([(layer.x+p.x)/sourceSize[0],(layer.y+p.y)/sourceSize[1]]);
   src[n]=p;dst[n]={x:q[0]*targetSize[0],y:q[1]*targetSize[1]};
  }
  return n;
 };
 for(let row=0;row<rows;row++)for(let col=0;col<columns;col++){
  const a=corner(col,row),b=corner(col+1,row),c=corner(col+1,row+1),d=corner(col,row+1);
  triangle(ctx,layer.canvas,[src[a],src[b],src[c]],[dst[a],dst[b],dst[c]]);
  triangle(ctx,layer.canvas,[src[a],src[c],src[d]],[dst[a],dst[c],dst[d]]);
 }
}
