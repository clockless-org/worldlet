import sharp from 'sharp';
// The opaque box (alpha > 32) of an encoded device image, in its own pixels: [left, top, right, bottom]
// inclusive. The World aligns each device's foot with it; measuring it here spares every launch a
// full-image readback and scan per device.
export async function paintedBox(image:Buffer){
 const {data,info}=await sharp(image).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 let left=info.width,top=info.height,right=-1,bottom=-1;
 for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++)if(data[(y*info.width+x)*info.channels+3]>32){if(x<left)left=x;if(x>right)right=x;if(y<top)top=y;bottom=y;}
 return [left,top,right,bottom,info.width,info.height];
}
