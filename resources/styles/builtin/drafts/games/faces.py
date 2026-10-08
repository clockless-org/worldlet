from PIL import Image,ImageDraw,ImageFont,ImageFilter
import math,random
S=1000
BOLD='/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
def font(n):return ImageFont.truetype(BOLD,n)
def base(color):
    im=Image.new('RGBA',(S,S),color);return im,ImageDraw.Draw(im)
def text(d,xy,s,size,fill):
    f=font(size);d.text(xy,s,font=f,fill=fill,anchor='mm')
def tile(d,box,fill,r=40,edge=None):
    x0,y0,x1,y1=box
    if edge:d.rounded_rectangle((x0,y0+12,x1,y1+12),r,fill=edge)
    d.rounded_rectangle(box,r,fill=fill)
def f2048():
    im,d=base('#bfae94')
    vals=[('2','#f1e6cf','#6b5a45'),('0','#ecd9b0','#6b5a45'),('4','#e8a85a','#fff8ec'),('8','#d9733f','#fff8ec')]
    g=24;w=(S-160-g)/2
    d.rounded_rectangle((70,70,S-70,S-70),70,fill='#a99678')
    for i,(v,c,t) in enumerate(vals):
        x=80+(i%2)*(w+g)+0;y=80+(i//2)*(w+g)
        tile(d,(x+10,y+10,x+w,y+w),c,56,edge='#8f7c60')
        text(d,(x+w/2+5,y+w/2+5),v,300,t)
    return im
def snake():
    im,d=base('#a9c48a')
    n=10;c=S/n
    for i in range(n):
        for j in range(n):
            if (i+j)%2:d.rectangle((i*c,j*c,(i+1)*c,(j+1)*c),fill='#b8d099')
    pts=[(2,7),(3,7),(4,7),(5,7),(5,6),(5,5),(4,5),(3,5),(3,4),(3,3),(4,3),(5,3),(6,3),(7,3)]
    for k,(x,y) in enumerate(pts):
        col='#3f6f4f' if k%2 else '#4b7d59'
        if k==len(pts)-1:col='#2f5a40'
        d.rounded_rectangle((x*c+8,y*c+8,(x+1)*c-8,(y+1)*c-8),28,fill=col)
    hx,hy=pts[-1]
    for dy in (-18,18):d.ellipse((hx*c+c/2+14-9,hy*c+c/2+dy-9,hx*c+c/2+14+9,hy*c+c/2+dy+9),fill='#f4f0e5')
    ax,ay=7,6
    d.ellipse((ax*c+12,ay*c+18,(ax+1)*c-12,(ay+1)*c-6),fill='#c8553d')
    d.rectangle((ax*c+c/2-5,ay*c+4,ax*c+c/2+5,ay*c+26),fill='#6b4a2e')
    d.ellipse((ax*c+c/2+2,ay*c+2,ax*c+c/2+34,ay*c+22),fill='#5f8a3a')
    return im
def mines():
    im,d=base('#8f9f80')
    n=6;c=S/n
    nums={(1,1):('1','#3f6fa8'),(2,1):('2','#3f7f4f'),(3,2):('3','#b84a3a'),(1,3):('1','#3f6fa8'),(2,3):('2','#3f7f4f')}
    opened={(1,1),(2,1),(3,1),(1,2),(2,2),(3,2),(1,3),(2,3),(4,1),(1,4),(2,4)}
    for i in range(n):
        for j in range(n):
            x0,y0=i*c,j*c
            if (i,j) in opened:
                d.rectangle((x0+4,y0+4,x0+c-4,y0+c-4),fill='#e8dfc9')
                if (i,j) in nums:v,t=nums[(i,j)];text(d,(x0+c/2,y0+c/2+4),v,110,t)
            else:
                d.rounded_rectangle((x0+6,y0+6,x0+c-6,y0+c-6),18,fill='#a7b796')
                d.rounded_rectangle((x0+6,y0+6,x0+c-12,y0+c-14),16,fill='#b6c5a4')
    # flag
    fx,fy=4*c,2*c
    d.rectangle((fx+c/2-6,fy+30,fx+c/2+6,fy+c-30),fill='#5a4632')
    d.polygon([(fx+c/2+6,fy+30),(fx+c-30,fy+62),(fx+c/2+6,fy+96)],fill='#c8553d')
    d.rectangle((fx+44,fy+c-40,fx+c-44,fy+c-28),fill='#5a4632')
    # mine
    mx,my=3*c+c/2,3*c+c/2
    for a in range(8):
        ang=a*math.pi/4;d.line((mx,my,mx+math.cos(ang)*62,my+math.sin(ang)*62),fill='#2b2b2b',width=14)
    d.ellipse((mx-44,my-44,mx+44,my+44),fill='#2b2b2b');d.ellipse((mx-24,my-24,mx-8,my-8),fill='#f4f0e5')
    return im
def sudoku():
    im,d=base('#f1e8d2')
    m=60;c=(S-2*m)/9
    grid=['5 3 . . 7 . . . .','6 . . 1 9 5 . . .','. 9 8 . . . . 6 .','8 . . . 6 . . . 3','4 . . 8 . 3 . . 1','7 . . . 2 . . . 6','. 6 . . . . 2 8 .','. . . 4 1 9 . . 5','. . . . 8 . . 7 9']
    for r,row in enumerate(grid):
        for k,v in enumerate(row.split()):
            if (r//3+k//3)%2==0:d.rectangle((m+k*c,m+r*c,m+(k+1)*c,m+(r+1)*c),fill='#e6dcc2')
    for r,row in enumerate(grid):
        for k,v in enumerate(row.split()):
            if v!='.':text(d,(m+k*c+c/2,m+r*c+c/2+3),v,72,'#2f4f6f' if (r+k)%3 else '#203b30')
    for i in range(10):
        w=12 if i%3==0 else 4
        d.line((m+i*c,m,m+i*c,S-m),fill='#4f6f7f',width=w);d.line((m,m+i*c,S-m,m+i*c),fill='#4f6f7f',width=w)
    return im
def breakout():
    im,d=base('#ece3cf')
    cols=['#c8553d','#d9813f','#e3b04b','#91b17d','#5c9a7b','#4f7f9e']
    m=80;g=14;bw=(S-2*m-4*g)/5;bh=56
    for r,c in enumerate(cols):
        for k in range(5):
            if (r,k) in [(4,1),(5,1),(5,2),(3,3),(5,4)]:continue
            x=m+k*(bw+g);y=170+r*(bh+g)
            d.rounded_rectangle((x,y+8,x+bw,y+bh+8),14,fill='#00000030')
            d.rounded_rectangle((x,y,x+bw,y+bh),14,fill=c)
            d.rectangle((x+12,y+8,x+bw-12,y+16),fill='#ffffff40')
    d.ellipse((560-34,700-34,560+34,700+34),fill='#2f5a40')
    d.rounded_rectangle((360,800,640,840),20,fill='#7a5537')
    d.rectangle((380,806,620,812),fill='#c79a5a')
    return im
def random_game():
    im,d=base('#e8dcc0')
    # The pool around the edge: a brick row, a memory card, a lantern, a 15-puzzle tile and noughts and crosses.
    for k,c in enumerate(['#c8553d','#d9813f','#e3b04b']):d.rounded_rectangle((150+k*110,150,250+k*110,196),12,fill=c)
    d.rounded_rectangle((640,130,800,330),24,fill='#4f7f9e');d.rounded_rectangle((664,154,776,306),16,outline='#f4f0e5',width=10)
    d.ellipse((130,640,300,810),fill='#e3c25b');d.ellipse((175,685,255,765),fill='#f6e7a8')
    tile(d,(650,650,830,830),'#c79a5a',30,edge='#7a5537');text(d,(740,742),'15',96,'#fff8ec')
    d.line((170,330,250,410),fill='#5c9a7b',width=22);d.line((250,330,170,410),fill='#5c9a7b',width=22)
    d.ellipse((740,430,840,530),outline='#5c9a7b',width=20)
    # A big die with a question mark in the middle.
    tile(d,(330,330,670,670),'#c8553d',70,edge='#8f3b2a')
    text(d,(500,505),'?',300,'#fff8ec')
    return im
def garden():
    im,d=base('#a9c48a')
    # Three furrows of tilled soil on a grass bed.
    for k in range(3):
        y=170+k*250
        d.rounded_rectangle((110,y,890,y+170),70,fill='#6b4a2e')
        d.rounded_rectangle((110,y,890,y+150),70,fill='#8a6340')
    def leaves(x,y,s):
        d.ellipse((x-70*s,y-60*s,x+5*s,y-5*s),fill='#5c9a7b');d.ellipse((x-5*s,y-60*s,x+70*s,y-5*s),fill='#7fb069')
        d.line((x,y,x,y-30*s),fill='#3f7f4f',width=int(12*s))
    # Top row: sprouts. Middle: a carrot and lettuces. Bottom: a pumpkin and a tomato, ripe.
    for x in (240,420,600,780):leaves(x,265,.8)
    leaves(250,500,1);d.polygon([(205,470),(295,470),(250,600)],fill='#e07a32')
    for x in (500,740):
        d.ellipse((x-80,x*0+400,x+80,x*0+540),fill='#5c9a7b');d.ellipse((x-60,410,x+10,500),fill='#7fb069');d.ellipse((x-10,410,x+60,500),fill='#7fb069');d.ellipse((x-35,395,x+35,465),fill='#a6cf8a')
    leaves(330,700,1);d.ellipse((210,680,450,820),fill='#e3962f')
    for x in (290,370):d.arc((x-70,680,x+70,820),250,110,fill='#c4741f',width=8)
    d.rectangle((322,650,338,690),fill='#6b4a2e')
    leaves(680,690,.9);d.ellipse((600,690,760,840),fill='#c8453a');d.polygon([(640,700),(680,720),(720,700),(705,735),(655,735)],fill='#3f7f4f');d.ellipse((630,725,660,755),fill='#e98a7f')
    return im
FACES={'game-2048':f2048,'snake':snake,'minesweeper':mines,'sudoku':sudoku,'random-game':random_game,'garden':garden}
