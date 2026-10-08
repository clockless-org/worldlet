"""Windows local dictation worker. Separate environment; never uploads audio."""
import contextlib
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import time
import wave

VERSION = '1.2.1'
# Large v3 Turbo: whisper-small misheard most languages other than English (Mandarin above all).
MODEL = 'deepdml/faster-whisper-large-v3-turbo-ct2'
REVISION = '4df90f75321148c3a29a9e2351b7ddf8f5b115a8'
DEPENDENCIES = '''anyio==4.15.1 av==18.1.0 certifi==2026.7.22 click==8.5.0 colorama==0.4.6
ctranslate2==4.8.2 faster-whisper==1.2.1 filelock==4.0.3 flatbuffers==25.12.19
fsspec==2026.9.0 h11==0.16.0 hf-xet==1.6.0 httpcore==1.0.9 httpx==0.28.1
huggingface-hub==1.33.0 idna==3.20 numpy==2.5.3 onnxruntime==1.30.0 packaging==26.3
protobuf==7.36.2 pyyaml==6.0.3 tokenizers==0.23.2 tqdm==4.70.1 typing-extensions==4.16.0'''.split()
IDENTITY = hashlib.sha256((REVISION + '\n' + '\n'.join(DEPENDENCIES)).encode()).hexdigest()


def pcm(path):
    with wave.open(str(path), 'rb') as audio:
        if (audio.getnchannels(), audio.getsampwidth(), audio.getframerate(), audio.getcomptype()) != (1, 2, 16000, 'NONE'):
            raise ValueError('Expected mono 16 kHz PCM16 WAV')
        count = audio.getnframes()
        # Fox's own dictation stops at 45 seconds, a spoken Order at 180 (speech.ts LONG_LIMIT_SECONDS).
        if count > 16000 * 181:
            raise ValueError('Dictation exceeds 180 seconds')
        data = audio.readframes(count)
        if len(data) != count * 2:
            raise ValueError('Incomplete dictation recording')
        return data


def environment():
    # No model-provider keys, Hub credentials, or user Python configuration.
    allowed = {'SYSTEMROOT', 'WINDIR', 'PATH', 'TEMP', 'TMP', 'LOCALAPPDATA', 'USERPROFILE', 'APPDATA',
               'PROGRAMFILES', 'PROGRAMFILES(X86)', 'PROGRAMDATA', 'COMSPEC', 'SSL_CERT_FILE',
               'HTTPS_PROXY', 'HTTP_PROXY', 'NO_PROXY'}
    result = {key: value for key, value in os.environ.items() if key.upper() in allowed}
    result.update(HF_HUB_DISABLE_TELEMETRY='1', HF_HUB_DISABLE_IMPLICIT_TOKEN='1', HF_HUB_DISABLE_XET='1')
    return result


def run(python, args, timeout):
    return subprocess.run([str(python), '-I', '-B', *args], check=True, timeout=timeout,
                          env=environment(), stdout=sys.stderr)


def prepare(root):
    import msvcrt
    if sys.version_info[:2] != (3, 12):
        raise ValueError('Windows speech requires the app Python 3.12 runtime')
    root.mkdir(parents=True, exist_ok=True)
    with (root / 'install.lock').open('a+b') as lock:
        if not os.fstat(lock.fileno()).st_size:
            lock.write(b'0'); lock.flush()
        lock.seek(0)
        deadline = time.monotonic() + 900
        while True:
            try:
                msvcrt.locking(lock.fileno(), msvcrt.LK_NBLCK, 1)
                break
            except OSError:
                if time.monotonic() >= deadline:
                    raise TimeoutError('Local speech preparation is busy')
                time.sleep(.25)
        try:
            python = root / 'python/Scripts/python.exe'
            marker = root / 'ready.json'
            if not python.exists():
                run(sys.executable, ['-m', 'venv', str(root / 'python')], 120)
            try:
                ready = marker.exists() and json.loads(marker.read_text()) == {'identity': IDENTITY}
            except (ValueError, OSError):
                ready = False
            if not ready:
                run(python, ['-m', 'pip', '--isolated', 'install', '--disable-pip-version-check', '--no-input',
                             '--index-url', 'https://pypi.org/simple', '--only-binary=:all:', *DEPENDENCIES], 600)
            # This loads the real CPU model before readiness, including on later launches.
            try:
                run(python, [__file__, '_prepare', str(root), 'offline' if ready else 'download'], 900)
            except Exception:
                marker.unlink(missing_ok=True)
                raise
            temporary = root / 'ready.tmp'
            temporary.write_text(json.dumps({'identity': IDENTITY}), encoding='utf-8')
            temporary.replace(marker)
            return {'ok': True, 'model': MODEL, 'revision': REVISION, 'compute': 'cpu-int8'}
        finally:
            lock.seek(0); msvcrt.locking(lock.fileno(), msvcrt.LK_UNLCK, 1)


def load(root):
    from faster_whisper import WhisperModel
    return WhisperModel(str(root / 'model'), device='cpu', compute_type='int8',
                        cpu_threads=min(4, os.cpu_count() or 1), local_files_only=True)


def _cjk(char):
    return '\u2e80' <= char <= '\u9fff' or '\uac00' <= char <= '\ud7af' or '\uf900' <= char <= '\ufaff' or '\uff00' <= char <= '\uffef'


