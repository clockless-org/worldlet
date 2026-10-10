import {WebContentsView} from 'electron';
import {readWidgetConsole,widgetDocument,type WidgetSeed} from '../../../../../core/artifacts/index.ts';
import {Surface} from '../browser/surface.ts';
import {closeGameView,gameURL,gameWebPreferences,lockGameContents,placeGameView} from '../games/trial.ts';
import type {Row} from '../../host/types.ts';

/** The widget the Widgets panel shows: a sibling view over the World at the rect the panel reserves, never an
 * iframe (the World page allows none), in the Game Factory's sandboxed session. It has no host bridge; its only
 * channel is its own console lines, read for its storage (kept and synced by the host) and where it is scrolled. */
export class WidgetPlayer {
 private surface:Surface;
 private view:WebContentsView|null=null;
 private widget='';
 private rect:Row={};
 private values='';
 private scrolls=new Map<string,number>();
 private report:(id:string,values:Record<string,string>)=>void;
 constructor(surface:Surface,report:(id:string,values:Record<string,string>)=>void){this.surface=surface;this.report=report;}
 get current(){return this.widget;}
 show(id:string,html:string,values:Record<string,string>,rect:Row){
  const parent=this.surface.parent();if(!parent)throw Error('This Applet’s window is unavailable.');
  this.stop();this.widget=id;this.rect=rect;this.values=JSON.stringify(values);
  const view=new WebContentsView({webPreferences:gameWebPreferences()});
  view.setBorderRadius(12);view.setBackgroundColor('#f6f0df');
  const contents=view.webContents;
  lockGameContents(contents);
  contents.on('console-message',details=>{
   if(this.view!==view)return;
   const report=readWidgetConsole(details.message);
   if(typeof report?.scroll==='number')this.scrolls.set(id,report.scroll);
   if(report?.state){this.values=JSON.stringify(report.state);this.report(id,report.state);}
  });
  this.view=view;parent.addChildView(view);
  const seed:WidgetSeed={state:values,scroll:this.scrolls.get(id)??0};
  void contents.loadURL(gameURL(widgetDocument(html,seed))).catch(()=>{});
  this.layout(rect);
 }
 /** The other side changed this widget's values (or its page): load it again with them, where it was scrolled. */
 refresh(id:string,html:string,values:Record<string,string>,{page=false}:{page?:boolean}={}){
  if(id!==this.widget||!this.view)return;
  if(!page&&JSON.stringify(values)===this.values)return;
  this.show(id,html,values,this.rect);
 }
 layout(rect:Row){if(this.view&&placeGameView(this.surface,this.view,rect))this.rect=rect;}
 stop(){
  const old=this.view;if(!old)return;
  this.view=null;this.widget='';
  closeGameView(this.surface,old);
 }
}
