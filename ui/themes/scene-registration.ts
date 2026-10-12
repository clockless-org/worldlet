import type {ThemeSceneRegistration} from './build-theme-contract.ts';
/** One uniform transform for the painting and its live HTML surface. A host may fill the outer margins itself;
 * it must not independently cover-crop the painting after using these coordinates. */
export function fitThemeScene(registration:ThemeSceneRegistration,width:number,height:number){
 if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)throw Error('Scene viewport must be positive');
 const [iw,ih]=registration.imageSize,scale=Math.min(width/iw,height/ih),w=iw*scale,h=ih*scale,x=(width-w)/2,y=(height-h)/2;
 const rect=([rx,ry,rw,rh]:readonly number[])=>({x:x+rx*w,y:y+ry*h,width:rw*w,height:rh*h});
 return {image:{x,y,width:w,height:h},regions:registration.regions.map(region=>({...region,...rect(region.rect)})),companion:rect(registration.companion),scale};
}
