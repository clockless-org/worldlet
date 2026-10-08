"""Offline worker contracts; optional real local inference on a supplied public fixture."""
import argparse
from concurrent.futures import ThreadPoolExecutor
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import wave

root = Path(__file__).resolve().parents[1]
worker = root / 'platform/local-tools/whisper_windows.py'
spec = importlib.util.spec_from_file_location('windows_speech', worker)
speech = importlib.util.module_from_spec(spec)
spec.loader.exec_module(speech)
parser = argparse.ArgumentParser()
parser.add_argument('--runtime', type=Path)
parser.add_argument('--sample', type=Path)
args = parser.parse_args()

with tempfile.TemporaryDirectory(prefix='worldlet-speech-check-') as temporary:
    folder = Path(temporary)
    def wav(name, channels=1, width=2, rate=16000, frames=16000):
        path = folder / name
        with wave.open(str(path), 'wb') as audio:
            audio.setnchannels(channels); audio.setsampwidth(width); audio.setframerate(rate)
            audio.writeframes(b'\0' * frames * width * channels)
        return path
    silence = wav('silence.wav')
    assert len(speech.pcm(silence)) == 32000
    for path in (wav('stereo.wav', channels=2), wav('rate.wav', rate=48000),
                 wav('width.wav', width=1), wav('long.wav', frames=181 * 16000 + 1)):
        try:
            speech.pcm(path)
            raise AssertionError('Invalid recording accepted')
        except ValueError:
            pass
    broken = wav('broken.wav'); broken.write_bytes(broken.read_bytes()[:-100])
    try:
        speech.pcm(broken)
        raise AssertionError('Truncated recording accepted')
    except ValueError:
        pass
    original = os.environ.copy()
    try:
        os.environ.update(HF_TOKEN='fixture-secret', OPENAI_API_KEY='fixture-secret', PYTHONPATH='fixture-path')
        assert not {'HF_TOKEN', 'OPENAI_API_KEY', 'PYTHONPATH'}.intersection(speech.environment())
    finally:
        os.environ.clear(); os.environ.update(original)
    if args.runtime:
        def call(*arguments):
            result = subprocess.run([sys.executable, str(worker), *map(str, arguments)], capture_output=True,
                                    text=True, encoding='utf-8', check=True, timeout=180,
                                    env={**speech.environment(), 'HF_HUB_OFFLINE': '1',
                                         'HTTPS_PROXY': 'http://127.0.0.1:1', 'HTTP_PROXY': 'http://127.0.0.1:1', 'NO_PROXY': ''})
            return json.loads(result.stdout)
        with ThreadPoolExecutor(max_workers=2) as pool:
            preparations = [pool.submit(call, 'prepare', args.runtime) for _ in range(2)]
            assert all(result.result()['ok'] for result in preparations)
        assert call('transcribe', args.runtime, silence, 'multi') == {'text': ''}
        if args.sample:
            text = call('transcribe', args.runtime, args.sample, 'en')['text']
            assert 'ask not' in text.lower(), text
            print('PASS actual CPU transcription:', text)
print('PASS Windows speech: PCM format/duration/truncation, credential isolation and optional offline inference.')
