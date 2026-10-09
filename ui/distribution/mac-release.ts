import {displayReleaseVersion} from './release-version.ts';
// Both the demo and optional download page use the notarized Sparkle release feed.
export async function latestMacRelease(arch: 'arm64' | 'x86_64' = 'arm64') {
  const feed = arch === 'arm64' ? '/downloads/appcast.xml' : '/downloads/appcast-intel.xml';
  const response = await fetch(feed, {cache: 'no-store', signal: AbortSignal.timeout(8000)});
  if (!response.ok) throw new Error('Release feed unavailable');
  const xml = new DOMParser().parseFromString(await response.text(), 'application/xml');
  if (xml.querySelector('parsererror')) throw new Error('Invalid release feed');
  const trustedOrigins = new Set([location.origin, 'https://worldlet.ai', 'https://worldlet.dev', 'https://worldlet.clockless.workers.dev']);
  const ns = 'http://www.andymatuschak.org/xml-namespaces/sparkle';
  const releases = [...xml.querySelectorAll('item')].flatMap(item => {
    try {
      const enclosure = item.querySelector('enclosure');
      let url = new URL(enclosure.getAttribute('url'));
      // CI Builds' feeds point at this repository's GitHub Release (docs/RELEASING.md); the website's /downloads/ forwards
      // there by file name, so the same file is offered at its same-origin address.
      const github = /^\/clockless-org\/worldlet\/releases\/download\/v[\d.]+\/(Worldlet-[^/]+)$/.exec(url.origin === 'https://github.com' ? url.pathname : '');
      if (github && !url.search && !url.hash) url = new URL('/downloads/' + github[1], location.origin);
      if (!trustedOrigins.has(url.origin) || url.username || url.password || url.search || url.hash || !/^\/downloads\/Worldlet-\d+\.\d+\.\d+-\d+(?:\.\d+){0,2}-macos-(arm64|x86_64|universal)\.(?:dmg|zip)$/.test(url.pathname) || !(url.pathname.endsWith('-macos-universal.dmg') || url.pathname.endsWith(`-macos-${arch}.dmg`))) return [];
      const version = item.getElementsByTagNameNS(ns, 'shortVersionString')[0]?.textContent || '';
      const build = item.getElementsByTagNameNS(ns, 'version')[0]?.textContent || url.pathname.match(/-(\d+(?:\.\d+){0,2})-macos-/)[1];
      const minimum = item.getElementsByTagNameNS(ns, 'minimumSystemVersion')[0]?.textContent?.trim();
      const minimumSystemVersion = /^\d+(?:\.\d+){0,2}$/.test(minimum || '') ? minimum : '14.0';
      // The production hosts serve the same release bucket. Keep downloads same-origin.
      return [{url: new URL(url.pathname, location.origin).href, version, build, minimumSystemVersion}];
    } catch { return []; }
  });
  return releases.sort((a,b) => b.build.localeCompare(a.build, 'en', {numeric:true}))[0] || null;
}

export function mountMacDownload(root) {
  const entry = document.createElement('div');
  entry.className = 'demo-mac-download';
  const link = document.createElement('a');
  link.className = 'demo-mac-link';
  link.innerHTML = '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12m-4-4 4 4 4-4M5 16v4h14v-4"/></svg><span>Download for Mac</span>';
  link.href='/download/';
  const status = document.createElement('small');
  status.id = 'macDownloadStatus';
  status.textContent = 'Checking release…';
  link.setAttribute('aria-describedby',status.id);
  entry.append(link,status);root.append(entry);
  latestMacRelease().then(release => {
    if (!release) {status.textContent='Coming soon';return;}
    const universal=release.url.endsWith('-macos-universal.dmg');
    status.textContent = `${release.version ? 'v'+displayReleaseVersion(release.version,release.build) : ''}${universal?' · Apple silicon & Intel':' · Choose your Mac chip'}`;
    link.title=`macOS ${release.minimumSystemVersion} or later${universal?' · Apple silicon & Intel':' · Choose your Mac chip'}`;
  }).catch(() => {status.textContent='Download unavailable';});
  return entry;
}
