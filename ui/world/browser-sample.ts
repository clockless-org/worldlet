export function attachBrowserDevice(world){
 if(world.pages.some(p=>p.id==='device-x'))return world;
 const room=world.spaces.find(s=>s.theme==='news')||world.spaces.find(s=>!s.unbuilt);if(!room)return world;
 const page={id:'device-x',title:'X reading terminal',kind:'page',parent:world.pages[0]?.id||'root',children:[],path:'device-x.md',paths:['device-x.md'],objectKind:'browser',webApp:{kind:'x'},markdown:'Browse X in your Mac world. Bookmark a post to keep its text and source link in local memory. Ask Fox to read the page or find something you saved.',text:'X reading terminal · Browse X, read posts, save bookmarks to Fox',spatialStatus:'Browse · Save · Remember',provenance:[]};
 world.pages.push(page);room.children.unshift(page.id);world.pages[0]?.children?.push(page.id);return world;
}
