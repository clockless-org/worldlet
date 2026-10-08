"""Original village bed: soft wind, flowing water and sparse distant birds."""
from array import array
import math, random, subprocess, tempfile, wave
from pathlib import Path
rate=32000
seconds=60
n=rate*seconds
rng=random.Random(9216)
channels=[]
for channel in range(2):
    values=array('f'); low=0.; slow=0.
    for i in range(n):
        t=i/rate
        noise=rng.uniform(-1,1)
        low+=.035*(noise-low)
        slow+=.003*(noise-slow)
        breeze=.65+.22*math.sin(2*math.pi*t/20+channel*.4)+.1*math.sin(2*math.pi*t/12)
        water=(low-slow)*(.42+.08*math.sin(2*math.pi*t/5+channel))
        values.append(slow*breeze+water)
    # Short, spaced phrases, shared between ears with gentle stereo placement.
    birds=random.Random(413)
    for start in [4,13,25,38,49]:
        pan=birds.uniform(-.6,.6)
        for note in range(birds.randint(2,3)):
            onset=start+note*.34+birds.uniform(0,.04)
            duration=birds.uniform(.13,.23)
            pitch=birds.uniform(2100,2900)
            count=int(duration*rate)
            for j in range(count):
                u=j/rate; envelope=math.sin(math.pi*j/count)**2
                phase=2*math.pi*(pitch*u+550*u*u/duration)
                gain=.022*(1+pan*(1 if channel else -1))
                values[int(onset*rate)+j]+=gain*envelope*(math.sin(phase)+.12*math.sin(2*phase))
    # Crossfade the tail into the start and trim it: continuous repeating bed.
    overlap=rate*2
    for i in range(overlap):
        a=i/overlap
        values[i]=values[n-overlap+i]*(1-a)+values[i]*a
    channels.append(values[:n-overlap])
peak=max(max(map(abs,c)) for c in channels)
pcm=array('h')
for l,r in zip(*channels):pcm.extend((int(l/peak*.32*32767),int(r/peak*.32*32767)))
root=Path(__file__).resolve().parents[1]
with tempfile.TemporaryDirectory() as tmp:
    wav=Path(tmp)/'village.wav'
    with wave.open(str(wav),'wb') as out:
        out.setnchannels(2);out.setsampwidth(2);out.setframerate(rate);out.writeframes(pcm.tobytes())
    subprocess.run(['afconvert','-f','m4af','-d','aac ','-b','96000',str(wav),str(root/'resources/audio/village-air.m4a')],check=True)
print('Rendered original 58-second village ambience loop.')
