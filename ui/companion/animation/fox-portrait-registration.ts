/** One immutable bind-pose framing for every renderer. Never fit per-frame
 * bounds: a raised arm or airborne pose must not shrink the character. */
export function foxPortraitRegistration(image:HTMLImageElement){
 const mask=document.createElement('canvas');mask.width=image.naturalWidth;mask.height=image.naturalHeight;
 const context=mask.getContext('2d',{willReadFrequently:true})!;
 context.drawImage(image,0,0);
 const pixels=context.getImageData(0,0,mask.width,mask.height).data;
 let bottom=-1;
 for(let y=0;y<mask.height;y++)for(let x=0;x<mask.width;x++)if(pixels[(y*mask.width+x)*4+3]>200)bottom=y;
 if(bottom<=0)throw Error('Fox portrait requires an opaque bind-pose footprint');
 const scale=310/(bottom/mask.height),offset=310-scale*bottom/mask.height;
 mask.width=mask.height=1;
 return {x:(320-scale)/2,y:offset,width:scale,height:scale};
}

export function drawRegisteredFox(ctx:CanvasRenderingContext2D,source:CanvasImageSource,frame:ReturnType<typeof foxPortraitRegistration>){
 ctx.clearRect(0,0,ctx.canvas.width,ctx.canvas.height);
 ctx.save();ctx.scale(ctx.canvas.width/320,ctx.canvas.height/320);
 ctx.drawImage(source,frame.x,frame.y,frame.width,frame.height);ctx.restore();
}
