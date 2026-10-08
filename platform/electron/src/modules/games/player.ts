import {WebContentsView} from 'electron';
import {readMadeGameReport} from '../../../../../core/games/index.ts';
import {Surface} from '../browser/surface.ts';
import {closeGameView,gameURL,gameWebPreferences,lockGameContents,placeGameView} from './trial.ts';
import type {Row} from '../../host/types.ts';

/** The made game the Game Factory panel shows: a sibling view over the World at the rect the panel
 * reserves, never an iframe (the World page allows none). It has no host bridge; its only channel is
 * its own console lines, read for a best score. */
export class GamePlayer {
 private surface:Surface;
 private view:WebContentsView|null=null;
 private game='';
 private best:(id:string,score:number)=>void;
 constructor(surface:Surface,best:(id:string,score:number)=>void){this.surface=surface;this.best=best;}
 get current(){return this.game;}
 show(id:string,document:string,rect:Row){
  const parent=this.surface.parent();if(!parent)throw Error('The game window is unavailable.');
  this.stop();this.game=id;
  const view=new WebContentsView({webPreferences:gameWebPreferences()});
  view.setBorderRadius(12);view.setBackgroundColor('#20251d');
  const contents=view.webContents;
  lockGameContents(contents);
  contents.on('console-message',details=>{if(this.view!==view)return;const report=readMadeGameReport(details.message);if(typeof report?.best==='number')this.best(id,report.best);});
  this.view=view;parent.addChildView(view);
  void contents.loadURL(gameURL(document)).catch(()=>{});
  this.layout(rect);
 }
 layout(rect:Row){if(this.view)placeGameView(this.surface,this.view,rect);}
 stop(){
  const old=this.view;if(!old)return;
  this.view=null;this.game='';
  closeGameView(this.surface,old);
 }
}
