// One painted light surface for Canvas/Pixi and HTML device copies. The lens
// occupies the central half; transparent margins carry reflected light only.
export const LAMP_SURFACE_EXTENT=2;
const surfaces=new Map<number,{canvas:HTMLCanvasElement;url:string}>();
export function lampSurface(color:number){
 const cached=surfaces.get(color);if(cached)return cached;
 const canvas=document.createElement('canvas');canvas.width=canvas.height=256;
 const ctx=canvas.getContext('2d')!,c=128,r=64;
 const rgb=[color>>16&255,color>>8&255,color&255];
 const tint=(white:number,alpha=1)=>`rgba(${rgb.map(v=>Math.round(white>=0?v+(255-v)*white:v*(1+white))).join(',')},${alpha})`;
 const halo=ctx.createRadialGradient(c,c,r*.62,c,c,r*1.95);
 halo.addColorStop(0,tint(0,.24));halo.addColorStop(.32,tint(0,.13));halo.addColorStop(.68,tint(0,.035));halo.addColorStop(1,tint(0,0));
 ctx.fillStyle=halo;ctx.fillRect(0,0,256,256);
 // A dark curved glass edge surrounds a small luminous centre, leaving the
 // asset's brass bezel visible. Brightness is concentrated inside the socket.
 const glass=ctx.createRadialGradient(c-r*.13,c-r*.16,r*.03,c,c,r);
 glass.addColorStop(0,tint(.84));glass.addColorStop(.18,tint(.5));glass.addColorStop(.43,tint(.08));glass.addColorStop(.73,tint(-.32));glass.addColorStop(.94,tint(-.65));glass.addColorStop(1,tint(-.83));
 ctx.fillStyle=glass;ctx.beginPath();ctx.arc(c,c,r,0,Math.PI*2);ctx.fill();
 const glint=ctx.createRadialGradient(c-r*.29,c-r*.37,0,c-r*.29,c-r*.37,r*.29);
 glint.addColorStop(0,'rgba(255,255,245,.72)');glint.addColorStop(.38,'rgba(255,255,245,.3)');glint.addColorStop(1,'rgba(255,255,245,0)');
 ctx.fillStyle=glint;ctx.beginPath();ctx.arc(c-r*.29,c-r*.37,r*.29,0,Math.PI*2);ctx.fill();
 ctx.strokeStyle=tint(.35,.32);ctx.lineWidth=2;ctx.beginPath();ctx.arc(c,c,r*.79,.23*Math.PI,.72*Math.PI);ctx.stroke();
 const surface={canvas,url:canvas.toDataURL('image/png')};surfaces.set(color,surface);return surface;
}
