/** In a website, what the person types to Fox can be an address to open there (owner request
 * 2026-10-04: in the browser, Fox's input takes a URL). One word that is an https/http address or a
 * bare domain with a letter TLD, optionally with a port and path, opens as https; anything else
 * (sentences, numbers like 3.5, other schemes) stays a message to Fox. Pure. */
export function typedAddress(text:string):string|null {
 const value=String(text??'').trim();
 if(!value||value.length>2000||/\s/.test(value))return null;
 const candidate=/^https?:\/\//i.test(value)?value:/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}(?::\d{1,5})?(?:[/?#]\S*)?$/i.test(value)?'https://'+value:null;
 if(!candidate)return null;
 try{
  const url=new URL(candidate);
  if(url.username||url.password||!url.hostname.includes('.'))return null;
  url.protocol='https:';
  return url.href;
 }catch{return null;}
}
