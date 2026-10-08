/** Phone apps on the download page. Each shows "Coming soon" until its link is set here: the iPhone TestFlight public
 * link (App Store Connect → TestFlight → an external testing group → Public Link) and the Android Play testing link
 * or APK. Setting one turns its "Coming soon" into a button; a public beta (`beta`) says "Join beta" instead of "Get". */
export const phoneApps:readonly {id:'iphone'|'android',url:string|null,beta?:boolean}[]=[
 // TestFlight public beta, External Group (Kelvin 2026-10-04): every TestFlight upload goes to it.
 {id:'iphone',url:'https://testflight.apple.com/join/MMVkBW8c',beta:true},
 {id:'android',url:null},
];
/** The system a website visitor is on, from the browser's user agent. Phones are told apart first (Android's user agent
 * also says Linux, an iPhone's says "like Mac OS X"): a phone never gets the Mac installer or the Store button (owner
 * meeting 2026-09-26: a guest on a Samsung phone was told to download for Mac). An iPad asks for the desktop site and
 * reads as a Mac. Everything else gets the Mac installer, as before. */
export function visitorSystem(userAgent:string):'windows'|'iphone'|'android'|'mac'{
 if(/Android/i.test(userAgent))return 'android';
 if(/iPhone|iPod/i.test(userAgent))return 'iphone';
 return /Windows/i.test(userAgent)?'windows':'mac';
}
