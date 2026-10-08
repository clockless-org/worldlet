import {Graphics} from 'pixi.js';
export function weeklyQuota(value,now=Date.now()){
 if(value?.observedAt&&now-value.observedAt>300000)return null;
 const buckets=value?.rateLimitsByLimitId ? Object.values<any>(value.rateLimitsByLimitId) : value?.rateLimits?[value.rateLimits]:[];
 const weekly=buckets.flatMap(b=>[b.primary,b.secondary]).filter(w=>w?.windowDurationMins===10080&&Number.isFinite(w.usedPercent)&&Number.isFinite(w.resetsAt)&&w.resetsAt*1000>now);
 if(!weekly.length)return null;
 const w=weekly.reduce((a,b)=>a.usedPercent>b.usedPercent?a:b);
 return {remaining:Math.max(0,Math.min(100,100-w.usedPercent)),resetsAt:w.resetsAt};
}
export function createWorkSignal(host,key,root,width,top){
 const battery=new Graphics();battery.eventMode='none';root.addChild(battery);
 const meter=document.createElement('div');meter.className='applet-weekly-battery';meter.dataset.applet=key;meter.setAttribute('role','meter');meter.setAttribute('aria-label','Weekly allowance remaining');
 meter.innerHTML='<span></span>';host.append(meter);let previous='';
 return {update(activity,time,moving,visible,x,y,scale=1){
  battery.visible=visible;
  const placeholder=activity?.usage?.placeholder===true,quota=placeholder?null:weeklyQuota(activity?.usage),label=placeholder?'Usage unavailable':quota?Math.round(quota.remaining)+'% weekly remaining · resets '+new Date(quota.resetsAt*1000).toLocaleString():'Weekly allowance unavailable';
  meter.hidden=!visible;meter.style.transform=`translate(${x}px,${y}px) translate(-50%,-100%) scale(${scale})`;
  if(label!==previous){previous=label;meter.title=label;meter.setAttribute('aria-valuetext',label);meter.dataset.known=String(!!quota);if(quota)meter.setAttribute('aria-valuenow',String(quota.remaining));else meter.removeAttribute('aria-valuenow');meter.style.setProperty('--remaining',quota?quota.remaining+'%':'0%');}
  battery.clear();const bw=width*.22,bh=width*.066,left=-bw/2,by=top-width*.10;
  battery.roundRect(left,by,bw,bh,width*.012).fill({color:0x443d31,alpha:.9}).stroke({width:width*.009,color:0xe4cea1,alpha:.9});
  battery.rect(bw/2,by+bh*.3,width*.016,bh*.4).fill(0xd4bd91);
  if(quota)battery.roundRect(left+width*.015,by+width*.014,(bw-width*.03)*quota.remaining/100,bh-width*.028,width*.004).fill(quota.remaining<15?0xcda16e:0xb3c58b);
  else if(!placeholder)battery.moveTo(-bw*.20,by+bh*.5).lineTo(bw*.20,by+bh*.5).stroke({width:width*.009,color:0xa89f89});
 },destroy(){battery.destroy();meter.remove();}};
}
