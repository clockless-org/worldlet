/** Small original weighted-mesh helpers; no Spine code or data. */
export type Point={x:number;y:number};
export const smooth=(x:number)=>{const t=Math.max(0,Math.min(1,x));return t*t*(3-2*t);};
/** Quintic smootherstep. Near t=1 it can round a few ulps above 1; smootherUnit clamps that. */
export const smoother=(x:number)=>{const t=Math.max(0,Math.min(1,x));return t*t*t*(10+t*(-15+6*t));};
export const smootherUnit=(x:number)=>Math.max(0,Math.min(1,smoother(x)));
/** Rises over [start,start+rise], holds, then falls over [fall,end]. */
export const pulse=(t:number,start:number,rise:number,fall:number,end:number)=>smootherUnit((t-start)/rise)*(1-smootherUnit((t-fall)/(end-fall)));
// Affine texture triangles preserve the painted fur while bending the elbow.
export function triangle(ctx:CanvasRenderingContext2D,image:CanvasImageSource,s:Point[],d:Point[]){
 const [p,q,r]=s,[a,b,c]=d,det=(q.x-p.x)*(r.y-p.y)-(r.x-p.x)*(q.y-p.y);
 if(Math.abs(det)<.0001)return;
 const m1=((b.x-a.x)*(r.y-p.y)-(c.x-a.x)*(q.y-p.y))/det;
 const m2=((b.y-a.y)*(r.y-p.y)-(c.y-a.y)*(q.y-p.y))/det;
 const m3=((c.x-a.x)*(q.x-p.x)-(b.x-a.x)*(r.x-p.x))/det;
 const m4=((c.y-a.y)*(q.x-p.x)-(b.y-a.y)*(r.x-p.x))/det;
 // Subpixel overlap avoids hairline seams between independently antialiased
 // triangles. Texture coordinates stay unchanged; transparent edges remain soft.
 const points=[a,b,c],sign=Math.sign((b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x));
 const normals=points.map((p,i)=>{const q=points[(i+1)%3],length=Math.max(.001,Math.hypot(q.x-p.x,q.y-p.y));return {x:(q.y-p.y)/length*sign,y:-(q.x-p.x)/length*sign};});
 const clip=points.map((p,i)=>{const n=normals[i],m=normals[(i+2)%3],k=.3/Math.max(.01,1+n.x*m.x+n.y*m.y);return {x:p.x+(n.x+m.x)*k,y:p.y+(n.y+m.y)*k};});
 ctx.save();ctx.beginPath();ctx.moveTo(clip[0].x,clip[0].y);ctx.lineTo(clip[1].x,clip[1].y);ctx.lineTo(clip[2].x,clip[2].y);ctx.closePath();ctx.clip();
 ctx.transform(m1,m2,m3,m4,a.x-m1*p.x-m3*p.y,a.y-m2*p.x-m4*p.y);ctx.drawImage(image,0,0);ctx.restore();
}
