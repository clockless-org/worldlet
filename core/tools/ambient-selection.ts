/** Pure sound-selection policy. Scenery may replace the automatic backdrop, never a
 * person's explicit sound or their playback/volume choices. Selection is session-local. */
export function createAmbientSelection(){
 let backdrop='village',visible=true,manual:string|null=null;
 return {
  present(track:string,active:boolean){backdrop=track;visible=active;},
  choose(track:string){manual=track;},
  get current(){return {track:manual??backdrop,suspended:manual===null&&backdrop!=='village'&&!visible};}
 };
}
