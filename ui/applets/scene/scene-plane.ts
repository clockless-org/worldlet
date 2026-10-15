import type {ThemeSceneRegistration} from '../../themes/index.ts';
/** Project real HTML onto a measured convex paper plane. CSS also inverse-maps pointer hit testing. */
export function scenePlaneTransform(quad:NonNullable<ThemeSceneRegistration['regions'][number]['quad']>,width:number,height:number){
 const [[x0,y0],[x1,y1],[x2,y2],[x3,y3]]=quad.map(([x,y])=>[x*width,y*height]);
 const dx1=x1-x2,dx2=x3-x2,dx3=x0-x1+x2-x3,dy1=y1-y2,dy2=y3-y2,dy3=y0-y1+y2-y3;
 const denominator=dx1*dy2-dx2*dy1,g=(dx3*dy2-dx2*dy3)/denominator,h=(dx1*dy3-dx3*dy1)/denominator;
 return 'matrix3d('+[(x1-x0+g*x1)/width,(y1-y0+g*y1)/width,0,g/width,(x3-x0+h*x3)/height,(y3-y0+h*y3)/height,0,h/height,0,0,1,0,x0,y0,0,1].join(',')+')';
}
