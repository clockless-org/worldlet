// Presentation only: local paths from either desktop must not depend on the
// operating system currently rendering the shared interface.
export function localPathName(value?:string){return (value||'').split(/[\\/]/).filter(Boolean).at(-1)||'';}
