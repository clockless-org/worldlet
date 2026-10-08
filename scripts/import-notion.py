#!/usr/bin/env python3
"""Import a Notion Markdown & CSV export into an isolated, local-only source.

No network calls. Originals and a coverage manifest stay outside the web build.
Usage: python3 scripts/import-notion.py EXPORT.zip --workspace NAME
"""
import argparse, csv, hashlib, io, json, os, re, shutil, stat, tempfile, zipfile
from pathlib import Path, PurePosixPath
from datetime import datetime, timezone
from urllib.parse import unquote, urlsplit
import posixpath

ID = re.compile(r'([a-f0-9]{32})(?:_all)?$', re.I)

def page_id(path):
    found = ID.search(Path(path).stem)
    return found.group(1).lower() if found else hashlib.sha256(str(path).encode()).hexdigest()[:32]

def clean_title(path):
    return re.sub(r'\s+[a-f0-9]{32}(?:_all)?$', '', Path(path).stem, flags=re.I)

def markdown_links(text):
    """Scan destinations with balanced parentheses, as used in exported filenames."""
    for match in re.finditer(r'(!?)\[[^\]\n]*\]\(', text):
        start = match.end(); i = start; depth = 1
        while i < len(text) and text[i] != '\n':
            if text[i] == '\\': i += 2; continue
            if text[i] == '(': depth += 1
            if text[i] == ')':
                depth -= 1
                if not depth: break
            i += 1
        if depth == 0:
            destination = text[start:i].strip()
            if destination.startswith('<'): destination = destination[1:destination.find('>')]
            else: destination = re.split(r'\s+["\']', destination, maxsplit=1)[0]
            yield match.group(1), destination

def extract(archive, destination, max_bytes=None):
    destination.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(archive) as z:
        entries = [i for i in z.infolist() if not i.is_dir()]
        size = sum(i.file_size for i in entries)
        excluded = []
        selected = {i.filename for i in entries}
        if max_bytes:
            documents = [i for i in entries if Path(i.filename).suffix.lower() in ('.md','.csv')]
            # Reserve space for the searchable index, path metadata and original text.
            available = max_bytes - sum(i.file_size for i in documents) * 5 - 8_000_000
            if available < 0: raise ValueError('All note text and index cannot fit the requested experiment budget')
            selected = {i.filename for i in documents}
            media = [i for i in entries if i.filename not in selected]
            def priority(i):
                ext = Path(i.filename).suffix.lower()
                return (0 if ext in ('.png','.jpg','.jpeg','.webp','.gif') else 1 if ext in ('.pdf','.txt') else 2, i.file_size)
            for item in sorted(media,key=priority):
                if item.file_size <= available:
                    selected.add(item.filename);available-=item.file_size
                else: excluded.append({'path': item.filename, 'bytes': item.file_size, 'reason': 'experiment-budget'})
            size = sum(i.file_size for i in entries if i.filename in selected)
        if size > 32 * 1024**3 or size * 1.2 > shutil.disk_usage(destination).free:
            raise ValueError('Export exceeds the 32 GB import limit or available disk space')
        for item in z.infolist():
            name = PurePosixPath(item.filename)
            if name.is_absolute() or '../' in name.parts or '\\' in item.filename:
                raise ValueError('Unsafe archive path')
            if stat.S_ISLNK(item.external_attr >> 16):
                raise ValueError('Archive contains symlink')
            if not item.is_dir() and item.filename not in selected: continue
            target = destination.joinpath(*name.parts)
            if item.is_dir():
                target.mkdir(parents=True, exist_ok=True)
            else:
                target.parent.mkdir(parents=True, exist_ok=True)
                with z.open(item) as src, target.open('wb') as out:
                    shutil.copyfileobj(src, out)
        return {'excludedAssets': excluded, 'exportFiles': len(entries), 'exportBytes': sum(i.file_size for i in entries), 'selectedBytes': size}