def spoken_text(segments):
    """Whisper's segments as one line (kept identical in whisper_local.py and whisper_windows.py).
    Large v3 Turbo starts a segment without a space, so the decoded text ran sentences together
    ("in the worldI don't"), and it can decode the same stretch twice ("Hello,Hello,"; owner report
    2026-10-05). Segments are joined with one space, none between CJK characters, and a segment that
    only repeats the one before is dropped."""
    text, previous = '', None
    for segment in segments:
        part = segment.strip()
        key = ''.join(char for char in part.casefold() if char.isalnum())
        if not part or (key and key == previous):
            continue
        if text and not (_cjk(text[-1]) and _cjk(part[0])):
            text += ' '
        text, previous = text + part, key
    return text


# What Whisper writes for silence: subtitle credits and video sign-offs it learned from its training data
# (an Order made of 「请不吝点赞 订阅 转发 打赏支持明镜与点点栏目」 was sent from near-silent audio, owner Order
# 2026-10-07). A segment made only of these is not speech.
HALLUCINATIONS = ('请不吝点赞订阅转发打赏支持明镜与点点栏目', '請不吝點贊訂閱轉發打賞支持明鏡與點點欄目', '明镜与点点栏目',
                  '明鏡與點點欄目', '点赞订阅转发打赏', '字幕由amaraorg社区提供', '字幕由amaraorg社區提供',
                  'subtitlesbytheamaraorgcommunity', '中文字幕志愿者', '字幕志愿者', '优优独播剧场', '请订阅我的频道',
                  '请订阅', '谢谢观看', '謝謝觀看', '感谢观看', 'thanksforwatching', 'thankyouforwatching',
                  'pleasesubscribe')


def heard(segments):
    """The text of segments that are speech (kept identical in whisper_local.py and whisper_windows.py): each
    is (text, no_speech_prob, avg_logprob). A segment Whisper itself judges silent (no-speech probability over
    0.6 with a low average log-probability, its own rule) or one made only of known silence phrases is dropped."""
    for text, no_speech, logprob in segments:
        if no_speech is not None and logprob is not None and no_speech > .6 and logprob < -1:
            continue
        key = ''.join(char for char in text.casefold() if char.isalnum())
        for phrase in HALLUCINATIONS:
            key = key.replace(phrase, '')
        if key:
            yield text


def names_hint(path):
    """The World's names for Whisper's initial prompt (kept identical in whisper_local.py and whisper_windows.py), read
    from the file speech.ts writes beside the recording; empty without one."""
    if not path:
        return ''
    with open(path, encoding='utf-8') as file:
        return file.read(600).strip()


def echoes_hint(text, hint):
    """Whether the text only repeats the names hint (kept identical in whisper_local.py and whisper_windows.py): on
    near-silence Whisper can write its prompt back. A short phrase that is one of the names is still speech."""
    key = ''.join(char for char in text.casefold() if char.isalnum())
    names = ''.join(char for char in hint.casefold() if char.isalnum())
    return bool(key and names) and (key == names or (len(key) > 24 and key in names))


def worker(mode, root, args):
    os.environ.update(HF_HUB_DISABLE_TELEMETRY='1', HF_HUB_DISABLE_IMPLICIT_TOKEN='1', HF_HUB_DISABLE_XET='1')
    if mode == '_prepare':
        if args[0] == 'download':
            import shutil
            from huggingface_hub import snapshot_download
            owner = root / 'model' / '.worldlet-model'
            if not owner.exists() or owner.read_text() != REVISION:
                # Files of another model (the earlier whisper-small's vocabulary.txt) must not mix with this one.
                shutil.rmtree(root / 'model', ignore_errors=True)
            # preprocessor_config.json carries Large v3's 128 mel bins.
            snapshot_download(MODEL, revision=REVISION, token=False, local_dir=str(root / 'model'), max_workers=2,
                              allow_patterns=['model.bin', 'config.json', 'preprocessor_config.json', 'tokenizer.json', 'vocabulary.*'])
            owner.write_text(REVISION)
        load(root)
        return {'ok': True}
    from faster_whisper.tokenizer import _LANGUAGE_CODES
    import numpy as np
    samples = np.frombuffer(pcm(args[0]), dtype='<i2').astype(np.float32) / 32768.0
    if not len(samples) or float(np.max(np.abs(samples))) < .001:
        return {'text': ''}
    # The World's names (speech.ts, core speechPrompt) so Whisper spells them the World's way.
    hint = names_hint(args[2] if len(args) > 2 else None)
    segments, _ = load(root).transcribe(samples, language=args[1] if args[1] in _LANGUAGE_CODES else None,
                                        condition_on_previous_text=False, vad_filter=True, beam_size=5,
                                        initial_prompt=hint or None)
    text = spoken_text(heard((segment.text, segment.no_speech_prob, segment.avg_logprob) for segment in segments))
    return {'text': '' if echoes_hint(text, hint) else text}


def main():
    mode, root = sys.argv[1], Path(sys.argv[2]).resolve()
    if mode == 'prepare':
        with contextlib.redirect_stdout(sys.stderr):
            value = prepare(root)
    elif mode == 'transcribe':
        pcm(sys.argv[3])  # Reject malformed/oversized recordings before loading any native model.
        if json.loads((root / 'ready.json').read_text()) != {'identity': IDENTITY}:
            raise ValueError('Local speech is not prepared')
        result = subprocess.run([str(root / 'python/Scripts/python.exe'), '-I', '-B', __file__,
                                 '_transcribe', str(root), *sys.argv[3:]], check=True, timeout=120,
                                env={**environment(), 'HF_HUB_OFFLINE': '1'}, capture_output=True, text=True, encoding='utf-8')
        value = json.loads(result.stdout)
    elif mode in ('_prepare', '_transcribe'):
        with contextlib.redirect_stdout(sys.stderr):
            value = worker(mode, root, sys.argv[3:])
    else:
        raise ValueError('Unknown speech operation')
    print(json.dumps(value, ensure_ascii=True))


if __name__ == '__main__':
    main()
