/** Small original two-bone/weighted-mesh implementation; no Spine code or data. */
export type Point={x:number;y:number};
export const smooth=(x:number)=>{const t=Math.max(0,Math.min(1,x));return t*t*(3-2*t);};
/** Quintic smootherstep. Near t=1 it can round a few ulps above 1; smootherUnit clamps that. */
export const smoother=(x:number)=>{const t=Math.max(0,Math.min(1,x));return t*t*t*(10+t*(-15+6*t));};
export const smootherUnit=(x:number)=>Math.max(0,Math.min(1,smoother(x)));
/** Rises over [start,start+rise], holds, then falls over [fall,end]. */
export const pulse=(t:number,start:number,rise:number,fall:number,end:number)=>smootherUnit((t-start)/rise)*(1-smootherUnit((t-fall)/(end-fall)));
export function solveArm(root:Point,target:Point,bend:number,upper=39,lower=43){
 const dx=target.x-root.x,dy=target.y-root.y,d=Math.max(.01,Math.min(Math.hypot(dx,dy),upper+lower-.01));
 const reach=Math.max(Math.abs(upper-lower)+.01,d),heading=Math.atan2(dy,dx);
 const angle=heading+bend*Math.acos(Math.max(-1,Math.min(1,(upper*upper+reach*reach-lower*lower)/(2*upper*reach))));
 const elbow={x:root.x+Math.cos(angle)*upper,y:root.y+Math.sin(angle)*upper};
 const hand={x:root.x+Math.cos(heading)*reach,y:root.y+Math.sin(heading)*reach};
 return {root,elbow,hand,upper,lower,a:angle-Math.PI/2,b:Math.atan2(hand.y-elbow.y,hand.x-elbow.x)-Math.PI/2};
}
export function armVertex(arm:ReturnType<typeof solveArm>,u:number,v:number){
 const x=(u-.5)*44,y=v*(arm.upper+arm.lower+10),w=smooth((y-arm.upper+15)/30);
 const a={x:arm.root.x+Math.cos(arm.a)*x-Math.sin(arm.a)*y,y:arm.root.y+Math.sin(arm.a)*x+Math.cos(arm.a)*y};
 const b={x:arm.elbow.x+Math.cos(arm.b)*x-Math.sin(arm.b)*(y-arm.upper),y:arm.elbow.y+Math.sin(arm.b)*x+Math.cos(arm.b)*(y-arm.upper)};
 return {x:a.x+(b.x-a.x)*w,y:a.y+(b.y-a.y)*w};
}
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
export function drawArm(ctx:CanvasRenderingContext2D,image:HTMLCanvasElement,arm:ReturnType<typeof solveArm>){
 for(let row=0;row<12;row++){
  const uv=[{x:0,y:row/12},{x:1,y:row/12},{x:1,y:(row+1)/12},{x:0,y:(row+1)/12}];
  const s=uv.map(p=>({x:p.x*image.width,y:p.y*image.height})),d=uv.map(p=>armVertex(arm,p.x,p.y));
  for(const ids of [[0,1,2],[0,2,3]])triangle(ctx,image,ids.map(i=>s[i]),ids.map(i=>d[i]));
 }
}
