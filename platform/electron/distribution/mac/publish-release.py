"""Publish a notarized artifact first, then atomically replace its appcast."""
import argparse, copy, email.utils, hashlib, json, pathlib, plistlib, subprocess, sys, tempfile, zipfile, xml.etree.ElementTree as ET
import os
from release_feed import publication_state, version
from publication_config import publication_config
from release_mount import release_mount
tool_root = pathlib.Path(__file__).resolve().parents[4]
parser = argparse.ArgumentParser()
parser.add_argument('artifact')
parser.add_argument('--artifact-root', type=pathlib.Path, default=tool_root, help='Release checkout that built the artifact; never changes its identity or files')
parser.add_argument('--mounted-dmg', type=pathlib.Path, help='Explicit existing read-only mount of this exact candidate DMG')
args = parser.parse_args()
root = args.artifact_root.resolve()
# Preserve the signed candidate's update identity; route all writes through reviewed storage.
config = publication_config(
    json.loads((root / 'platform/electron/distribution/Updates.json').read_text()),
    json.loads((tool_root / 'platform/electron/distribution/Updates.json').read_text()))
dmg = pathlib.Path(args.artifact).resolve()
arch = dmg.parent.name
assert arch == 'universal' and dmg.parent.parent == root / 'dist/releases' and dmg.suffix in {'.dmg','.zip'}
feed_urls = (config['feedURL'], config['intelFeedURL'])
feed_url = config['feedURL']
assert dmg.name.endswith(f'-macos-{arch}{dmg.suffix}')
if dmg.suffix == '.dmg':
    assert json.loads(pathlib.Path(str(dmg)+'.notary.json').read_text())['status'] == 'Accepted'
    subprocess.run(['xcrun','stapler','validate',str(dmg)], check=True)
    subprocess.run(['codesign','--verify',str(dmg)], check=True)
    subprocess.run(['spctl','--assess','--type','open','--context','context:primary-signature',str(dmg)],check=True)
    # Validate the app users will actually drag out of the mounted installer.
    digest = hashlib.sha256()
    with open(dmg, 'rb') as stream:
        for chunk in iter(lambda: stream.read(1 << 20), b''):
            digest.update(chunk)
    with release_mount(dmg, args.mounted_dmg, digest.hexdigest()) as mount:
        app=pathlib.Path(mount)/'Worldlet.app'
        subprocess.run(['xcrun','stapler','validate',str(app)],check=True)
        subprocess.run(['codesign','--verify','--deep','--strict',str(app)],check=True)
        subprocess.run([sys.executable,str(root/'platform/electron/distribution/mac/bundle-portability.py'),str(app)],check=True)
        subprocess.run(['spctl','--assess','--type','execute',str(app)],check=True)
        info=plistlib.loads((app/'Contents/Info.plist').read_bytes())
        assert info['CFBundleIdentifier']=='app.worldlet.mac'
        assert info['SUPublicEDKey']==config['publicKey'] and info['SUFeedURL'] in feed_urls
        assert dmg.name==f"Worldlet-{info['CFBundleShortVersionString']}-{info['CFBundleVersion']}-macos-{arch}.dmg"
        for binary in ('Contents/MacOS/Worldlet','Contents/Resources/stripe','Contents/Resources/HermesBootstrap/uv','Contents/Resources/agent-browser'):
            for cpu in ('arm64','x86_64'):
                subprocess.run(['lipo','-verify_arch',cpu,str(app/binary)],check=True)
        assert (pathlib.Path(mount)/'Applications').is_symlink()
        assert (pathlib.Path(mount)/'.background'/'background.png').is_file()
        assert (pathlib.Path(mount)/'.DS_Store').is_file()

else:
    # ZIP tickets live on the enclosed app, so validate the actual extracted release.
    with zipfile.ZipFile(dmg) as archive:
        assert len(archive.infolist()) < 20000
        assert sum(i.file_size for i in archive.infolist()) < 500_000_000
        for item in archive.infolist():
            path=pathlib.PurePosixPath(item.filename)
            assert not path.is_absolute() and '../' not in path.parts
            assert path.parts[0] in {'Worldlet.app','__MACOSX'}
    with tempfile.TemporaryDirectory(prefix='worldlet-verify-') as temp:
        subprocess.run(['ditto','-x','-k',str(dmg),temp],check=True)
        app=pathlib.Path(temp)/'Worldlet.app'
        subprocess.run(['xcrun','stapler','validate',str(app)],check=True)
        subprocess.run(['codesign','--verify','--deep','--strict',str(app)],check=True)
        subprocess.run([sys.executable,str(root/'platform/electron/distribution/mac/bundle-portability.py'),str(app)],check=True)
        subprocess.run(['xcrun','syspolicy_check','distribution',str(app)],check=True)
        subprocess.run(['spctl','--assess','--type','execute',str(app)],check=True)
        info=plistlib.loads((app/'Contents/Info.plist').read_bytes())
        assert info['CFBundleIdentifier']=='app.worldlet.mac'
        assert info['SUPublicEDKey']==config['publicKey'] and info['SUFeedURL'] in feed_urls
        assert dmg.name==f"Worldlet-{info['CFBundleShortVersionString']}-{info['CFBundleVersion']}-macos-{arch}.zip"

