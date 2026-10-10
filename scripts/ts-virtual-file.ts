import type ts from 'typescript';
/** Serve one in-memory file through a compiler host. TypeScript asks for files with '/' even on Windows,
 * where path.join gives '\', so both sides are compared in TypeScript's form. */
export function withVirtualFile(host:ts.CompilerHost,file:string,text:string):ts.CompilerHost {
 const same=(f:string)=>f.replace(/\\/g,'/')===file.replace(/\\/g,'/'),read=host.readFile,exists=host.fileExists;
 host.readFile=f=>same(f)?text:read(f);host.fileExists=f=>same(f)||exists(f);
 return host;
}
