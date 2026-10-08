"""Dependency-free source checks. Full compilation and runtime tests run manually."""
import ast
from concurrent.futures import ThreadPoolExecutor
import json
import os
from pathlib import Path
import shutil
import subprocess

root = Path(__file__).resolve().parents[1]


def run(*args, **options):
    subprocess.run(args, cwd=root, check=True, **options)


def bash():
    """A bash that can parse scripts. On Windows, `bash` on PATH may be the WSL launcher
    (System32 or WindowsApps), which fails where no Linux distribution is installed; use
    Git for Windows' bash there. Windows hosts may have no bash at all."""
    found = shutil.which('bash')
    if os.name != 'nt':
        return found
    if found and not any(part in found.lower() for part in ('\\system32\\', '\\windowsapps\\')):
        return found
    git = shutil.which('git')
    if git:
        top = Path(git).resolve().parent.parent
        return next((str(path) for path in (top / 'bin/bash.exe', top / 'usr/bin/bash.exe', top.parent / 'bin/bash.exe') if path.is_file()), None)


def check(name):
    file = root / name
    if file.suffix in {'.js', '.mjs'}:
        run('node', '--check', name)
    elif file.suffix == '.py':
        ast.parse(file.read_bytes(), filename=name)
    elif file.suffix == '.json':
        json.loads(file.read_text(encoding='utf-8'))
    elif file.suffix == '.sh' and shell:
        run(shell, '-n', name)


shell = bash()


if __name__ == '__main__':
    files = subprocess.check_output(['git', 'ls-files', '--cached', '--others', '--exclude-standard', '-z'], cwd=root).decode().split('\0')
    files = sorted({name for name in files if name and (root / name).is_file()})
    # Include new source paths during a refactor; exclude ignored dependencies and build output.
    with ThreadPoolExecutor(max_workers=4) as pool:
        list(pool.map(check, filter(None, files)))
    # Node's own stripper parses every TypeScript file the way the runtime does, in one
    # process, and throws on syntax it cannot erase. `node --check` is no use here: it
    # settles CommonJS or ESM on the raw source, so a type annotation ahead of the first
    # import reads as plain JavaScript and fails. The list goes through stdin: as arguments
    # it outgrows the Windows command line.
    typescript = [name for name in files if name.endswith('.ts')]
    run('node', '--no-warnings', '-e',
        "const {stripTypeScriptTypes}=require('node:module'),{readFileSync}=require('fs');"
        "for(const file of readFileSync(0,'utf8').split('\\n').filter(Boolean))try{stripTypeScriptTypes(readFileSync(file,'utf8'))}catch(error){error.message=file+': '+error.message;throw error}",
        input='\n'.join(typescript).encode())
    print('PASS TypeScript, JavaScript, Python, JSON and shell syntax; no build or dependency downloads.')
