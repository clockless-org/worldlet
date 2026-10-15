import type {SurfaceRect} from '../../../contracts/browser-surface.ts';
import {mountAppletScene,type AppletScene} from './applet-scene.ts';
/**
 * A theme scene behind the World's content panel (a website's page, a game's board): the painting frames the panel and
 * the panel takes the scene's primary region (applet-scene.css, keyed on the World's `data-panel-scene`). `sync(key)`
 * mounts `key`'s scene, swaps it when the key changes and removes it for an empty key.
 */
export function createPanelScene(content:HTMLElement){
 let scene:AppletScene|null=null,host:HTMLElement|null=null,shown='';
 function sync(key:string){
  const world=content.parentElement as HTMLElement|null;
  if(scene&&key===shown)return;
  if(scene){scene.destroy();scene=null;host?.remove();host=null;shown='';if(world)delete world.dataset.panelScene;}
  if(!key||!world)return;
  host=document.createElement('div');host.className='panel-scene';content.before(host);
  scene=mountAppletScene(host,key,{shell:world});scene.primary.element.setAttribute('aria-hidden','true');
  shown=key;world.dataset.panelScene=key;
 }
 return {sync,get scene(){return scene;},paperEdge:(rect:SurfaceRect)=>scene?.paperEdge(rect),destroy:()=>sync('')};
}
