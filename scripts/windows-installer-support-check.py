"""Synthetic only: never installs, reads a registry or touches an existing profile."""
import contextlib
import io
import json
from pathlib import Path
import sys
import tempfile
import unittest
from windows_installer_support import MARKER, budget, run_checked, validate_resume, preserve_caches, validate_marker

class Checks(unittest.TestCase):
    def test_bounded_budgets(self):
        self.assertEqual(budget(['app', '--smoke-check']), 600)
        self.assertEqual(budget(['setup', '/S']), 180)
        self.assertEqual(budget(['app', '--backup-window-check']), 180)

    def test_real_child_output_and_failure(self):
        with tempfile.TemporaryDirectory(prefix='worldlet-installer-run-') as root:
            with contextlib.redirect_stdout(io.StringIO()) as out:
                self.assertEqual(run_checked([sys.executable, '-c', 'print("complete")'], cwd=root).returncode, 0)
            self.assertIn('complete', out.getvalue())
            with self.assertRaises(AssertionError):
                run_checked([sys.executable, '-c', 'raise SystemExit(7)'], cwd=root)

    def test_timeout_retains_real_partial_output(self):
        with tempfile.TemporaryDirectory(prefix='worldlet-installer-timeout-') as root:
            with contextlib.redirect_stdout(io.StringIO()) as out, contextlib.redirect_stderr(io.StringIO()) as err:
                with self.assertRaisesRegex(RuntimeError, 'partial output preserved'):
                    run_checked([sys.executable, '-c', 'import time,sys;print("phase-ready",flush=True);print("phase-error",file=sys.stderr,flush=True);time.sleep(10)'], cwd=root, timeout=1)
            self.assertIn('phase-ready', out.getvalue())
            self.assertIn('phase-error', err.getvalue())

    def test_exact_owned_fixture_only(self):
        with tempfile.TemporaryDirectory(prefix='worldlet-installer-resume-') as root:
            root = Path(root); install = root/'install'; data=root/'data'; payload=root/'payload'
            (install/'app').mkdir(parents=True); data.mkdir(); payload.mkdir()
            identity={'version':'2026.930.1069','build':1069,'sourceCommit':'a'*40}
            for directory in (install/'app', payload):
                (directory/'build-identity.json').write_text(json.dumps(identity))
                (directory/'Worldlet.exe').write_bytes(b'synthetic-not-executable')
            (data/'world.json').write_bytes(MARKER)
            self.assertEqual(validate_resume(install,data,payload,identity),2)
            with self.assertRaises(ValueError): validate_resume(install,data,payload,{**identity,'sourceCommit':'b'*40})
            (install/'app/Worldlet.exe').write_bytes(b'changed')
            with self.assertRaises(ValueError): validate_resume(install,data,payload,identity)
            (install/'app/Worldlet.exe').write_bytes(b'synthetic-not-executable')
            (data/'other.json').write_text('unrelated')
            with self.assertRaises(ValueError): validate_resume(install,data,payload,identity)
            (data/'other.json').unlink(); (data/'world.json').write_bytes(b'user data')
            with self.assertRaises(ValueError): validate_resume(install,data,payload,identity)


    def cache_fixture(self, root):
        import py_compile
        install=root/'install'; payload=root/'payload'
        cache=install/'app/WorldletWeb/hermes/__pycache__'; cache.mkdir(parents=True)
        source=payload/'WorldletWeb/hermes/sample.py'; source.parent.mkdir(parents=True)
        source.write_text('def answer():\n    return 42\n', encoding='utf-8')
        target=cache/('sample.cpython-'+str(sys.version_info.major)+str(sys.version_info.minor)+'.pyc')
        py_compile.compile(str(source),cfile=str(target),dfile=str(install/'app/WorldletWeb/hermes/sample.py'),doraise=True)
        return install,payload,target

    def test_verified_cache_preserves_bytes_and_uninstall_unknown_fixture(self):
        import hashlib
        with tempfile.TemporaryDirectory(prefix='worldlet-cache-check-') as directory:
            root=Path(directory);install,payload,cache=self.cache_fixture(root)
            before=cache.read_bytes(); unknown=install/'app/fixture-user-file.txt'
            unknown.write_bytes(b'An untracked file is not installer-owned.')
            manifest=preserve_caches(install,payload,root/'evidence',allow_fixture=True)
            recorded=json.loads(manifest.read_text())
            self.assertEqual(recorded['files'][0]['sha256'],hashlib.sha256(before).hexdigest())
            self.assertEqual((manifest.parent/cache.name).read_bytes(),before)
            self.assertTrue(unknown.is_file())
            self.assertFalse(cache.exists())
            self.assertTrue((payload/'WorldletWeb/hermes/sample.py').is_file())

    def test_unknown_or_changed_code_is_never_cleaned(self):
        with tempfile.TemporaryDirectory(prefix='worldlet-cache-negative-') as directory:
            root=Path(directory);install,payload,cache=self.cache_fixture(root)
            unknown=install/'app/unknown.txt'; unknown.write_text('retain me')
            with self.assertRaises(ValueError):preserve_caches(install,payload,root/'evidence')
            self.assertTrue(cache.exists());self.assertEqual(unknown.read_text(),'retain me')
            self.assertFalse((root/'evidence').exists());unknown.unlink()
            source=payload/'WorldletWeb/hermes/sample.py';source.write_text('def answer():\n    return 43\n')
            with self.assertRaises(ValueError):preserve_caches(install,payload,root/'evidence')
            self.assertTrue(cache.exists())

    def test_link_cannot_escape_test_root(self):
        import os
        import subprocess
        with tempfile.TemporaryDirectory(prefix='worldlet-cache-link-') as directory:
            root=Path(directory);install,payload,cache=self.cache_fixture(root)
            outside=root/'outside';outside.mkdir();marker=outside/'keep.txt';marker.write_text('untouched')
            link=install/'app/escape'
            if os.name=='nt':
                result=subprocess.run(['cmd','/c','mklink','/J',str(link),str(outside)],capture_output=True,text=True)
                self.assertEqual(result.returncode,0,result.stderr)
            else:link.symlink_to(outside,target_is_directory=True)
            try:
                with self.assertRaises(ValueError):preserve_caches(install,payload,root/'evidence')
                self.assertEqual(marker.read_text(),'untouched');self.assertTrue(cache.exists())
                self.assertFalse((root/'evidence').exists())
            finally:
                if os.name=='nt':link.rmdir()
                else:link.unlink()

    def test_preservation_data_must_be_exact(self):
        with tempfile.TemporaryDirectory(prefix='worldlet-cache-marker-') as directory:
            data=Path(directory);(data/'world.json').write_bytes(MARKER);validate_marker(data)
            (data/'world.json').write_bytes(b'private content')
            with self.assertRaises(ValueError):validate_marker(data)
            self.assertEqual((data/'world.json').read_bytes(),b'private content')

    def test_changed_unknown_preservation_fixture_is_rejected(self):
        with tempfile.TemporaryDirectory(prefix='worldlet-cache-preserved-') as directory:
            root=Path(directory);install,payload,cache=self.cache_fixture(root)
            unknown=install/'app/fixture-user-file.txt';unknown.write_text('changed')
            with self.assertRaises(ValueError):preserve_caches(install,payload,root/'evidence',allow_fixture=True)
            self.assertEqual(unknown.read_text(),'changed');self.assertTrue(cache.exists())

    def test_trailing_unknown_bytes_and_nested_evidence_rejected(self):
        with tempfile.TemporaryDirectory(prefix='worldlet-cache-bounds-') as directory:
            root=Path(directory);install,payload,cache=self.cache_fixture(root)
            with self.assertRaises(ValueError):preserve_caches(install,payload,install/'evidence')
            cache.write_bytes(cache.read_bytes()+b'unknown data')
            with self.assertRaises(ValueError):preserve_caches(install,payload,root/'evidence')
            self.assertTrue(cache.read_bytes().endswith(b'unknown data'))
            self.assertFalse((root/'evidence').exists())

if __name__ == '__main__': unittest.main()
