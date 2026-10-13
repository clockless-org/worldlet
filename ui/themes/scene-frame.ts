import type {ThemeSceneRegistration} from './build-theme-contract.ts';

type Rect={x:number;y:number;width:number;height:number};
/** The same original-pixel foreground for local HTML readers, games and scene previews.
 * Native websites use the isolated browser foreground because a DOM layer cannot cover that surface. */
export function mountSceneFrame(host:HTMLElement,background:string,registration:ThemeSceneRegistration){
 const frame=registration.webFrame;
 if(!frame)return null;
 const canvas=document.createElement('canvas');canvas.className='applet-scene-foreground';canvas.setAttribute('aria-hidden','true');
 Object.assign(canvas.style,{position:'absolute',inset:'0',width:'100%',height:'100%',pointerEvents:'none'});
 host.append(canvas);
 const painting=new Image(),mask=new Image();painting.src=background;mask.src=frame.mask;
 let disposed=false,ready=false,placement:Rect|null=null,visible=true;
 function paint(){
  if(disposed)return;
  canvas.hidden=!visible;
  const w=host.clientWidth,h=host.clientHeight,dpr=devicePixelRatio||1;
  canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);
  if(!ready||!visible||!placement||w<=0||h<=0)return;
  const g=canvas.getContext('2d')!,r=placement;g.setTransform(dpr,0,0,dpr,0,0);
  g.drawImage(painting,r.x,r.y,r.width,r.height);
  const layer=document.createElement('canvas');layer.width=canvas.width;layer.height=canvas.height;
  const m=layer.getContext('2d')!;m.setTransform(dpr,0,0,dpr,0,0);
  const [sx,sy,sw,sh]=frame!.source,[tx,ty,tw,th]=frame!.target;
  m.drawImage(mask,sx*mask.width,sy*mask.height,sw*mask.width,sh*mask.height,r.x+tx*r.width,r.y+ty*r.height,tw*r.width,th*r.height);
  g.globalCompositeOperation='destination-in';g.drawImage(layer,0,0,w,h);g.globalCompositeOperation='source-over';
 }
 void Promise.all([painting.decode(),mask.decode()]).then(()=>{if(disposed)return;ready=true;canvas.dataset.ready='true';paint();},()=>{if(!disposed)canvas.dataset.ready='false';});
 return {element:canvas,layout(image:Rect,shown=true){placement=image;visible=shown;paint();},destroy(){disposed=true;canvas.remove();}};
}
