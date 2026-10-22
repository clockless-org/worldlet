export function viewMode({depth,readerOpen=false,dialogOpen=false,dialogKind='detail'}){
 if(readerOpen||(dialogOpen&&dialogKind==='detail'))return 'inspect';
 return depth==='overview'?'overview':'focus';
}
