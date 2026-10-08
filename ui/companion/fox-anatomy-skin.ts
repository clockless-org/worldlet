import {triangle} from './fox-skeleton.ts';
import type {RigPoint} from './fox-anatomy.ts';

/** Canvas reference renderer for registered skins. Production GPU promotion is
 * separate; this path makes the exact same vertex mapping inspectable. */
export function drawAnatomySkin(ctx:CanvasRenderingContext2D,layer:{canvas:HTMLCanvasElement;x:number;y:number},sourceSize:RigPoint,targetSize:RigPoint,vertex:(point:RigPoint)=>RigPoint,columns=16,rows=32){
 for(let row=0;row<rows;row++)for(let col=0;col<columns;col++){
  const uv=[[col/columns,row/rows],[(col+1)/columns,row/rows],[(col+1)/columns,(row+1)/rows],[col/columns,(row+1)/rows]];
  const src=uv.map(([u,v])=>({x:u*layer.canvas.width,y:v*layer.canvas.height}));
  const dst=src.map(p=>{const q=vertex([(layer.x+p.x)/sourceSize[0],(layer.y+p.y)/sourceSize[1]]);return {x:q[0]*targetSize[0],y:q[1]*targetSize[1]};});
  for(const indices of [[0,1,2],[0,2,3]])triangle(ctx,layer.canvas,indices.map(i=>src[i]),indices.map(i=>dst[i]));
 }
}
