import os
from PIL import Image, ImageFilter, ImageOps
import math

BASE = r"C:\Users\fengl\Desktop\沙盒源码\fengmax.github.io\assets\textures"
PY = r"C:\Users\fengl\.workbuddy\binaries\python\envs\default\Scripts\python.exe"

def sobel_normal(src_path, dst_path, strength=2.0, size=(1024, 512)):
    """从颜色图(albedo)的亮度梯度生成近似切线空间法线贴图。"""
    im = Image.open(src_path).convert("L").resize(size, Image.BICUBIC)
    # 轻微模糊减少噪点导致的锯齿法线
    im = im.filter(ImageFilter.GaussianBlur(radius=0.6))
    w, h = im.size
    px = im.load()
    out = Image.new("RGB", (w, h))
    op = out.load()
    def lum(x, y):
        x = x % w
        y = max(0, min(h - 1, y))
        return px[x, y]
    for y in range(h):
        for x in range(w):
            # Sobel 算子
            gx = (lum(x+1, y-1) + 2*lum(x+1, y) + lum(x+1, y+1)) - \
                 (lum(x-1, y-1) + 2*lum(x-1, y) + lum(x-1, y+1))
            gy = (lum(x-1, y+1) + 2*lum(x, y+1) + lum(x+1, y+1)) - \
                 (lum(x-1, y-1) + 2*lum(x, y-1) + lum(x+1, y-1))
            nx = -gx * strength / 255.0
            ny = -gy * strength / 255.0
            nz = 1.0
            inv = 1.0 / math.sqrt(nx*nx + ny*ny + nz*nz)
            nx, ny, nz = nx*inv, ny*inv, nz*inv
            r = int((nx * 0.5 + 0.5) * 255)
            g = int((ny * 0.5 + 0.5) * 255)
            b = int((nz * 0.5 + 0.5) * 255)
            op[x, y] = (r, g, b)
    out.save(dst_path, "JPEG", quality=82, optimize=True)
    print("normal ->", os.path.basename(dst_path), os.path.getsize(dst_path)//1024, "KB")

# 1) 压缩已下载的 Earth 真实贴图
print("=== optimize earth real textures ===")
# 法线图: 2048x1024 -> 1024x512
n = Image.open(os.path.join(BASE, "earth-normal.jpg")).convert("RGB").resize((1024, 512), Image.BICUBIC)
n.save(os.path.join(BASE, "earth-normal.jpg"), "JPEG", quality=85, optimize=True)
print("earth-normal.jpg", os.path.getsize(os.path.join(BASE, "earth-normal.jpg"))//1024, "KB")
# 云层: 1024x512 已是, 仅优化
c = Image.open(os.path.join(BASE, "earth-clouds.png"))
if c.size[0] > 1024:
    c = c.resize((1024, 512), Image.BICUBIC)
c.save(os.path.join(BASE, "earth-clouds.png"), "PNG", optimize=True)
print("earth-clouds.png", os.path.getsize(os.path.join(BASE, "earth-clouds.png"))//1024, "KB")
# 海洋高光: 2048x1024 -> 1024x512
s = Image.open(os.path.join(BASE, "earth-specular.jpg")).convert("L").resize((1024, 512), Image.BICUBIC)
s.save(os.path.join(BASE, "earth-specular.jpg"), "JPEG", quality=85, optimize=True)
print("earth-specular.jpg", os.path.getsize(os.path.join(BASE, "earth-specular.jpg"))//1024, "KB")

# 2) 为其余行星生成法线贴图 (从 -hi 颜色图取更多细节)
print("=== generate normal maps from albedo ===")
# key -> (源文件, 强度)
planets = {
    "moon": ("moon-hi.jpg", 2.2),
    "mercury": ("mercury-hi.jpg", 1.8),
    "venus": ("venus-hi.jpg", 1.0),
    "mars": ("mars-hi.jpg", 2.0),
    "jupiter": ("jupiter-hi.jpg", 1.2),
    "saturn": ("saturn-hi.jpg", 1.2),
    "uranus": ("uranus-hi.jpg", 0.8),
    "neptune": ("neptune-hi.jpg", 0.8),
}
for key, (src, st) in planets.items():
    sp = os.path.join(BASE, src)
    if not os.path.exists(sp):
        print("skip (no source)", key, src); continue
    sobel_normal(sp, os.path.join(BASE, key + "-normal.jpg"), strength=st)

print("=== done ===")