feed = dmg.parent / 'appcast.xml'
channel = ET.parse(feed).getroot().find('channel')
namespace = '{http://www.andymatuschak.org/xml-namespaces/sparkle}'
prefix = feed_url.rsplit('/',1)[0]+'/'
items = channel.findall('item')
target = next(item for item in items if item.find('enclosure').get('url') == prefix+dmg.name)
enclosure = target.find('enclosure')
assert int(enclosure.get('length')) == dmg.stat().st_size
assert enclosure.get(namespace+'edSignature')
tools = pathlib.Path(subprocess.check_output(['node', str(tool_root/'scripts/sparkle-tools.ts')], text=True).strip())
sparkle_key = os.environ.get('WORLDLET_SPARKLE_KEY_FILE')
key_args = ['--ed-key-file', sparkle_key] if sparkle_key else ['--account', config['keychainAccount']]
subprocess.run([str(tools/'sign_update'),*key_args,'--verify',str(dmg),enclosure.get(namespace+'edSignature')],check=True)
bucket = config['bucket']
def cli(*args):
    return subprocess.run(['npx','wrangler','r2','object',*args,'--remote'],cwd=root,check=True)
# With R2 S3 credentials (the Mac release host) every object goes through S3; Wrangler OAuth is the fallback.
s3 = bool(os.environ.get('AWS_ACCESS_KEY_ID'))
def s3_object(*args):
    return subprocess.run(['node', str(tool_root/'scripts/r2-object-upload.mjs'), *args], cwd=root, check=True)
with tempfile.TemporaryDirectory(prefix='worldlet-publish-') as temp:
    # No credentials, user library or arbitrary files are part of the upload set.
    # Download the current feed to prevent a release from rolling clients back.
    # These reads are idempotent GETs: --retry alone skips TLS/connection resets (curl 35/56).
    publication = []
    for index, url in enumerate(feed_urls):
        current = pathlib.Path(temp)/f'current-{index}.xml'
        subprocess.run(['curl','--location','--proto-redir','=https','--retry','3','--retry-all-errors','--fail','--silent','--show-error','--proto','=https','--tlsv1.2','--max-time','30','--max-filesize','1000000',url,'--output',str(current)],check=True)
        old = ET.parse(current).getroot().findall('channel/item')
        # An itemless feed is the Worker's placeholder for a missing R2 object;
        # replacing it would silently drop every published entry.
        if not old and os.environ.get('WORLDLET_ALLOW_EMPTY_FEED') != '1':
            raise SystemExit(f'{url} lists no releases (placeholder feed?). Restore the appcast, or set WORLDLET_ALLOW_EMPTY_FEED=1 for a first release.')
        state = publication_state(old,target)
        publication.append((index, old, state))
    if any(state == 'retry' for _,_,state in publication):
        checksum=pathlib.Path(temp)/'published.sha256'
        subprocess.run(['curl','--location','--proto-redir','=https','--retry','3','--retry-all-errors','--fail','--silent','--show-error','--proto','=https','--tlsv1.2','--max-time','30','--max-filesize','2048',prefix+dmg.name+'.sha256','--output',str(checksum)],check=True)
        assert checksum.read_text().split()[0]==hashlib.sha256(dmg.read_bytes()).hexdigest(), 'Published checksum differs.'
    else:
        if dmg.suffix == '.dmg':
            subprocess.run(['node', str(tool_root/'scripts/r2-object-upload.mjs'), '--upload', str(dmg)], cwd=root, check=True)
        else:
            cli('put',bucket+'/'+dmg.name,'--file',str(dmg),'--content-type','application/zip')
        if s3 and dmg.suffix == '.dmg':
            s3_object('--upload', str(dmg)+'.sha256')
        else:
            cli('put',bucket+'/'+dmg.name+'.sha256','--file',str(dmg)+'.sha256','--content-type','text/plain')
    published_at = email.utils.formatdate(localtime=True)
    for index, old, state in publication:
        if state == 'retry':
            continue
        # Retain each feed's own historical entries; existing Intel clients
        # keep their URL, while both feeds gain the same new universal build.
        public = pathlib.Path(temp)/f'public-appcast-{index}.xml'
        public_channel = copy.deepcopy(channel)
        for item in list(public_channel.findall('item')):
            if item.find('enclosure').get('url') != prefix+dmg.name: public_channel.remove(item)
        # The item's date is its publication (#1156): generate_appcast stamped the RC package build, which can be hours earlier.
        for item in public_channel.findall('item'):
            stamp = item.find('pubDate')
            if stamp is None: stamp = ET.SubElement(item, 'pubDate')
            stamp.text = published_at
        known = {version(target)}
        for item in old:
            if version(item) not in known: public_channel.append(item)
        document=ET.Element('rss',{'version':'2.0'});document.append(public_channel)
        ET.register_namespace('sparkle','http://www.andymatuschak.org/xml-namespaces/sparkle')
        ET.ElementTree(document).write(public,encoding='utf-8',xml_declaration=True)
        key = 'appcast.xml' if index==0 else 'appcast-intel.xml'
        if s3:
            s3_object('--put-feed', key, str(public))
        else:
            cli('put',bucket+'/'+key,'--file',str(public),'--content-type','application/rss+xml')
    print('Published',prefix+dmg.name)
