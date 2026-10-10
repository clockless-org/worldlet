import {Container,Graphics} from 'pixi.js';

/** The small mark on the person's own Applets (core/applets/MY-APPLETS.md): a honey disc with a cream five-point star
 * at the device's lower right, sized to the device so it reads at every zoom without covering the painting. A star,
 * not a sparkle: a four-point sparkle this small reads as the areas' add buttons. */
export function myAppletMark(deviceWidth:number):Container {
 const r=Math.max(5,deviceWidth*.12),mark=new Container();
 const disc=new Graphics().circle(0,0,r+1.5).fill({color:0xfff8ea,alpha:.95}).circle(0,0,r).fill({color:0xd9a441}).stroke({color:0x6b5a3e,alpha:.5,width:1});
 const outer=r*.7,inner=outer*.42,points=Array.from({length:10},(_,i)=>{const a=-Math.PI/2+i*Math.PI/5,d=i%2?inner:outer;return [Math.cos(a)*d,Math.sin(a)*d+r*.04];}).flat();
 const star=new Graphics().poly(points).fill({color:0xfffaf0});
 mark.addChild(disc,star);mark.label='my-applet-mark';mark.eventMode='none';
 mark.position.set(deviceWidth*.36,-r*1.1);
 return mark;
}
