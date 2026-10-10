// Search the current overlay, so edits and deletes are immediately reflected.
export function searchNotes(pages,query,{all=false}={}){
 const text=String(query||'').toLocaleLowerCase().trim(),terms=text.split(/\s+/).filter(Boolean);
 return [...pages.values()].filter(p=>!p.virtual).map(p=>{const title=p.title.toLocaleLowerCase(),body=(p.markdown||p.text||'')+' '+(p.table?.rows||[]).flat().join(' '),all=(title+' '+body).toLocaleLowerCase();return {p,score:terms.reduce((n,t)=>n+(title.includes(t)?4:all.includes(t)?1:0),0),exact:terms.every(t=>all.includes(t))};}).filter(r=>!terms.length||(all?r.exact:r.score>0)).sort((a,b)=>Number(b.exact)-Number(a.exact)||b.score-a.score||a.p.title.localeCompare(b.p.title)).map(r=>r.p);
}
