// Update channels (owner request 2026-10-04: pick in the app which stage an installed desktop app follows).
// They are the release stages of gatehouse/public/stages.mjs, in order of stability:
//  Dev         开发  every merge to main; only the development Mac runs it, from its checkout (scripts/dev-channel.ts)
//  Alpha       内测  each release candidate whose full checks, package smoke and update acceptance passed on 01/02;
//                    the same bytes a later release publishes, hours earlier (scripts/release-alpha.mjs)
//  Beta        公测  the releases at 00:00, 08:00 and 16:00 Pacific: the download and updates everyone has today
//  Production  正式  the public release; on the desktop the same releases as Beta (owner request 2026-10-06: each
//                    release goes to Beta and Production)
// Following a less stable channel only changes the feed. Following a more stable one installs that channel's newest
// build at the next update even when its Build is lower, then carries on from there.
// Who may switch (owner request 2026-10-05): only the owner. Worldlet has no accounts, so "the owner" is a computer
// enrolled with the admin service whose installed app holds that machine credential (the same check the Order
// button makes). Everyone else sees no switcher and follows Beta; a copy that followed Alpha moves back at its next update.
// The Dev app and the installed channels never switch into each other: the Dev app is its own bundle and library.
export type UpdateChannel='dev'|'alpha'|'beta'|'production';
export const UPDATE_CHANNELS:readonly {id:UpdateChannel;name:string;stage:string;summary:string}[]=[
 {id:'dev',name:'Dev',stage:'开发',summary:'Every change merged to main.'},
 {id:'alpha',name:'Alpha',stage:'内测',summary:'Each release candidate that passed its full checks, about every hour.'},
 {id:'beta',name:'Beta',stage:'公测',summary:'Releases at midnight, 8 AM and 4 PM Pacific.'},
 {id:'production',name:'Production',stage:'正式',summary:'The public release: the same releases as Beta.'},
];
export const DEFAULT_UPDATE_CHANNEL:UpdateChannel='beta';
export const isUpdateChannel=(value:unknown):value is UpdateChannel=>UPDATE_CHANNELS.some(c=>c.id===value);
const rank=(channel:UpdateChannel)=>UPDATE_CHANNELS.findIndex(c=>c.id===channel);

export type UpdateChannelOption={id:UpdateChannel;name:string;stage:string;summary:string;available:boolean;reason?:string};
type Who={dev:boolean;owner:boolean};
/** Whether Settings shows a channel switcher at all: only in an installed copy on the owner's computer. */
export const updateChannelSwitchable=({dev,owner}:Who)=>!dev&&owner;
/** The channels and whether each can be chosen. `dev` is true for the development Mac's Dev app, which follows main
 * from its checkout and nothing else; an installed app follows Alpha or Beta, Alpha only on the owner's computer. */
export function updateChannelOptions({dev,owner}:Who):UpdateChannelOption[] {
 return UPDATE_CHANNELS.map(c=>{
  const reason=dev?(c.id==='dev'?undefined:'The Dev app follows main from its checkout and never switches channel.')
   :c.id==='dev'?'Only the Dev app on the development Mac follows main; an installed app never switches to it.'
   :!owner&&c.id==='alpha'?'Only the owner’s computers can follow Alpha.':undefined;
  return {...c,available:!reason,...(reason?{reason}:{})};
 });
}
/** The saved channel an installed app follows; anything unknown or unavailable reads as Beta, and Alpha only counts
 * on the owner's computer. Beta and Production follow the same release feed. */
export function followedChannel(saved:unknown,owner:boolean):UpdateChannel {
 return saved==='beta'||saved==='production'||saved==='alpha'&&owner?saved:DEFAULT_UPDATE_CHANNEL;
}
/** Before each update check of an installed app: a saved Alpha off the owner's computer moves back to Beta, like a
 * switch to a steadier channel (Beta's newest installs even with a lower Build). Null when nothing changes. */
export function demotedChannel(saved:unknown,owner:boolean):{channel:UpdateChannel;allowLower:boolean}|null {
 return saved==='alpha'&&!owner?switchUpdateChannel('alpha','beta'):null;
}
/** Switching channels: `allowLower` when the new channel is more stable, so its newest build installs even with a
 * lower Build. */
export function switchUpdateChannel(from:UpdateChannel,to:UpdateChannel):{channel:UpdateChannel;allowLower:boolean} {
 return {channel:to,allowLower:rank(to)>rank(from)};
}
/** The Build to install from a channel's builds, or null. A newer Build always; with `allowLower` (just switched to
 * a more stable channel) the channel's newest even when lower. `settled` says the switch is done: the installed
 * Build is the channel's newest or older, so `allowLower` can be cleared. */
export function pickUpdate(builds:readonly number[],current:number,allowLower:boolean):{build:number|null;settled:boolean} {
 const newest=builds.length?Math.max(...builds):null;
 if(newest===null)return {build:null,settled:false};
 if(newest>current)return {build:newest,settled:true};
 if(newest<current&&allowLower)return {build:newest,settled:false};
 return {build:null,settled:true};
}
