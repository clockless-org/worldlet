# The Ongoing Applet's device (core/ongoing/README.md): the painted screen stand of the dormant `things` Peek sprite,
# its frame repainted a sage green and its face redrawn as a conversation carried on: two speech bubbles over a
# thread of days with the latest one lit. No image model was used and no third-party artwork was added. Run with
# Pillow and NumPy:
#   python3 resources/styles/builtin/drafts/ongoing/compose.py
# It rewrites assets/applets/ongoing/peek-logo-v3.png; the output is deterministic.
import os,colorsys
import numpy as np
from PIL import Image,ImageDraw,ImageFilter
ROOT=os.path.abspath(os.path.join(os.path.dirname(__file__),'../../../../..'))
SRC=os.path.join(ROOT,'resources/styles/builtin/assets/applets/things/peek-logo-v3.png')
OUT=os.path.join(ROOT,'resources/styles/builtin/assets/applets/ongoing/peek-logo-v3.png')
im=np.array(Image.open(SRC).convert('RGBA')).astype(float)
r,g,b,a=[im[...,i] for i in range(4)]
H,W=r.shape;yy,xx=np.mgrid[0:H,0:W]

# 1. The frame: every blue pixel keeps its light and texture, turned to a sage green.
blue=(b>r+12)&(b>g)&(a>10)
hsv=np.array(Image.fromarray(im[...,:3].astype(np.uint8)).convert('HSV')).astype(float)
hue=hsv[...,0].copy();sat=hsv[...,1].copy();val=hsv[...,2].copy()
hue[blue]=(hue[blue]-hue[blue].mean()+104)%256  # ~146 degrees
sat[blue]=np.clip(sat[blue]*0.55,0,255);val[blue]=np.clip(val[blue]*1.04,0,255)
warm=np.array(Image.fromarray(np.stack([hue,sat,val],-1).astype(np.uint8),'HSV').convert('RGB')).astype(float)
for i in range(3):im[...,i]=np.where(blue,warm[...,i],im[...,i])

# 2. The face: the old check mark gives way to clean paper, lit as the paper around it is (a plane fitted to it).
panel=(xx>320)&(xx<905)&(yy>290)&(yy<840)
L=0.3*r+0.59*g+0.11*b
clean=panel&(L>228)&~((xx>390)&(xx<870)&(yy>380)&(yy<790))
X=np.stack([np.ones(clean.sum()),xx[clean],yy[clean]],1)
fit=[np.linalg.lstsq(X,im[...,i][clean],rcond=None)[0] for i in range(3)]
area=Image.new('L',(W,H),0)
ImageDraw.Draw(area).polygon([(352,318),(880,340),(880,792),(352,770)],fill=255)
m=np.array(area.filter(ImageFilter.GaussianBlur(10))).astype(float)/255
rng=np.random.default_rng(11);grain=rng.normal(0,1.8,(H,W))
for i in range(3):im[...,i]=im[...,i]*(1-m)+(fit[i][0]+fit[i][1]*xx+fit[i][2]*yy+grain)*m
light=np.clip(1.0-(yy-300)/2600-(xx-320)/5200,0.88,1.0)

# 3. The new face, drawn at twice the size for clean edges, sheared to follow the panel's slight tilt.
S=2;face=Image.new('RGBA',(W*S,H*S),(0,0,0,0));d=ImageDraw.Draw(face)
def R(box,rad,fill,outline=None,width=0):d.rounded_rectangle([v*S for v in box],rad*S,fill=fill,outline=outline,width=width*S)
def P(points,fill):d.polygon([(x*S,y*S) for x,y in points],fill=fill)
# The other Agent's bubble, with two lines of text.
R((420,395,700,500),28,'#d9e3d3');P([(450,495),(452,540),(492,498)],'#d9e3d3')
R((452,425,660,445),10,'#8a9a84');R((452,458,610,478),10,'#8a9a84')
# The person's bubble, on the right.
R((560,520,820,610),28,'#4f7a6a');P([(785,605),(800,645),(752,607)],'#4f7a6a')
R((592,550,780,570),10,'#e9f0e6')
# A thread of days, the latest lit.
d.line([(440*S,705*S),(800*S,705*S)],fill='#a3b39c',width=8*S)
for k,x in enumerate((450,540,630,720,800)):
    rad=22 if k==4 else 14
    d.ellipse([(x-rad)*S,(705-rad)*S,(x+rad)*S,(705+rad)*S],fill='#d9822b' if k==4 else '#7c9474')
face=face.resize((W,H),Image.LANCZOS)
f=np.array(face).astype(float)
shear=np.round((xx-320)*0.035).astype(int)
f=f[np.clip(yy-shear,0,H-1),xx]
fa=f[...,3:4]/255*(panel[...,None])
shade=light[...,None]
im[...,:3]=im[...,:3]*(1-fa)+np.clip(f[...,:3]*shade+grain[...,None]*0.6,0,255)*fa
os.makedirs(os.path.dirname(OUT),exist_ok=True)
Image.fromarray(np.clip(im,0,255).astype(np.uint8),'RGBA').save(OUT,optimize=True)
print('wrote',os.path.relpath(OUT,ROOT))
