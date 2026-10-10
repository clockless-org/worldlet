// Procedural sky materials. True horizontal coordinates use a compressed
// 360-degree panorama: N at the seam, E left, S center, W right. Disc size is
// intentionally exaggerated for readability, not a true angular scale.
const clamp=(x:number,a=0,b=1)=>Math.max(a,Math.min(b,x));
export function skyBodyPlacement(body:any,width:number,height:number,view:{y:number;scale:number}){
 const horizon=clamp(view.y+245*view.scale,0,height*.35),diameter=clamp(width*.029,28,48);
 const top=diameter*.7,bottom=horizon-diameter*.7;
 const azimuth=((body.azimuth??180)%360+360)%360;
 return {x:width*(.055+.89*azimuth/360),
  y:top+Math.max(0,bottom-top)*(1-clamp((body.altitude??0)/90)),diameter,horizon,azimuth,altitude:body.altitude??0,projection:'compressed-360-panorama',
  visible:(body.altitude??0)>0&&bottom>top};
}
export function moonPixels(size:number,fraction:number,phase:number,lightAngle=phase<.5?0:Math.PI){
 const data=new Uint8ClampedArray(size*size*4),lz=2*clamp(fraction)-1,side=Math.sqrt(Math.max(0,1-lz*lz)),lx=side*Math.cos(lightAngle),ly=side*Math.sin(lightAngle);
 const maria=[[-.35,-.28,.31],[-.02,-.5,.2],[.27,-.2,.29],[-.15,.18,.22],[.42,.12,.17]];
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const nx=(x+.5-size/2)/(size*.46),ny=(y+.5-size/2)/(size*.46),r2=nx*nx+ny*ny;if(r2>=1)continue;
  const z=Math.sqrt(1-r2),light=Math.max(0,nx*lx+ny*ly+z*lz);
  let albedo=.9;
  for(const [cx,cy,r]of maria)albedo-=.19*Math.exp(-((nx-cx)**2+(ny-cy)**2)/(r*r*.7));
  // Restrained basin/rim detail, stable across phases; not a photographic map.
  for(const [cx,cy,r]of [[-.48,.35,.08],[.2,.58,.065],[.54,.37,.10],[-.58,-.08,.055],[.07,.23,.045]]){
   const d=Math.hypot(nx-cx,ny-cy)/r;
   albedo+=.045*Math.exp(-(((d-1)/.15)**2))-.05*Math.exp(-d*d*2);
  }
  // Keep broad lunar markings, not high-frequency noise that reads as rock.
  // A softened single-scattering response avoids the plastic sphere's dark rim.
  const scattering=light>0?Math.pow(clamp(2*light/(light+z+.001)),.22):0;
  const luminance=(.9+(albedo-.9)*1.1)*scattering,i=(y*size+x)*4;
  data[i]=246*luminance;data[i+1]=246*luminance;data[i+2]=238*luminance;
  // Let the night sky show through the unlit hemisphere; no black cutout.
  data[i+3]=255*clamp((1-Math.sqrt(r2))*size*.18)*clamp(light*32);
 }
 return data;
}
