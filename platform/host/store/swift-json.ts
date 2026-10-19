// Byte-compatible encodings for identities the Mac host already stored. Changing these
// would change saved item IDs, so they stay deliberately narrow.

/** Foundation `JSONSerialization` with `.sortedKeys`: `/` is escaped, other text is raw UTF-8. */
export function swiftJSON(value:unknown):string {
 if(value===null||value===undefined)return 'null';
 if(typeof value==='string')return '"'+value.replace(/[\\"\/\u0000-\u001f]/g,c=>({'\\':'\\\\','"':'\\"','/':'\\/','\n':'\\n','\r':'\\r','\t':'\\t','\b':'\\b','\f':'\\f'} as Record<string,string>)[c]??'\\u'+c.charCodeAt(0).toString(16).padStart(4,'0'))+'"';
 if(typeof value==='number'||typeof value==='boolean')return String(value);
 if(Array.isArray(value))return '['+value.map(swiftJSON).join(',')+']';
 const object=value as Record<string,unknown>;
 return '{'+Object.keys(object).sort().filter(key=>object[key]!==undefined).map(key=>swiftJSON(key)+':'+swiftJSON(object[key])).join(',')+'}';
}
/** `String.folding(options:.caseInsensitive, locale: en_US_POSIX)`: full Unicode case folding. */
export const swiftFold=(text:string)=>text.toUpperCase().toLowerCase();

/** Deterministic JSON for storage and change detection (sorted keys, standard escaping). */
export function stableJSON(value:unknown):string {
 return JSON.stringify(value,(_key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])):item);
}
export const sameJSON=(a:unknown,b:unknown)=>stableJSON(a)===stableJSON(b);
