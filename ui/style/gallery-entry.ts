import {mountUIGallery} from './gallery.ts';
import {prepareUIFonts} from './tokens.ts';
const host=document.querySelector('#uiGallery');
if(host)void prepareUIFonts().then(()=>mountUIGallery(host));
