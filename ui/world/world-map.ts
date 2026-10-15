import type {ThemeWorldMap} from '../themes/index.ts';
import type {WorldContext,WorldMark,WorldMount,WorldState} from './world-renderer.ts';
/** The shared painted-map renderer. Area names and buttons are host overlays, never baked into the picture. */
export function renderWorldMap(context:WorldContext,map:ThemeWorldMap):WorldMount{
 const canvas=document.createElement('canvas');canvas.className='world-map-canvas';canvas.setAttribute('aria-hidden','true');
 Object.assign(canvas.style,{position:'absolute',inset:'0',width:'100%',height:'100%',pointerEvents:'none'});context.host.append(canvas);
 const image=new Image();image.src=context.asset(map.background);
 let state:WorldState=context.state,disposed=false,loaded=false,frame={x:0,y:0,width:0,height:0};
 const positions=new Map<string,{x:number;y:number}>();
 function draw(){
  if(disposed)return;const width=context.host.clientWidth,height=context.host.clientHeight;if(!width||!height)return;
  const scale=Math.min(width/map.imageSize[0],height/map.imageSize[1]);frame={x:(width-map.imageSize[0]*scale)/2,y:(height-map.imageSize[1]*scale)/2,width:map.imageSize[0]*scale,height:map.imageSize[1]*scale};
  const dpr=devicePixelRatio||1;if(canvas.width!==Math.round(width*dpr)||canvas.height!==Math.round(height*dpr)){canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);}
  const ctx=canvas.getContext('2d')!;ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,width,height);
  if(loaded){ctx.save();ctx.filter='blur(24px)';ctx.drawImage(image,-30,-30,width+60,height+60);ctx.restore();ctx.drawImage(image,frame.x,frame.y,frame.width,frame.height);}
  const marks:Record<string,WorldMark>={};positions.clear();
  for(const area of state.areas){const entry=map.areas[area.id.replace(/^building-/,'')];if(!entry)continue;
   const point={x:frame.x+entry.anchor[0]*frame.width,y:frame.y+entry.anchor[1]*frame.height};positions.set(area.id,point);
   marks[area.id]={kind:'area',id:area.id,...point,visible:loaded&&state.view.level!=='applet'&&!state.interaction.locked&&!state.interaction.covered,caption:entry.description,hovered:state.interaction.hoveredArea===area.id};
  }
  context.marks?.(marks);
 }
 const resize=new ResizeObserver(draw);resize.observe(context.host);
 const ready=image.decode().then(()=>{if(disposed)return;loaded=true;draw();});draw();
 return {ready,behindApplet:false,update(next){state=next;draw();},event(){return false;},
  anchor(id){return positions.get(id)||null;},bounds(id){const p=positions.get(id);return p?{x:p.x-20,y:p.y-20,width:40,height:40}:null;},
  picture(){return loaded&&!disposed?canvas:null;},metrics(){return {renderer:'map',imageLoaded:loaded,plate:frame,areas:[...positions.keys()],viewport:{width:context.host.clientWidth,height:context.host.clientHeight}};},
  dispose(){disposed=true;resize.disconnect();canvas.remove();positions.clear();context.marks?.({});}};
}
