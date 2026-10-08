# Every moment Applet's device (core/widgets/README.md): the painted screen stand of the dormant `things` Peek sprite,
# its frame repainted a warm amber and its face redrawn as a small page for the moment: a map with a path and a pin
# over two ticked rows. No image model was used and no third-party artwork was added. Run with Pillow and NumPy:
#   python3 resources/styles/builtin/drafts/moment/compose.py
# It rewrites assets/applets/moment/peek-logo-v3.png; the output is deterministic.
import os,colorsys
import numpy as np
from PIL import Image,ImageDraw,ImageFilter
ROOT=os.path.abspath(os.path.join(os.path.dirname(__file__),'../../../../..'))
SRC=os.path.join(ROOT,'resources/styles/builtin/assets/applets/things/peek-logo-v3.png')
OUT=os.path.join(ROOT,'resources/styles/builtin/assets/applets/moment/peek-logo-v3.png')
im=np.array(Image.open(SRC).convert('RGBA')).astype(float)
r,g,b,a=[im[...,i] for i in range(4)]
H,W=r.shape;yy,xx=np.mgrid[0:H,0:W]

# 1. The frame: every blue pixel keeps its light and texture, turned to a warm amber.
blue=(b>r+12)&(b>g)&(a>10)
hsv=np.array(Image.fromarray(im[...,:3].astype(np.uint8)).convert('HSV')).astype(float)
hue=hsv[...,0].copy();sat=hsv[...,1].copy();val=hsv[...,2].copy()
hue[blue]=(hue[blue]-hue[blue].mean()+18)%256  # ~25 degrees
sat[blue]=np.clip(sat[blue]*0.82,0,255);val[blue]=np.clip(val[blue]*1.04,0,255)
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
# A small map: green ground, a river and a dashed path to a pin.
R((420,400,820,600),26,'#b9cf9a')
d.polygon([(v[0]*S,v[1]*S) for v in [(420,520),(520,500),(620,540),(720,500),(820,520),(820,560),(720,540),(620,580),(520,540),(420,560)]],fill='#8fb4c9')
for k in range(7):
    x0=455+k*44;d.line([(x0*S,(575-k*18)*S),((x0+24)*S,(565-k*18)*S)],fill='#7a5a3a',width=9*S)
d.ellipse([(745-34)*S,(430-34)*S,(745+34)*S,(430+34)*S],fill='#c8553d')
d.polygon([((745-30)*S,(445)*S),((745+30)*S,445*S),(745*S,500*S)],fill='#c8553d')
d.ellipse([(745-13)*S,(430-13)*S,(745+13)*S,(430+13)*S],fill='#f6efe0')
# Two ticked rows.
for k,y in enumerate((640,715)):
    R((430,y,482,y+52),12,'#5c9a7b')
    d.line([(442*S,(y+27)*S),(454*S,(y+39)*S),(472*S,(y+14)*S)],fill='#f6efe0',width=9*S,joint='curve')
    R((505,y+16,790-k*90,y+36),10,'#8a7a64')
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
