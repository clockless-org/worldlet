// A QR code drawn in a terminal (`worldlet link --qr`), so the installer and an Agent can show the browser link as a
// code a phone scans without a network service or `qrencode`. Two modules per character with Unicode half blocks; the
// colors are set explicitly (white on black, as `qrencode -t ANSIUTF8` draws), so it scans on light and dark terminals.
import qrcode from 'qrcode-generator';

/** The QR code of `text` as terminal lines: dark modules black, light ones white, with a quiet zone of `margin`. */
export function terminalQr(text:string,margin=2):string[] {
 const qr=qrcode(0,'L');qr.addData(text,'Byte');qr.make();
 const size=qr.getModuleCount(),span=size+margin*2;
 const light=(row:number,column:number)=>row<margin||column<margin||row>=size+margin||column>=size+margin||!qr.isDark(row-margin,column-margin);
 const lines:string[]=[];
 for(let row=0;row<span;row+=2){
  let line='';
  for(let column=0;column<span;column++){
   const top=light(row,column),bottom=row+1<span?light(row+1,column):true;
   line+=top&&bottom?'█':top?'▀':bottom?'▄':' ';
  }
  // Foreground white on a black background, reset at the end of the line.
  lines.push('\u001b[37;40m'+line+'\u001b[0m');
 }
 return lines;
}
