/** Recover a point in an element's layout plane, including ancestor scale, skew and perspective.
 * Invisible, noninteractive probes follow the browser's actual transform and scroll offset. */
const probes=new WeakMap<HTMLElement,HTMLElement[]>();
export function pointerPlanePoint(surface:HTMLElement,x:number,y:number):{x:number;y:number}|null{
 let points=probes.get(surface);
 if(!points){points=[[0,0],[100,0],[100,100],[0,100]].map(([left,top])=>{
  const p=document.createElement('i');p.setAttribute('aria-hidden','true');p.style.cssText=`position:absolute;left:${left}px;top:${top}px;width:0;height:0;pointer-events:none;visibility:hidden`;surface.append(p);return p;
 });probes.set(surface,points);}
 const quad=points.map(p=>{const r=p.getBoundingClientRect();return [r.x,r.y];}),rows:number[][]=[];
 [[0,0],[1,0],[1,1],[0,1]].forEach(([u,v],i)=>{const [px,py]=quad[i];rows.push([u,v,1,0,0,0,-u*px,-v*px,px],[0,0,0,u,v,1,-u*py,-v*py,py]);});
 for(let i=0;i<8;i++){
  let pivot=i;for(let j=i+1;j<8;j++)if(Math.abs(rows[j][i])>Math.abs(rows[pivot][i]))pivot=j;
  [rows[i],rows[pivot]]=[rows[pivot],rows[i]];const d=rows[i][i];if(Math.abs(d)<1e-9)return null;
  for(let j=i;j<9;j++)rows[i][j]/=d;
  for(let k=0;k<8;k++)if(k!==i){const f=rows[k][i];for(let j=i;j<9;j++)rows[k][j]-=f*rows[i][j];}
 }
 const [a,b,c,d,e,f,g,h]=rows.map(row=>row[8]),aa=a-x*g,bb=b-x*h,dd=d-y*g,ee=e-y*h,det=aa*ee-bb*dd;
 return Math.abs(det)<1e-9?null:{x:100*((x-c)*ee-bb*(y-f))/det,y:100*(aa*(y-f)-dd*(x-c))/det};
}
