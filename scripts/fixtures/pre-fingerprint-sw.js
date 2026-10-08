const CACHE='worldlet-demo-__CACHE_VERSION__';
const FILES=['/','/demo.bundle.js','/pcm-worklet.js','/room.css','/space.css','/notion.css','/homestead.css','/worldlet-ui.css','/fonts/InterVariable.woff2','/fonts/InterVariable-Italic.woff2','/manifest.webmanifest','/icon-192.png','/icon-512.png','/apple-touch-icon.png','/icon.svg'];
self.addEventListener('install',event=>event.waitUntil((async()=>{const cache=await caches.open(CACHE);await cache.addAll(FILES.map(path=>new Request(path,{cache:'reload'})));await self.skipWaiting();})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{for(const key of await caches.keys())if((key.startsWith('worldlet-demo-')||key.startsWith('aladdin-shell-'))&&key!==CACHE)await caches.delete(key);await self.clients.claim();})()));
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);if(event.request.method!=='GET'||url.origin!==location.origin||url.pathname.startsWith('/api/'))return;
 const navigation=event.request.mode==='navigate'&&['/','/index.html','/demo/','/demo/index.html'].includes(url.pathname);
 if(!navigation&&!FILES.includes(url.pathname))return;
  event.respondWith((async()=>{const cache=await caches.open(CACHE),key=navigation?'/':url.pathname;
  if(navigation){try{const response=await fetch(event.request,{signal:AbortSignal.timeout(3500)});if(response.ok)return response;}catch{}}
  const cached=await cache.match(key);return cached||fetch(event.request);
 })());
});
