export function musicReply(text,result){
 const zh=/[\u3400-\u9fff]/.test(text),volume=Math.round(result.volume*100),track=result.track||'Bridge at Dusk';
 if(result.channel==='ambience'){const title=({village:'村庄环境声',ocean:'海浪白噪音',rain:'雨声',forest:'林间环境声'})[result.trackID]||track;return result.state==='playing'?(zh?`正在播放${title}，音量 ${volume}%。`:`Playing ${track} · ${volume}% volume.`):(zh?`环境声已${result.state==='paused'?'暂停':'停止'}，音量 ${volume}%。`:`Ambience ${result.state} · ${volume}% volume.`);}
 if(result.source==='radio'){
  if(result.state==='playing')return zh?`正在播放电台 ${track}，音量 ${volume}%。`:`Playing radio ${track} · ${volume}% volume.`;
  if(['loading','buffering'].includes(result.state))return zh?'电台正在连接或缓冲，还没有开始播放。':'Radio is connecting or buffering; playback has not started.';
 }
 if(result.state==='playing')return zh?`正在播放内置氛围音乐《${track}》，音量 ${volume}%。`:`Playing ${track} · ${volume}% volume.`;
 if(result.state==='paused')return zh?`音乐已暂停，音量 ${volume}%。`:`Music paused · ${volume}% volume.`;
 return zh?`音乐已停止，音量 ${volume}%。`:`Music stopped · ${volume}% volume.`;
}
