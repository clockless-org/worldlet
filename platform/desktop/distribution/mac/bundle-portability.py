"""Reject development-machine load paths in every shipped Mach-O, even on the build Mac."""
import pathlib,plistlib,re,subprocess,sys
root=pathlib.Path(sys.argv[1]).resolve()
fix='--prepare' in sys.argv
info=root/'Contents/Info.plist'
minimum=plistlib.loads(info.read_bytes()).get('LSMinimumSystemVersion') if info.exists() else None
def version(value):
    parts=tuple(map(int,value.split('.')))
    return parts+(0,)*(3-len(parts))
magic={bytes.fromhex(x) for x in ['cffaedfe','feedfacf','cafebabe','bebafeca','cafebabf','bfbafeca']}
count=0
for file in root.rglob('*'):
    if not file.is_file() or file.is_symlink():continue
    with file.open('rb') as stream:
        if stream.read(4) not in magic:continue
    count+=1
    # otool treats a trailing '(Renderer)' as archive-member syntax. An open
    # descriptor inspects the same binary without reinterpreting its file name.
    with file.open('rb') as stream:
        out=subprocess.check_output(['otool','-l',f'/dev/fd/{stream.fileno()}'],pass_fds=(stream.fileno(),),text=True)
    if minimum:
        targets=re.findall(r'cmd LC_BUILD_VERSION\n.*?\n\s+minos ([0-9.]+)',out,re.S)
        targets+=re.findall(r'cmd LC_VERSION_MIN_MACOSX\n\s+cmdsize \d+\n\s+version ([0-9.]+)',out)
        for target in targets:
            assert version(target)<=version(minimum), f'{file.relative_to(root)} requires macOS {target}, above advertised {minimum}'
    paths=re.findall(r'cmd LC_RPATH\n\s+cmdsize \d+\n\s+path (.+) \(offset',out)
    for path in set(paths):
        system=path.startswith(('/usr/lib/','/System/Library/'))
        relative=path.startswith(('@loader_path','@executable_path'))
        if fix and '.xctoolchain/' in path and path.startswith('/Applications/Xcode'):
            subprocess.run(['xcrun','install_name_tool','-delete_rpath',path,str(file)],check=True)
            print('Removed build-toolchain search path:',file.relative_to(root))
            continue
        assert system or relative, f'Nonportable rpath in {file.relative_to(root)}: {path}'
        if relative:
            # Relative search roots may not escape the app bundle. For helper executables,
            # @executable_path has the same directory as @loader_path.
            resolved=pathlib.Path(path.replace('@loader_path',str(file.parent)).replace('@executable_path',str(file.parent))).resolve()
            assert resolved==root or root in resolved.parents, f'Rpath escapes bundle: {path}'
    loads=re.findall(r'cmd LC_(?:LOAD_DYLIB|LOAD_WEAK_DYLIB|REEXPORT_DYLIB)\n\s+cmdsize \d+\n\s+name (.+) \(offset',out)
    for path in loads:
        assert path.startswith(('/usr/lib/','/System/Library/','@rpath/','@loader_path/','@executable_path/')), f'External library: {path}'
assert count, 'No Mach-O binaries in bundle'
print(f'PASS portable load paths across {count} Mach-O binaries')