def index_export(directory, workspace):
    files = sorted(p for p in directory.rglob('*') if p.is_file() and '__MACOSX' not in p.parts and not p.name.startswith('.'))
    pages, assets, problems = {}, [], []
    for f in files:
        rel = f.relative_to(directory).as_posix()
        if f.suffix.lower() not in ('.md', '.csv'):
            assets.append({'path': rel, 'bytes': f.stat().st_size})
            continue
        ident = page_id(f)
        content = f.read_text(encoding='utf-8-sig')
        record = pages.setdefault(ident, {'id': ident, 'title': clean_title(f), 'paths': [], 'children': [], 'parent': None, 'url': 'https://www.notion.so/' + ident})
        record['paths'].append(rel)
        record.setdefault('path', rel)
        if f.suffix.lower() == '.md':
            record['markdown'] = content
            record['path'] = rel
            heading = re.match(r'^#\s+(.+)', content)
            if heading: record['title'] = heading.group(1)
        else:
            rows = list(csv.reader(io.StringIO(content)))
            table = {'columns': rows[0] if rows else [], 'rows': rows[1:] if rows else [], 'path': rel}
            if len(table['rows']) >= len(record.get('table', {}).get('rows', [])):
                record['table'] = table
            record['kind'] = 'database'
        record.setdefault('kind', 'page')
    # Both export layouts exist: ID-suffixed folders and title-only folders.
    directory_pages = {}
    for p in pages.values():
        for original in p['paths']:
            directory_pages[str(PurePosixPath(original).parent / clean_title(original))] = p['id']
    for p in pages.values():
        for parent in PurePosixPath(p['path']).parents:
            match = ID.search(parent.name)
            candidate = match.group(1).lower() if match else directory_pages.get(str(parent))
            if candidate in pages and candidate != p['id']:
                p['parent'] = candidate
                break
        if p['parent']: pages[p['parent']]['children'].append(p['id'])
        p['text'] = re.sub(r'\s+', ' ', p.get('markdown', '') + ' ' + ' '.join(' '.join(r) for r in p.get('table', {}).get('rows', [])))
    roots = [p['id'] for p in pages.values() if not p['parent']]
    for p in pages.values():
        p['children'].sort(key=lambda i: pages[i]['title'].casefold())
    known = {f.relative_to(directory).as_posix() for f in files}
    references, missing, external_images = [], [], []
    for p in pages.values():
        for image, href in markdown_links(p.get('markdown', '')):
            href = href.strip('<>')
            if re.match(r'^[a-z][a-z\d+.-]*:', href, re.I):
                if image: external_images.append({'page': p['id'], 'url': href})
                continue
            if href.startswith('#'): continue
            target = posixpath.normpath(posixpath.join(posixpath.dirname(p['path']), unquote(urlsplit(href).path)))
            reference = {'page': p['id'], 'target': target, 'image': bool(image)}
            references.append(reference)
            if target not in known: missing.append(reference)
    if missing: problems.append(f'{len(missing)} local link targets were not found in the export; see missingReferences.')
    if external_images: problems.append(f'{len(external_images)} external image references are not downloaded automatically.')
    return {'version': 1, 'workspace': workspace, 'importedAt': datetime.now(timezone.utc).isoformat(), 'mode': 'local-export', 'roots': roots, 'pages': list(pages.values()), 'assets': assets,
            'missingReferences': missing, 'externalImages': external_images,
            'coverage': {'pages': len(pages), 'databases': sum(p['kind']=='database' for p in pages.values()), 'rows': sum(len(p.get('table',{}).get('rows',[])) for p in pages.values()), 'assets': len(assets), 'files': len(files), 'localReferences': len(references), 'missingReferences': len(missing), 'externalImages': len(external_images), 'problems': problems, 'scope': 'Exported root and all included descendants; workspace coverage must be checked against Notion.'}}

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('archive', type=Path)
    parser.add_argument('--workspace', required=True)
    parser.add_argument('--max-mb', type=int, help='Experiment budget in decimal MB; keep all note text before selecting attachments')
    parser.add_argument('--output', type=Path, default=Path(__file__).resolve().parent.parent / '.local/notion')
    args = parser.parse_args()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=args.output.parent, prefix='notion-import-') as temp:
        stage = Path(temp)
        originals = stage / 'files'
        originals.mkdir()
        if args.archive.is_dir():
            for f in args.archive.rglob('*'):
                if f.is_symlink(): raise ValueError('Symlinks are not allowed')
            shutil.copytree(args.archive, originals, dirs_exist_ok=True)
        else: selection = extract(args.archive, originals, args.max_mb * 1_000_000 if args.max_mb else None)
        manifest = index_export(originals, args.workspace)
        if not args.archive.is_dir():
            manifest['excludedAssets'] = selection['excludedAssets']
            manifest['coverage'].update({k:v for k,v in selection.items() if k != 'excludedAssets'})
            manifest['coverage']['excludedAssets'] = len(selection['excludedAssets'])
            omitted = {a['path'] for a in selection['excludedAssets']}
            original_missing = manifest['missingReferences']
            manifest['missingReferences'] = [r for r in original_missing if r['target'] not in omitted]
            manifest['coverage']['budgetOmittedReferences'] = len(original_missing) - len(manifest['missingReferences'])
            manifest['coverage']['missingReferences'] = len(manifest['missingReferences'])
            manifest['coverage']['problems'] = [p for p in manifest['coverage']['problems'] if 'local link targets' not in p]
            if manifest['missingReferences']: manifest['coverage']['problems'].append(f"{len(manifest['missingReferences'])} local link targets were not found in the export.")
        if args.max_mb:
            manifest['coverage']['experimentBudgetMB'] = args.max_mb
            manifest['coverage']['scope'] = f'{args.max_mb} MB 实验：保留导出中的全部 Markdown 与 CSV，并优先纳入图片和较小附件。超出额度的附件保留原条目，可从 Notion 原页查看。'
        (stage / 'index.json').write_text(json.dumps(manifest, ensure_ascii=False), encoding='utf-8')
        total = sum(f.stat().st_size for f in stage.rglob('*') if f.is_file())
        if args.max_mb and total > args.max_mb*1_000_000: raise ValueError('Index and files exceed the requested budget')
        if args.output.exists():
            backup = args.output.with_name('notion-backup-' + datetime.now().strftime('%Y%m%d-%H%M%S'))
            args.output.rename(backup)
        stage.rename(args.output)
        os.chmod(args.output, 0o700)
        print(json.dumps(manifest['coverage'], ensure_ascii=False))
        print('Local source:', args.output)

if __name__ == '__main__': main()
