import mark from '../../../resources/styles/builtin/assets/brand/mark.json' with {type:'json'};

// Product identity, shared by the app, website and generated artwork.
export const BRAND = Object.freeze({...mark.palette, paper:mark.background});
const polygons=(variant,monochrome=false,master=mark)=>master.variants[variant].shapes.map(shape=>`<polygon${monochrome?'':` fill="${shape.fill}"`} points="${shape.points.map(point=>point.join(',')).join(' ')}"/>`).join('');
export function worldletMark({monochrome=false,className='worldlet-mark'}={}) {
 return `<svg class="${className}" viewBox="0 0 1024 1024" fill="currentColor" aria-hidden="true">${polygons(mark.selected,monochrome)}</svg>`;
}
export function brandAssets(master=mark) {
 const brand={...master.palette,paper:master.background};
 const svg=content=>`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" role="img" aria-label="Worldlet">${content}</svg>\n`;
 const assets={};
 for(const id of Object.keys(master.variants))assets[`worldlet-${id}.svg`]=svg(polygons(id,false,master));
 assets['worldlet-mark.svg']=svg(polygons(master.selected,false,master));
 assets['worldlet-mark-mono.svg']=svg(`<g fill="${brand.ink}">${polygons(master.selected,true,master)}</g>`);
 assets['worldlet-app-icon.svg']=svg(`<rect x="24" y="24" width="976" height="976" rx="210" fill="${brand.paper}"/>${polygons(master.selected,false,master)}`);
 assets['brand.css']=`:root{${Object.entries(brand).map(([key,value])=>`--brand-${key}:${value}`).join(';')}}\n.brand-lockup{display:inline-flex;align-items:center;gap:8px;min-height:44px;color:inherit;text-decoration:none;font-family:var(--brand-font);font-size:var(--brand-wordmark-size,24px);font-weight:600;letter-spacing:-.04em;line-height:1.2}.brand-lockup img,.brand-lockup svg{display:block;flex:none;width:var(--brand-mark-size,36px);height:var(--brand-mark-size,36px);object-fit:contain}\n`;
 return assets;
}
