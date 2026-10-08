/** Shared identity and time formatting for the envelope and its opened letter. */
export function mailIdentity(from=''){
 const match=String(from).match(/^(.*?)\s*<([^>]+)>$/),name=(match?match[1]:String(from)).replace(/^"|"$/g,'').trim(),address=match?.[2]||(/^[^\s@]+@[^\s@]+$/.test(name)?name:'');
 return {name:name||address||'Sender unavailable',address,initials:(name||address).split(/\s+/).slice(0,2).map(s=>s[0]).join('').toUpperCase()||'?'};
}
export const defaultMailAvatar='<svg viewBox="0 0 32 32" fill="currentColor" aria-hidden="true"><circle cx="16" cy="11" r="5"/><path d="M6 28v-3a10 10 0 0 1 20 0v3Z"/></svg>';
export function mailTitle(subject:string,curated=''){
 const text=(curated||subject||'No subject').replace(/^(?:(?:re|fw|fwd)\s*:\s*)+/ig,'').replace(/\s+/g,' ').trim();
 const chars=Array.from(text);return chars.length>68?chars.slice(0,65).join('').replace(/\s+\S*$/,'')+'…':text;
}
// Muted village inks for initials; one sender always gets the same one.
const AVATAR_TINTS=['#8f9f7f','#7b8f6a','#b08a6e','#b48a8a','#7f8f9c','#b39b62','#9488a6','#6f978f'];
type AvatarLookup=(address:string)=>Promise<{image?:string,kind?:string}|null|undefined>;
let avatarLookup:AvatarLookup|null=null;
const avatarReads=new Map<string,Promise<{image:string,kind:string}>>();
/** The host reads public sender portraits (Gravatar, BIMI logo, website icon) as data: images. */
export function setMailAvatarLookup(lookup:AvatarLookup|null){avatarLookup=lookup;avatarReads.clear();}
const IMAGE=/^data:image\/(?:png|jpeg|webp|gif|svg\+xml);base64,[A-Za-z0-9+/=]+$/;
function showImage(avatar:HTMLElement,src:string,kind:string,fallback:()=>void){
 const image=document.createElement('img');image.alt='';image.decoding='async';image.src=src;image.onerror=fallback;
 avatar.dataset.kind=kind==='logo'?'logo':'photo';avatar.replaceChildren(image);
}
export function mailAvatar(from:string,photo=''){
 const who=mailIdentity(from),avatar=document.createElement('span');avatar.className='mail-avatar';avatar.setAttribute('aria-label',who.name);avatar.title=who.name;
 const key=(who.address||who.name).toLowerCase();let hash=0;for(const c of key)hash=(hash*31+c.codePointAt(0)!)>>>0;
 const initials=()=>{delete avatar.dataset.kind;if(who.name==='Sender unavailable'){avatar.innerHTML=defaultMailAvatar;return;}const text=document.createElement('span');text.className='mail-avatar-initials';text.textContent=Array.from(/[\u3400-\u9fff\uac00-\ud7af]/.test(who.name)?who.name.replace(/\s+/g,''):who.initials).slice(0,/[\u3400-\u9fff\uac00-\ud7af]/.test(who.name)?1:2).join('');avatar.replaceChildren(text);};
 avatar.style.setProperty('--mail-avatar-tint',AVATAR_TINTS[hash%AVATAR_TINTS.length]);initials();
 if(IMAGE.test(photo)){showImage(avatar,photo,'photo',initials);return avatar;}
 const address=who.address.toLowerCase();
 if(avatarLookup&&address){
  let read=avatarReads.get(address);
  if(!read){read=avatarLookup(address).then(value=>({image:typeof value?.image==='string'&&IMAGE.test(value.image)?value.image:'',kind:value?.kind==='logo'?'logo':'photo'}),()=>({image:'',kind:''}));avatarReads.set(address,read);}
  void read.then(value=>{if(value.image)showImage(avatar,value.image,value.kind,initials);});
 }
 return avatar;
}
export function mailTime(raw:string|number,now=Date.now()){
 if(typeof raw==='string'&&!/^\d+$/.test(raw)&&!/(?:^|\D)\d{4}(?:\D|$)/.test(raw))return {label:'Time unavailable',exact:raw,iso:''};
 const date=new Date(/^\d+$/.test(String(raw))?Number(raw):raw);
 if(!raw||Number.isNaN(date.getTime()))return {label:'Time unavailable',exact:String(raw||''),iso:''};
 const seconds=(date.getTime()-now)/1000,abs=Math.abs(seconds),[scale,unit]=abs<60?[1,'second']:abs<3600?[60,'minute']:abs<86400?[3600,'hour']:abs<2592000?[86400,'day']:abs<31536000?[2592000,'month']:[31536000,'year'];
 return {label:abs<60?'Just now':new Intl.RelativeTimeFormat(undefined,{numeric:'auto'}).format(Math.round(seconds/Number(scale)),unit as Intl.RelativeTimeFormatUnit),exact:date.toLocaleString(),iso:date.toISOString()};
}
