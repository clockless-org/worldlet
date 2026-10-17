import {Text,type Sprite} from 'pixi.js';

/** A number drawn on a device's painted face (the board's north-star number, ui/applets/board/applet.md): where the
 * face is, as fractions of the device's whole picture, its centre and the most of the picture's width and height the
 * number may fill. Only devices named here carry one. */
export const DEVICE_FIGURE_FACES:Readonly<Record<string,{center:[number,number];size:[number,number]}>>=Object.freeze({board:{center:[.388,.405],size:[.3,.15]}});
export type DeviceFigure={text:string;tone?:'good'|'bad'};
const INK=0x3b3226,TONES={good:0x3d7a4c,bad:0xa54135};

/** Draws `figure` on the sprite's face, kept in step by `update`. The sprite's texture may be a crop of the picture
 * (an Area's close view), so the face is placed from the texture's frame within its source. */
export function attachDeviceFigure(sprite:Sprite,key:string){
 const face=DEVICE_FIGURE_FACES[key];if(!face||!sprite.parent)return null;
 const {source,frame}=sprite.texture;
 const x=((face.center[0]*source.width-frame.x)/frame.width-sprite.anchor.x)*sprite.width;
 const y=sprite.y+((face.center[1]*source.height-frame.y)/frame.height-sprite.anchor.y)*sprite.height;
 const most=[face.size[0]*source.width/frame.width*sprite.width,face.size[1]*source.height/frame.height*sprite.height];
 const text=new Text({text:'',style:{fontFamily:'Inter, system-ui, sans-serif',fontWeight:'700',fontSize:72,fill:INK},resolution:2});
 text.anchor.set(.5);text.position.set(x,y);text.eventMode='none';text.visible=false;text.label='device-figure';
 sprite.parent.addChild(text);
 let shown='';
 return {
  update(figure:DeviceFigure|undefined|null){
   const next=figure?.text?figure.text+'|'+(figure.tone||''):'';if(next===shown)return;shown=next;
   text.visible=!!next;if(!figure||!next)return;
   text.text=figure.text;text.style.fill=figure.tone?TONES[figure.tone]:INK;
   text.scale.set(1);text.scale.set(Math.min(most[0]/text.width,most[1]/text.height));
  },
  get text(){return shown?shown.split('|')[0]:'';},
  destroy(){text.destroy();},
 };
}
