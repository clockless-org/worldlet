import sys,os
sys.path.insert(0,os.path.dirname(__file__))
from faces import FACES
from PIL import Image,ImageFilter
import numpy as np
ROOT=os.path.abspath(os.path.join(os.path.dirname(__file__),'../../../../..'))
SRC=os.path.join(ROOT,'resources/styles/builtin/assets/applets/steam/peek-logo-v3.png')
src=Image.open(SRC).convert('RGBA');im=np.array(src).astype(float)
r,g,b,a=[im[...,i] for i in range(4)]
H,W=r.shape;yy,xx=np.mgrid[0:H,0:W]
blue=(b>r+30)&(b>g+10)&(a>200)
white=(r>170)&(g>170)&(b>160)&(a>200)
cx,cy=635.69,514.01
A=np.array([[0.89564816,0.44476329],[-0.44476329,0.89564816]]).T  # columns: right, down
axes=np.array([368.12,424.31])
S=1.035
C=(A*axes**2)@A.T
M=np.linalg.cholesky(C)*S  # verticals stay vertical; horizontals follow the disk's yaw
Minv=np.linalg.inv(M)
d=np.vstack([(xx-cx).ravel(),(yy-cy).ravel()])
uv=(Minv@d).reshape(2,H,W)
e=uv[0]**2+uv[1]**2
from PIL import ImageDraw
pm=Image.new('L',(W,H),0)
ImageDraw.Draw(pm).polygon([(x+60,y+580) for x,y in [(50,180),(75,130),(110,112),(150,105),(165,86),(200,86),(215,105),(290,135),(325,165),(332,215),(312,262),(270,302),(200,302),(130,282),(70,272),(44,230)]],fill=255)
controller=np.array(pm)>0
brass=(r>g+20)&(g>b+15)&(r>110)
region=((e<=0.93)|((e<=1.16)&(blue|white)&~brass))
region&=~controller
# Disk blue that shows between the controller and the rim, but never the controller's own blue button.
region|=blue&controller&((xx-320)**2+(yy-772)**2>26**2)&(e<=1.16)
region&=a>200
# shading: plane fit on blue luminance + fine texture from blue pixels
L=(0.3*r+0.59*g+0.11*b)
bm=blue&(e<1)
X=np.stack([np.ones(bm.sum()),xx[bm],yy[bm]],1);coef,*_=np.linalg.lstsq(X,L[bm],rcond=None)
plane=coef[0]+coef[1]*xx+coef[2]*yy
shade=np.clip(plane/plane[bm].mean()*0.97,0.8,1.06)
rng=np.random.default_rng(7)
noise=rng.normal(0,1,(H//6+1,W//6+1)).astype(np.float32)
coarse=np.array(Image.fromarray(((noise*20)+128).clip(0,255).astype(np.uint8)).resize((W,H),Image.BICUBIC)).astype(float)
fine=rng.normal(0,1,(H,W))
tex=((coarse-128)/128*0.05+fine*0.018)
edge=np.clip((e-0.82)/0.18,0,1)**2*0.28
only=set(sys.argv[1:])
for key,fn in FACES.items():
    if only and key not in only:continue
    face=np.array(fn().convert('RGB')).astype(float)
    fs=face.shape[0]
    fx=np.clip((uv[0]+1)/2*(fs-1),0,fs-1);fy=np.clip((uv[1]+1)/2*(fs-1),0,fs-1)
    x0=np.floor(fx).astype(int);y0=np.floor(fy).astype(int);x1=np.minimum(x0+1,fs-1);y1=np.minimum(y0+1,fs-1);tx=(fx-x0)[...,None];ty=(fy-y0)[...,None]
    samp=face[y0,x0]*(1-tx)*(1-ty)+face[y0,x1]*tx*(1-ty)+face[y1,x0]*(1-tx)*ty+face[y1,x1]*tx*ty
    col=samp*shade[...,None]*(1+tex[...,None]*0.9)*(1-edge[...,None])
    out=im.copy()
    # soft blend at the region border
    rm=Image.fromarray((region*255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.2))
    w=(np.array(rm).astype(float)/255)[...,None]
    out[...,:3]=out[...,:3]*(1-w)+np.clip(col,0,255)*w
    target=os.path.join(ROOT,'resources/styles/builtin/assets/applets',key)
    os.makedirs(target,exist_ok=True)
    Image.fromarray(out.astype(np.uint8),'RGBA').save(os.path.join(target,'peek-logo-v3.png'),optimize=True)
    print(key)
