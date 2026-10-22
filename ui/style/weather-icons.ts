// Built-in color weather family. Shared by the world HUD and forecast Applet.
// No SVG IDs: multiple instances can safely coexist in a seven-day forecast.
export function weatherArtwork(kind:string,partly=false,night=false){
 const sun='<g stroke="#dba13c" stroke-width="2.5"><path d="M24 5v4m0 32v4M4 25h4m32 0h4M10 11l3 3m22 22 3 3m0-28-3 3M13 36l-3 3"/><circle cx="24" cy="25" r="10" fill="#f7cd6b"/><path d="M18 22a7 7 0 0 1 8-4" stroke="#ffedb3" stroke-width="2"/></g>';
 const moon='<path d="M29 8A17 17 0 1 0 41 32 17 17 0 0 1 29 8Z" fill="#efda94" stroke="#b6a56f" stroke-width="1.6"/><path d="M15 19a12 12 0 0 0 4 17" stroke="#fff1c1" stroke-width="2"/>';
 const cloud='<path d="M13 32a8 8 0 0 1-1-16 11 11 0 0 1 21-2 9 9 0 0 1 2 18Z" fill="'+(kind==='storm'?'#a4b3c7':'#e8eff2')+'" stroke="#839aa9" stroke-width="1.8"/><path d="M16 16a8 8 0 0 1 13-2" stroke="#fff" stroke-opacity=".75" stroke-width="2"/>';
 const extra=kind==='rain'?'<path d="m15 37-2 7m12-7-2 7m12-7-2 7" stroke="#479ecb" stroke-width="3"/>':kind==='snow'?'<path d="M16 36v10m-4-7.5 8 5m-8 0 8-5M32 36v10m-4-7.5 8 5m-8 0 8-5" stroke="#659fbb" stroke-width="2.3"/>':kind==='storm'?'<path d="m26 30-9 11h8l-2 6 12-12h-8l3-5Z" fill="#ffd36e" stroke="#c48c32" stroke-width="1.4"/>':kind==='fog'?'<path d="M9 37h25m-19 7h24" stroke="#8da9b0" stroke-width="2.8"/>':'';
 const body=kind==='unknown'?'<path d="M16 25h16" stroke="#8da4ad" stroke-width="3"/>':kind==='clear'&&!partly?(night?moon:sun):(partly?'<g transform="translate(-1 -2) scale(.76)">'+(night?moon:sun)+'</g>':'')+'<g transform="translate(0 '+(extra?'0':partly?'6':'5')+')">'+cloud+'</g>'+extra;
 return '<svg viewBox="0 0 48 50" aria-hidden="true" focusable="false" fill="none" stroke-linecap="round" stroke-linejoin="round">'+body+'</svg>';
}
