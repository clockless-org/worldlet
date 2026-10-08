"""Original Worldlet ambient cue. No sampled recordings or external music.
Rebuild: python3 scripts/render-world-music.py (macOS afconvert encodes AAC).
"""
from array import array
import math, sys
from pathlib import Path
import subprocess
import tempfile
import wave

RATE=32000
STYLE=sys.argv[1] if len(sys.argv)>1 else "calm"
BPM,FILENAME={"calm":(80,"bridge-at-dusk"),"focus":(96,"quiet-workshop"),"brisk":(112,"morning-path")}[STYLE]
BEAT=60/BPM
BAR=BEAT*8
SECONDS=BAR*8
N=round(RATE*SECONDS)
left=array('f',[0])*N
right=array('f',[0])*N

def note(midi,start,duration,gain,pan=0,pad=False):
    freq=440*2**((midi-69)/12)
    begin=int(start*RATE)
    length=int(duration*RATE)
    a=math.sqrt((1-pan)/2)*gain;b=math.sqrt((1+pan)/2)*gain
    for i in range(length):
        t=i/RATE
        if pad: env=min(1,t/1.4)*min(1,(duration-t)/2.0)*.58
        else: env=(1-math.exp(-t*30))*math.exp(-t/1.4)*min(1,(duration-t)/.35)
        tone=math.sin(2*math.pi*freq*t)+.13*math.sin(2*math.pi*freq*2*t)+.035*math.sin(2*math.pi*freq*3*t)
        value=tone*env
        j=(begin+i)%N
        left[j]+=value*a;right[j]+=value*b

chords=[[48,55,59,62,64],[45,52,55,59,60],[41,48,55,57,60],[43,50,57,60,62]]
for bar in range(8):
    chord=chords[bar%4]
    for voice,midi in enumerate(chord):note(midi,bar*BAR,BAR+2,.043,(voice-2)*.22,True)
    for step,voice in enumerate([2,4,3,1]):
        note(chord[voice]+12,bar*BAR+step*BEAT*2,4,.047,(-1 if step%2 else 1)*.32)
if STYLE!='calm':
    # A more active bass and plucked pattern changes the arrangement, not playback pitch.
    for bar in range(8):
        chord=chords[bar%4]
        for step in range(8):
            note(chord[step%5]+12,bar*BAR+step*BEAT,1.1,.027 if STYLE=='focus' else .041,(-1 if step%2 else 1)*.25)
            if step%2==0:note(chord[0]-12,bar*BAR+step*BEAT,1.2,.038)
        if STYLE=='brisk':
            for step in range(8):
                start=round((bar*BAR+step*BEAT)*RATE)
                for i in range(int(RATE*.12)):
                    t=i/RATE;v=.028*math.sin(2*math.pi*(75*t-100*t*t))*math.exp(-t*35)
                    left[(start+i)%N]+=v;right[(start+i)%N]+=v
# Quiet stereo echoes wrap across the loop boundary, including the final chord.
for delay,gain in [(int(RATE*BEAT/2),.13),(int(RATE*BEAT),.08)]:
    l=array('f',left);r=array('f',right)
    for i in range(N):left[i]+=r[(i-delay)%N]*gain;right[i]+=l[(i-delay)%N]*gain
peak=max(max(map(abs,left)),max(map(abs,right)))
scale=.50/peak
pcm=array('h')
for l,r in zip(left,right):pcm.extend((round(l*scale*32767),round(r*scale*32767)))
root=Path(__file__).resolve().parents[1]
with tempfile.TemporaryDirectory() as tmp:
    wav=Path(tmp)/'ambient.wav'
    with wave.open(str(wav),'wb') as out:out.setnchannels(2);out.setsampwidth(2);out.setframerate(RATE);out.writeframes(pcm.tobytes())
    target=root/f'resources/audio/{FILENAME}.m4a'
    subprocess.run(['afconvert','-f','m4af','-d','aac','-b','128000',str(wav),str(target)],check=True)
print(f'Original {SECONDS:.2f}-second {BPM} BPM loop; PCM peak -6.0 dBFS; loop seam {abs(left[0]-left[-1])*scale:.6f}; {target}')
