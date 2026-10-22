// The overlay page that draws Fox's glow, steps card and pointer over the website page (glow.ts).
// Kept apart from Electron so checks can render it in a plain browser.
export const GLOW_PAGE=`<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;width:100%;height:100%;overflow:hidden;background:transparent}
#root{position:absolute;inset:0;overflow:hidden;display:none}
#paint{position:absolute;inset:0;-webkit-mask-size:100% 100%;-webkit-mask-repeat:no-repeat}
#colors{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%)}
@keyframes turn{from{transform:translate(-50%,-50%) rotate(0deg)}to{transform:translate(-50%,-50%) rotate(360deg)}}
#paint.off{display:none}
#card{position:absolute;top:0;left:50%;transform:translateX(-50%);box-sizing:border-box;min-width:220px;max-width:min(380px,calc(100% - 32px));padding:8px 14px 9px;border-radius:0 0 12px 12px;background:rgba(255,250,240,.97);color:rgb(31,41,36);font:12px/1.4 -apple-system,system-ui,"Segoe UI",sans-serif;box-shadow:0 6px 18px rgba(31,42,36,.24);overflow:hidden}
#accent{position:absolute;left:0;right:0;top:0;height:3px;background-size:200% 100%}
@keyframes slide{from{background-position:0 0}to{background-position:200% 0}}
#title{font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-align:center}
#earlier{margin-top:5px;color:rgb(124,134,128);font-size:11px}
#steps{list-style:none;margin:5px 0 0;padding:0}
#steps:empty{display:none}
#steps li{display:flex;gap:7px;align-items:flex-start;padding:1px 0;color:rgb(86,98,91)}
#steps li span:last-child{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#steps .mark{flex:none;box-sizing:border-box;width:14px;height:14px;margin-top:1px;border-radius:50%;border:2px solid rgb(200,190,170)}
#steps li.done .mark{border:0;background:rgb(63,143,58) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 10 10'%3E%3Cpath d='M2 5.2 4.2 7.3 8 3' fill='none' stroke='white' stroke-width='1.7' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E") center/10px no-repeat}
#steps li.now{color:rgb(31,41,36);font-weight:600}
#steps li.now .mark{border-color:#ff8a3d;animation:pulse 1.2s ease-in-out infinite}
@keyframes pulse{50%{opacity:.35}}
#result{margin-top:6px;padding-top:6px;border-top:1px solid rgb(232,220,196);display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:3;overflow:hidden}
#result:empty{display:none}
#pointer{position:absolute;left:0;top:0;width:28px;height:28px;margin:-2px 0 0 -4px;overflow:visible;filter:drop-shadow(0 2px 1.5px rgba(0,0,0,.4))}
#pointer.appear{animation:appear .35s}
#pointer.gone{display:none}
@keyframes appear{from{opacity:0}to{opacity:1}}
#hand{transform-origin:4px 2px}
#hand.press{animation:press .22s}
@keyframes press{50%{transform:scale(.82)}}
#ripple{position:absolute;left:0;top:0;width:34px;height:34px;margin:-17px 0 0 -17px;border:3px solid #ff8a3d;border-radius:50%;box-sizing:border-box;opacity:0}
#ripple.press{animation:ring .52s ease-out}
@keyframes ring{from{transform:scale(.3);opacity:.9}to{transform:scale(1.6);opacity:0}}
@media (prefers-reduced-motion:reduce){#steps li.now .mark{animation:none}}
</style></head><body><div id="root"><div id="paint"><div id="colors"></div></div><div id="card" role="status"><div id="accent"></div><div id="title"></div><div id="earlier"></div><ol id="steps"></ol><div id="result"></div></div><div id="ripple"></div>
<svg id="pointer" viewBox="0 0 28 28"><g id="hand"><path d="M4 2L4 22L9.5 17L13 25.5L16.5 24L13 15.8L20.5 15.8Z" fill="#fff" stroke="#1f2a24" stroke-width="1.6" stroke-linejoin="round"/><circle cx="21" cy="6" r="4" fill="#ff8a3d" stroke="#fff" stroke-width="1.4"/></g></svg></div>
<script>
const root=document.getElementById('root'),paint=document.getElementById('paint'),colors=document.getElementById('colors'),card=document.getElementById('card'),accent=document.getElementById('accent'),title=document.getElementById('title');
const earlier=document.getElementById('earlier'),steps=document.getElementById('steps'),result=document.getElementById('result');
const pointer=document.getElementById('pointer'),hand=document.getElementById('hand'),ripple=document.getElementById('ripple');
let style=null,drawn='',masked='',at=null,step=0;
// Alpha mask from the distance to the page's edge: nearly opaque at the edge and fading about 50 px
// inside, the same depth along the sides and round the corners. Stacked blurs of the frame had
// doubled up where two sides meet. The glow reaches right into the corners: rounded to the page
// view's 12 px it left a white sliver of the page between the glow and the frame wherever the page
// came out less rounded (owner report 2026-10-04). Outside a rounded page the corner glows over the
// frame, which has the same colors.
function mask(width,height){
 const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
 const g=canvas.getContext('2d'),image=g.createImageData(width,height),data=image.data,radius=0,hx=width/2-radius,hy=height/2-radius;
 for(let y=0;y<height;y++){
  const qy=Math.abs(y+0.5-height/2)-hy;
  for(let x=0;x<width;x++){
   const qx=Math.abs(x+0.5-width/2)-hx,outside=Math.hypot(Math.max(qx,0),Math.max(qy,0))+Math.min(Math.max(qx,qy),0)-radius,depth=Math.max(0,-outside);
   if(depth>64)continue;
   data[(y*width+x)*4+3]=Math.round(235*Math.exp(-depth/15));
  }
 }
 g.putImageData(image,0,0);return canvas.toDataURL();
}
const reduced=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
const below=()=>({x:innerWidth/2,y:card.offsetHeight+14});
function redraw(){
 if(!style)return;
 const width=innerWidth,height=innerHeight;
 // The glow belongs to Fox's work; the finished card shows alone.
 paint.classList.toggle('off',!!style.finished);
 if(!style.finished&&width>0&&height>0){
  const side=Math.ceil(Math.hypot(width,height));colors.style.width=colors.style.height=side+'px';
  const size=width+'x'+height;if(size!==masked){masked=size;paint.style.webkitMaskImage='url('+mask(Math.ceil(width),Math.ceil(height))+')';}
 }
 const key=JSON.stringify([style.label,style.steps,style.earlier,style.result,style.finished]);
 if(key!==drawn){
  drawn=key;title.textContent=style.label;
  earlier.textContent=style.earlier?(style.earlier===1?'1 earlier step':style.earlier+' earlier steps'):'';earlier.hidden=!style.earlier;
  const last=style.steps.length-1;
  steps.replaceChildren(...style.steps.map((item,index)=>{
   const li=document.createElement('li'),mark=document.createElement('span'),text=document.createElement('span');
   mark.className='mark';if(item.done)mark.setAttribute('aria-label','done');text.textContent=item.text;
   li.className=item.done?'done':index===last&&!style.finished?'now':'';li.append(mark,text);return li;
  }));
  result.textContent=style.finished?style.result:'';
 }
 // The pointer belongs to Fox's work; once Fox is done only the card stays.
 pointer.classList.toggle('gone',!!style.finished);
 if(!style.finished)place(at??below(),false);
}
function place(point,animate,seconds){
 at=point;
 pointer.style.transition=ripple.style.transition=animate?'transform '+seconds+'s cubic-bezier(.3,.7,.3,1)':'none';
 pointer.style.transform='translate('+point.x+'px,'+point.y+'px)';ripple.style.transform='translate('+point.x+'px,'+point.y+'px)';
}
window.glow={
 apply(next){
  if(!next){style=null;root.style.display='none';at=null;drawn='';accent.style.animation='';colors.style.animation='';return;}
  const previous=style;style=next;root.style.display='block';
  if(!previous||previous.finished&&!next.finished){pointer.classList.remove('appear');if(!reduced()){void pointer.offsetWidth;pointer.classList.add('appear');}}
  if(!previous||previous.colors.join()!==next.colors.join()){accent.style.background='linear-gradient(90deg,'+next.colors.join(',')+')';colors.style.background='conic-gradient('+next.colors.join(',')+')';}
  accent.style.backgroundSize='200% 100%';
  const turn=next.finished?0:next.turnSeconds;
  if(!previous||(previous.finished?0:previous.turnSeconds)!==turn){
   accent.style.animation=turn>0?'slide '+turn+'s linear infinite':'';
   accent.style.animationDelay=turn>0?-(next.phaseSeconds%turn)+'s':'';
   colors.style.animation=turn>0?'turn '+turn+'s linear infinite':'';
   colors.style.animationDelay=accent.style.animationDelay;
  }
  redraw();
 },
 // Glides to a point (page px from the top-left) and presses there; returns how long that takes.
 point(x,y){
  if(!style||style.finished||!Number.isFinite(x)||!Number.isFinite(y))return 0;
  const to={x:Math.min(Math.max(x,0),innerWidth),y:Math.min(Math.max(y,0),innerHeight)},from=at??below();
  const current=++step;
  if(reduced()){place(to,false);return 0;}
  const seconds=Math.min(0.65,0.22+Math.hypot(to.x-from.x,to.y-from.y)*0.0006);
  place(to,true,seconds);
  setTimeout(()=>{
   if(step!==current||!style)return;
   for(const node of [hand,ripple]){node.classList.remove('press');void node.getBoundingClientRect();node.classList.add('press');}
  },seconds*1000);
  return seconds;
 }
};
addEventListener('resize',redraw);
</script></body></html>`;
