# -*- coding: utf-8 -*-
"""梯队2素材: 地球/月球/火星 2K 高清纹理 + 改进法线生成(多尺度Sobel)
输入: earth_atmos_2048.jpg / moon_2k_src.jpg / mars_2k_src.jpg (2048x1024)
输出: {key}-hi.jpg (2048宽, 质量80) / {key}-normal.jpg (法线)
"""
from PIL import Image, ImageFilter, ImageOps
import math, os

OUT = os.path.dirname(os.path.abspath(__file__))

def compress(src, dst, max_w=2048, quality=80):
    im = Image.open(src).convert('RGB')
    if im.width > max_w:
        im = im.resize((max_w, int(im.height * max_w / im.width)), Image.LANCZOS)
    im.save(dst, 'JPEG', quality=quality, optimize=True, progressive=True)
    print('saved', dst, im.size, os.path.getsize(dst), 'bytes')

def sobel_normal(img_l, strength=1.0):
    """单尺度 Sobel -> 法线 (RGB, B=255)"""
    gx = img_l.filter(ImageFilter.Kernel((3, 3),
        [-1, 0, 1, -2, 0, 2, -1, 0, 1], scale=1))
    gy = img_l.filter(ImageFilter.Kernel((3, 3),
        [-1, -2, -1, 0, 0, 0, 1, 2, 1], scale=1))
    # 像素级合并(2M像素, Pillow filter 是 C 实现, 这里用 Image.composite 逐通道会慢,
    # 用 point 表映射加速: nx = 128 - gx*strength, ny = 128 - gy*strength, b=255)
    def remap(im, scale):
        lut = []
        for i in range(256):
            v = 128 - (i - 128) * scale
            lut.append(max(0, min(255, int(v))))
        return im.point(lut)
    rx = remap(gx, strength)
    ry = remap(gy, strength)
    b = Image.new('L', img_l.size, 255)
    return Image.merge('RGB', [rx, ry, b])

def gen_normal(src, dst, strength=1.0, smooth=1, out_w=1024, quality=82):
    im = Image.open(src).convert('RGB')
    gray = ImageOps.grayscale(im)
    if smooth:
        gray = gray.filter(ImageFilter.GaussianBlur(smooth))
    n = sobel_normal(gray, strength)
    if n.width > out_w:
        n = n.resize((out_w, int(n.height * out_w / n.width)), Image.LANCZOS)
    n.save(dst, 'JPEG', quality=quality, optimize=True, progressive=True)
    print('saved', dst, n.size, os.path.getsize(dst), 'bytes')

def main():
    SRC = os.path.join(OUT, 'assets', 'textures')
    # 1) 高清颜色图(懒加载 -hi)
    compress(os.path.join(SRC, 'earth_atmos_2048.jpg'), os.path.join(SRC, 'earth-hi.jpg'), quality=80)
    compress(os.path.join(SRC, 'moon_2k_src.jpg'),    os.path.join(SRC, 'moon-hi.jpg'),    quality=80)
    compress(os.path.join(SRC, 'mars_2k_src.jpg'),    os.path.join(SRC, 'mars-hi.jpg'),    quality=80)
    # 2) 法线(从 2K 源生成再缩到 1024, 体积可控且首屏全局加载不超标)
    gen_normal(os.path.join(SRC, 'moon_2k_src.jpg'), os.path.join(SRC, 'moon-normal.jpg'), strength=1.3, smooth=0, out_w=1024, quality=82)
    gen_normal(os.path.join(SRC, 'mars_2k_src.jpg'), os.path.join(SRC, 'mars-normal.jpg'), strength=1.1, smooth=1, out_w=1024, quality=82)
    # 3) 清理下载原图
    for f in ['earth_atmos_2048.jpg', 'moon_2k_src.jpg', 'mars_2k_src.jpg']:
        p = os.path.join(SRC, f)
        if os.path.exists(p):
            os.remove(p)
            print('cleaned', f)

if __name__ == '__main__':
    main()
