from PIL import Image, ImageDraw
import math, random, os

def make_tex(name, color_rgb, size=2048):
    img = Image.new('RGB',(size,size),(0,0,0))
    bd = ImageDraw.Draw(img)
    cx=cy=size/2; R=size/2-2
    r,g,b = color_rgb
    random.seed(hash(name)%99999)
    step=3
    for y in range(0,size,step):
        for x in range(0,size,step):
            dx=(x-cx)/R; dy=(y-cy)/R; d=math.hypot(dx,dy)
            if d>1: continue
            light=max(0,(dx*0.7+dy*0.8))
            n=random.randint(-28,28)
            c=(max(0,min(255,int(r*light+40+n))),max(0,min(255,int(g*light+40+n))),max(0,min(255,int(b*light+40+n))))
            bd.rectangle([x,y,x+step,y+step],fill=c)
    img.save(os.path.join('assets/textures', name+'.jpg'),'JPEG',quality=93)

cols={'mercury':(172,170,168),'venus':(232,196,125),'earth':(52,120,235),
 'mars':(206,84,60),'jupiter':(216,160,106),'saturn':(230,201,138),
 'uranus':(120,205,210),'neptune':(66,100,215)}
for n,c in cols.items():
    make_tex(n+'-hi',c); print('OK',n)
make_tex('moon-hi',(198,198,198)); print('OK moon')
