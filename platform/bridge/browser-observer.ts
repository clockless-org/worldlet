// Runs only in the native isolated content world, not in the X page's JS world.
(() => {
 if(!['x.com','www.x.com','twitter.com','www.twitter.com'].includes(location.hostname))return;
 const articles=()=>[...document.querySelectorAll('article[data-testid="tweet"]')];
 const post=article=>{
  if(!article)return null;
  const links=[...article.querySelectorAll('a[href*="/status/"]')];
  const link=links.find(a=>a.querySelector('time'))||links.find(a=>/^\/[^/]+\/status\/\d+$/.test(new URL(a.href).pathname));
  if(!link)return null;const path=new URL(link.href).pathname.match(/^\/[^/]+\/status\/\d+/)?.[0];if(!path)return null;
  const text=article.querySelector('[data-testid="tweetText"]')?.innerText?.trim()||[...article.querySelectorAll('[data-testid="tweetPhoto"] img')].map(i=>i.alt).filter(Boolean).join('\n')||(article.querySelector('video')?'Video post (video contents not transcribed)':'Media post (no readable caption)');
  const author=article.querySelector('[data-testid="User-Name"]')?.innerText?.trim()||'Saved from X';
  return {url:'https://x.com'+path,text:text.slice(0,12000),title:author.slice(0,120)+' · '+text.slice(0,55)};
 };
 window.worldletXReader={read(){
  const all=articles(),visible=all.filter(e=>{const r=e.getBoundingClientRect();return r.bottom>0&&r.top<innerHeight;});
  visible.sort((a,b)=>{const distance=e=>{const r=e.getBoundingClientRect();return Math.abs((Math.max(0,r.top)+Math.min(innerHeight,r.bottom))/2-innerHeight/2)};return distance(a)-distance(b)});
  const selection=getSelection(),selectedNode=selection?.toString().trim()?selection.anchorNode:null;
  const selectedArticle=selectedNode?((selectedNode.nodeType===1?selectedNode:selectedNode.parentElement) as Element)?.closest('article'):null;
  const current=all.find(e=>post(e)?.url==='https://x.com'+location.pathname),selected=post(selectedArticle||current);
  return {url:location.origin+location.pathname,title:document.title,posts:visible.slice(0,3).map(post).filter(Boolean).map(p=>({...p,text:p.text.slice(0,3000)})),selected:selected?{...selected,text:selected.text.slice(0,3000)}:null};
 }};
 const pending=new Set();let menuPost=null;
 document.addEventListener('click',event=>{
  if(!event.isTrusted)return;
  const hit: any=event.target,element=hit.nodeType===1?hit:hit.parentElement;
  if(element?.closest('[data-testid="caret"]'))menuPost=post(element.closest('article[data-testid="tweet"]'));
  const target=element?.closest('[data-testid="bookmark"]');if(!target)return;
  const value=post(target.closest('article[data-testid="tweet"]'))||menuPost;menuPost=null;
  if(!value||pending.has(value.url))return;pending.add(value.url);
  // X frequently replaces the article after a click. Confirm by canonical post ID,
  // never by the click alone or an optimistic local animation.
  const started=Date.now(),timer=setInterval(()=>{
   const article=articles().find(e=>post(e)?.url===value.url);
   if(article?.querySelector('[data-testid="removeBookmark"]')){clearInterval(timer);pending.delete(value.url);window.webkit?.messageHandlers?.worldletBookmark?.postMessage({kind:'bookmark',...value});}
   else if(Date.now()-started>8000){clearInterval(timer);pending.delete(value.url);}
  },180);
 },true);
})();
