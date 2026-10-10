// An artifact kept as an Applet (owner decision 2026-10-06, "artifact可以变成持久的applet"): the card Fox showed in
// conversation becomes one of the person's own page Applets (core/applets/MY-APPLETS.md). The World page renders the
// card's Markdown and chart as it showed them; this turns that fragment into one self-contained page that obeys the
// same offline rules as any page Fox makes, keeping only plain reading markup.

/** Tags kept as they are; any other tag is dropped and its text kept. */
const KEEP=new Set(['p','h1','h2','h3','h4','h5','h6','ul','ol','li','strong','em','b','i','code','pre','blockquote','table','thead','tbody','tr','th','td','br','hr','figure','figcaption','div','span','del','sup','sub']);
/** Tags dropped with everything inside them. */
const DROP=/<(script|style|iframe|svg|math|template|noscript|textarea|select|object|embed|title|head)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;
// The page runs offline and links nothing: an address in its text keeps its words without its scheme.
const unlink=(text:string)=>text.replace(/\b(?:https?|wss?|ftp):\/\//gi,'').replace(/(^|[^:])\/\/(?=[a-z0-9])/gi,'$1/ /');
const escapeText=(text:string)=>unlink(text).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

/** The card's rendered body as safe reading markup: no scripts, links, images, frames, forms or event handlers. */
export function artifactPageBody(fragment:unknown):string {
 const html=typeof fragment==='string'?fragment:'';
 return unlink(html.replace(/<!--[\s\S]*?-->/g,'').replace(DROP,'').replace(/<\/?([a-zA-Z][a-zA-Z0-9-]*)([^>]*)>/g,(tag,name:string,attributes:string)=>{
  const lower=name.toLowerCase();if(!KEEP.has(lower))return '';
  if(tag.startsWith('</'))return `</${lower}>`;
  const kept:string[]=[];
  const cls=/\sclass\s*=\s*"([a-z0-9 _-]{1,80})"/i.exec(attributes);if(cls)kept.push(`class="${cls[1]}"`);
  // A chart bar keeps its width, and nothing else of its style.
  const width=/\sstyle\s*=\s*"width:\s*([0-9]{1,3}(?:\.[0-9]+)?)%;?"/i.exec(attributes);if(width&&Number(width[1])<=100)kept.push(`style="width:${width[1]}%"`);
  return `<${lower}${kept.length?' '+kept.join(' '):''}>`;
 }).replace(/<(?![a-z/])/gi,'&lt;'));
}

/** One self-contained page for a kept artifact: its title, where it came from, its body. */
export function artifactPage({title,origin,fragment,color='#5c7f9e'}:{title:string;origin:string;fragment:unknown;color?:string}):string {
 const accent=/^#[0-9a-f]{6}$/i.test(color)?color:'#5c7f9e';
 return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeText(title)}</title><style>
:root{color-scheme:light;--accent:${accent}}
*{box-sizing:border-box}
body{margin:0;background:#f6f1e6;color:#2d2a24;font:16px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif}
main{max-width:640px;margin:0 auto;padding:22px 18px 40px}
header{border-bottom:2px solid var(--accent);padding-bottom:10px;margin-bottom:16px}
header p{margin:0;color:#7a6f5d;font-size:13px}
header h1{margin:4px 0 0;font-size:24px;line-height:1.25}
h2,h3,h4{margin:1.3em 0 .4em;line-height:1.3}
table{border-collapse:collapse;width:100%;margin:12px 0;font-size:14px;display:block;overflow-x:auto}
th,td{border:1px solid #ded4c1;padding:6px 8px;text-align:left;vertical-align:top}
th{background:#efe6d4}
code,pre{background:#efe6d4;border-radius:6px;font-size:14px}
code{padding:1px 4px}pre{padding:10px;overflow-x:auto}
blockquote{margin:12px 0;padding:4px 12px;border-left:3px solid var(--accent);color:#5a5246}
figure{margin:14px 0;padding:12px;background:#fffaf0;border:1px solid #ded4c1;border-radius:10px}
figcaption{font-weight:600;margin-bottom:8px}
.fox-artifact-bar{display:grid;grid-template-columns:minmax(80px,1fr) 2fr auto;gap:8px;align-items:center;font-size:14px;margin:4px 0}
.fox-artifact-bar i{display:block;height:10px;border-radius:5px;background:var(--accent)}
</style></head><body><main><header><p>${escapeText(origin)}</p><h1>${escapeText(title)}</h1></header>
${artifactPageBody(fragment)}
</main><script>document.documentElement.dataset.kept='artifact';</script></body></html>`;
}
