"""Optional local dictation runtime. No Hermes imports, credentials or audio uploads."""
import contextlib
import fcntl
import json
import os
import shutil
from pathlib import Path
import subprocess
import sys
import wave

VERSION = '0.4.3'
# Large v3 Turbo: whisper-small misheard most languages other than English (Mandarin above all).
MODEL = 'mlx-community/whisper-large-v3-turbo'
# The installation library's speech folder (media/speech.ts), one subfolder per helper Python version.
ROOT = Path(sys.argv[2]) / f'py{sys.version_info.major}{sys.version_info.minor}'
PACKAGES = ROOT / 'packages'
MODEL_PATH = ROOT / 'model'


def prepare():
    os.nice(5)
    ROOT.mkdir(parents=True, exist_ok=True, mode=0o700)
    with (ROOT / 'install.lock').open('w') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        marker = PACKAGES / '.worldlet-version'
        if not marker.exists() or marker.read_text() != VERSION:
            subprocess.run([sys.executable, '-m', 'pip', 'install', '--disable-pip-version-check',
                            '--no-input', '--ignore-installed', '--upgrade', '--target', str(PACKAGES),
                            f'mlx-whisper=={VERSION}'], check=True, stdout=sys.stderr, timeout=600)
            marker.write_text(VERSION)
        sys.path.insert(0, str(PACKAGES))
        from huggingface_hub import snapshot_download
        ready, owner = ROOT / 'ready', MODEL_PATH / '.worldlet-model'
        if not owner.exists() or owner.read_text() != MODEL:
            # Weights of another model (the earlier whisper-small) must not stand in for this one.
            ready.unlink(missing_ok=True)
            shutil.rmtree(MODEL_PATH, ignore_errors=True)
        if not (ready.exists() and (MODEL_PATH / 'config.json').exists() and (any(MODEL_PATH.glob('*.safetensors')) or any(MODEL_PATH.glob('*.npz')))):
            snapshot_download(MODEL, local_dir=str(MODEL_PATH), max_workers=2, allow_patterns=['config.json', '*.npz', '*.safetensors'])
            owner.write_text(MODEL)
        # Validate on the GPU before declaring setup complete.
        from mlx_whisper.load_models import load_model
        load_model(str(MODEL_PATH))
        ready.write_text(VERSION)
    return {'ok': True, 'model': MODEL}


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


def transcribe(path, language, hint_path=None):
    sys.path.insert(0, str(PACKAGES))
    import numpy as np
    import mlx_whisper
    with wave.open(path, 'rb') as audio:
        if (audio.getnchannels(), audio.getsampwidth(), audio.getframerate()) != (1, 2, 16000):
            raise ValueError('Expected mono 16 kHz PCM16 WAV')
        # Fox's own dictation stops at 45 seconds, a spoken Order at 180 (speech.ts LONG_LIMIT_SECONDS).
        if audio.getnframes() > 16000 * 181:
            raise ValueError('Dictation exceeds the recording limit')
        samples = np.frombuffer(audio.readframes(audio.getnframes()), dtype='<i2').astype(np.float32) / 32768.0
    if not len(samples) or float(np.max(np.abs(samples))) < .001:
        return {'text': ''}
    # Pass PCM directly: no ffmpeg installation and no implicit network model lookup.
    from mlx_whisper.tokenizer import LANGUAGES
    # The app's hint (speech-language.ts); 'multi' or an unknown code means detect it.
    # The World's names (speech.ts, core speechPrompt) so Whisper spells them the World's way.
    hint = names_hint(hint_path)
    result = mlx_whisper.transcribe(samples, path_or_hf_repo=str(MODEL_PATH),
                                   language=language if language in LANGUAGES else None,
                                   condition_on_previous_text=False, verbose=None, initial_prompt=hint or None)
    text = spoken_text(heard((segment['text'], segment.get('no_speech_prob'), segment.get('avg_logprob'))
                             for segment in result['segments']))
    return {'text': '' if echoes_hint(text, hint) else text}


if __name__ == '__main__':
    os.environ['HF_HUB_DISABLE_TELEMETRY'] = '1'
    with contextlib.redirect_stdout(sys.stderr):
        value = prepare() if sys.argv[1] == 'prepare' else transcribe(sys.argv[3], sys.argv[4], sys.argv[5] if len(sys.argv) > 5 else None)
    print(json.dumps(value, ensure_ascii=False))
