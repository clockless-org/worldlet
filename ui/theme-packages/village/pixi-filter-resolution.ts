// Pixi 8.21 retains filter-stack textures after the render-target pool retires
// them during resize. Its resolution lookup dereferences a disposed source.
// Keep this guard local to our renderer; remove when the pinned Pixi fixes it.
export function guardFilterResolution(filter:any){
 const lookup=filter._findFilterResolution;
 if(typeof lookup!=='function')return;
 filter._findFilterResolution=function(rootResolution:number){
  let index=this._filterStackIndex-1;
  while(index>0&&this._filterStack[index]?.skip)index--;
  const texture=index>0?this._filterStack[index]?.inputTexture:null;
  if(texture&&!texture.source)return rootResolution;
  return lookup.call(this,rootResolution);
 };
}
