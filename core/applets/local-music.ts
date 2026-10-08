// Local music players (owner Order 2026-10-07): what the computer itself says is playing, from any player
// (Apple Music, Spotify, 汽水音乐, QQ 音乐, a browser tab), and its play, pause and skip controls. The host
// reads the system's own now-playing record (MediaRemote on a Mac, the media transport controls on Windows);
// these rules turn what its helper prints into what the World shows. Nothing here touches files or apps.
// Worldlet's own sound (its radio, ambience and spoken replies play through a hidden Chromium page) is in
// that record too, and is never shown here: the World's sound line already controls it (owner Order
// 2026-10-08, when play and pause on that card went back to Worldlet itself and did nothing).

export const LOCAL_MUSIC_COMMANDS=['play','pause','toggle','next','previous'] as const;
export type LocalMusicCommand=typeof LOCAL_MUSIC_COMMANDS[number];
/** MediaRemote's own command numbers (MRMediaRemoteSendCommand). */
export const MEDIA_REMOTE_COMMANDS:Record<LocalMusicCommand,number>={play:0,pause:1,toggle:2,next:4,previous:5};
export const LOCAL_MUSIC_LIMITS={text:200,playlists:60,results:12,query:120,line:64_000} as const;
export const APPLE_MUSIC_BUNDLE='com.apple.Music';

export interface NowPlaying {
 /** The player's name as the system gives it, e.g. Music, Spotify, 汽水音乐. */
 app:string;
 /** The player's own identifier: a Mac bundle ID or a Windows app ID. */
 player:string;
 title:string;
 artist:string;
 album:string;
 playing:boolean;
 /** Apple Music also offers its playlists and library search. */
 appleMusic:boolean;
}
export interface LocalMusicState {
 /** False when this computer cannot say what is playing (an old macOS, Linux). */
 supported:boolean;
 nowPlaying:NowPlaying|null;
 revision:number;
}
export interface LocalPlaylist {id:string;name:string}
export interface LocalTrack {id:string;title:string;artist:string;album:string}

const clean=(value:unknown)=>typeof value==='string'?Array.from(value.replace(/[\u0000-\u001F\u007F]+/g,' ').trim()).slice(0,LOCAL_MUSIC_LIMITS.text).join(''):'';

// Windows names its players by app ID; the familiar ones get their own names.
const WINDOWS_PLAYERS:[RegExp,string][]=[
 [/^spotify/i,'Spotify'],[/zunemusic|microsoft\.media\.player/i,'Media Player'],[/applemusic/i,'Apple Music'],
 [/cloudmusic/i,'网易云音乐'],[/qqmusic/i,'QQ 音乐'],[/soda|qishui/i,'汽水音乐'],[/kugou/i,'酷狗音乐'],[/kwmusic|kuwo/i,'酷我音乐'],
 [/chrome/i,'Chrome'],[/msedge/i,'Edge'],[/firefox/i,'Firefox'],
];
/** A player's name: the system's display name, else one read from its ID. */
export function localPlayerName(app:unknown,player:unknown):string {
 const name=clean(app);if(name)return name;
 const id=clean(player);if(!id)return 'Music';
 for(const [pattern,known] of WINDOWS_PLAYERS)if(pattern.test(id))return known;
 const last=id.split('!').at(-1)!.split(/[\\/]/).at(-1)!.replace(/\.exe$/i,'');
 return last.split('.').at(-1)||'Music';
}

/** Worldlet itself, Worldlet Web, a development build or the Windows app: never an outside player. */
export const worldletPlayer=(player:string,title='')=>/^app\.worldlet(\.|$)/i.test(player)||/(^|[\\/!])worldlet( web)?(\.exe)?$/i.test(player)||title==='Worldlet media';

/** What a helper printed, as what is playing now; null when nothing is (or the line is not one). */
export function readNowPlaying(raw:unknown):NowPlaying|null {
 if(!raw||typeof raw!=='object'||Array.isArray(raw))return null;
 const row=raw as Record<string,unknown>;
 const title=clean(row.title);if(!title)return null;
 const player=clean(row.bundle??row.player);
 if(worldletPlayer(player,title))return null;
 return {app:localPlayerName(row.app,player),player,title,artist:clean(row.artist),album:clean(row.album),playing:row.playing===true,appleMusic:player===APPLE_MUSIC_BUNDLE};
}
/** The words on the World's sound line: the track, and who made it, else which player has it. */
export function nowPlayingLine(value:NowPlaying):{title:string;detail:string} {
 return {title:value.title,detail:value.artist&&value.artist!==value.title?value.artist:value.app};
}
export const localMusicCommand=(value:unknown):LocalMusicCommand|null=>LOCAL_MUSIC_COMMANDS.includes(value as LocalMusicCommand)?value as LocalMusicCommand:null;

export function readPlaylists(raw:unknown):LocalPlaylist[] {
 if(!Array.isArray(raw))return [];
 const seen=new Set<string>();
 return raw.flatMap(row=>{
  const id=clean(row?.id),name=clean(row?.name);
  if(!/^[0-9A-F]{16}$/.test(id)||!name||seen.has(id))return [];
  seen.add(id);return [{id,name}];
 }).slice(0,LOCAL_MUSIC_LIMITS.playlists);
}
export function readTracks(raw:unknown):LocalTrack[] {
 if(!Array.isArray(raw))return [];
 return raw.flatMap(row=>{
  const id=clean(row?.id),title=clean(row?.title);
  return /^[0-9A-F]{16}$/.test(id)&&title?[{id,title,artist:clean(row?.artist),album:clean(row?.album)}]:[];
 }).slice(0,LOCAL_MUSIC_LIMITS.results);
}
/** Words to look for in the Apple Music library: plain text, short. */
export function localMusicQuery(value:unknown):string|null {
 const text=clean(value);
 return text&&Array.from(text).length<=LOCAL_MUSIC_LIMITS.query?text:null;
}
