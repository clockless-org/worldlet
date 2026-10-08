"""Rebuild curated CC0 recordings. This is an authoring tool, never a runtime scraper.
Review source-page licenses before changing this list. No Freesound API account.
"""
from pathlib import Path
from array import array
import hashlib,json,re,subprocess,tempfile,urllib.request,wave
ROOT=Path(__file__).resolve().parents[1]
SOURCES=[
 ('ocean-shore','Waves at Baltic Sea shore.wav','pulswelle','https://freesound.org/people/pulswelle/sounds/339517/','https://cdn.freesound.org/previews/339/339517_2367966-hq.mp3'),
 ('soft-rain','Rain_01.wav','Q.K.','https://freesound.org/people/Q.K./sounds/56306/','https://cdn.freesound.org/previews/56/56306_91374-hq.mp3'),
 ('forest-air','forest ambience constant breeze.flac','kyles','https://freesound.org/people/kyles/sounds/637559/','https://cdn.freesound.org/previews/637/637559_612689-hq.mp3')]
credits=[]
for name,title,author,page,url in SOURCES:
 html=urllib.request.urlopen(page,timeout=30).read().decode()
 if 'creativecommons.org/publicdomain/zero' not in html or url not in html:raise RuntimeError('Review license/download URL: '+page)
 with tempfile.TemporaryDirectory() as tmp:
  folder=Path(tmp);src=folder/'source.mp3';wav=folder/'source.wav';out=folder/'loop.wav'
  request=urllib.request.Request(url,headers={'Range':'bytes=0-1599999'})
  with urllib.request.urlopen(request,timeout=30) as response:
   data=response.read(1_600_000)
  src.write_bytes(data)
  subprocess.run(['afconvert','-f','WAVE','-d','LEI16@32000','-c','2',str(src),str(wav)],check=True)
  with wave.open(str(wav),'rb') as source:
   rate=source.getframerate();raw=array('h',source.readframes(min(source.getnframes(),rate*75)));channels=source.getnchannels()
  frames=len(raw)//channels;overlap=min(rate*3,frames//8)
  for i in range(overlap):
   a=i/overlap
   for c in range(channels):raw[i*channels+c]=round(raw[(frames-overlap+i)*channels+c]*(1-a)+raw[i*channels+c]*a)
  raw=raw[:(frames-overlap)*channels];peak=max(map(abs,raw));gain=.42*32767/peak
  raw=array('h',(round(v*gain) for v in raw))
  with wave.open(str(out),'wb') as target:
   target.setnchannels(channels);target.setsampwidth(2);target.setframerate(rate);target.writeframes(raw.tobytes())
  target=ROOT/f'resources/audio/{name}.m4a'
  if target.exists():target.unlink()
  subprocess.run(['afconvert','-f','m4af','-d','aac','-b','128000',str(out),str(target)],check=True)
  credits.append(dict(file=target.name,title=title,author=author,source=page,download=url,license='CC0-1.0',licenseURL='https://creativecommons.org/publicdomain/zero/1.0/',verified='2026-09-16',downloadRange='first 1600000 bytes or full preview if shorter',sourceSHA256=hashlib.sha256(data).hexdigest(),sha256=hashlib.sha256(target.read_bytes()).hexdigest(),processing='HQ preview; up to first 75 seconds, 3-second loop crossfade, normalized peak -7.5 dBFS, stereo 32kHz AAC',seconds=round(len(raw)/channels/rate,3)))
  print('Imported',name,flush=True)
(ROOT/'resources/audio/CC0-SOURCES.json').write_text(json.dumps(credits,indent=2)+'\n')
