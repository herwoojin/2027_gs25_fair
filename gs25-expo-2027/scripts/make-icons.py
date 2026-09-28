#!/usr/bin/env python3
"""
아이콘 한 벌 만들기.

원본 이미지 하나로 앱 아이콘 · 파비콘 · 화면 로고까지 전부 만든다.
로고를 바꿀 때 파일을 여러 개 손대다 하나를 빠뜨리는 일을 막으려고 스크립트로 둔다.

    python3 scripts/make-icons.py <원본이미지>

만드는 것 (public/icons/)
    icon-192.png           안드로이드 · 매니페스트
    icon-512.png           안드로이드 · 매니페스트 · Play 등록정보
    icon-maskable-512.png  원형으로 잘려도 살아남게 안전영역 안에 축소 배치
    apple-touch-icon.png   아이폰 홈 화면 (180, 알파 없음 — iOS 가 직접 모서리를 깎는다)
    favicon-32.png         브라우저 탭
    brand-mark.png         화면 안 로고 (BrandMark 컴포넌트가 읽는다)

원본 조건: 정사각형 권장, 512px 이상, PNG.
"""
import sys
from pathlib import Path

from PIL import Image

OUT = Path(__file__).resolve().parent.parent / 'public' / 'icons'
SAFE = 0.78  # maskable 안전영역 — 원형 마스크로 잘려도 남는 비율


def trim_border(img: Image.Image) -> Image.Image:
    """가장자리의 단색/투명 여백을 걷어낸다. 여백이 남으면 아이콘이 작아 보인다."""
    if img.mode != 'RGBA':
        img = img.convert('RGBA')
    alpha = img.split()[3]
    box = alpha.getbbox()
    if box and (box[2] - box[0]) > 8:
        img = img.crop(box)
        if img.width > 8:
            return img
    # 알파가 없는 원본이면 모서리 색을 배경으로 보고 걷어낸다
    rgb = img.convert('RGB')
    bg = rgb.getpixel((0, 0))
    diff = Image.new('RGB', rgb.size, bg)
    from PIL import ImageChops

    box = ImageChops.difference(rgb, diff).convert('L').point(lambda p: 255 if p > 12 else 0).getbbox()
    return img.crop(box) if box else img


def square(img: Image.Image) -> Image.Image:
    """긴 쪽에 맞춰 정사각형 캔버스 가운데에 놓는다."""
    s = max(img.size)
    out = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    out.paste(img, ((s - img.width) // 2, (s - img.height) // 2), img)
    return out


def dominant_edge_color(img: Image.Image) -> tuple:
    """가장자리에서 가장 많이 쓰인 색 — maskable 배경으로 쓴다."""
    rgb = img.convert('RGB').resize((32, 32), Image.LANCZOS)
    px = rgb.load()
    counts: dict = {}
    for i in range(32):
        for x, y in ((i, 1), (i, 30), (1, i), (30, i)):
            counts[px[x, y]] = counts.get(px[x, y], 0) + 1
    return max(counts.items(), key=lambda kv: kv[1])[0]


def main() -> int:
    if len(sys.argv) < 2:
        print(__doc__)
        return 2
    src_path = Path(sys.argv[1]).expanduser()
    if not src_path.exists():
        print(f'원본을 찾지 못했습니다: {src_path}')
        return 1

    src = Image.open(src_path).convert('RGBA')
    if min(src.size) < 256:
        print(f'⚠️  원본이 작습니다({src.width}x{src.height}). 512px 이상을 권장합니다.')

    logo = square(trim_border(src))
    bg = dominant_edge_color(logo)
    OUT.mkdir(parents=True, exist_ok=True)

    def save_plain(size: int, name: str):
        logo.resize((size, size), Image.LANCZOS).save(OUT / name)

    save_plain(192, 'icon-192.png')
    save_plain(512, 'icon-512.png')
    save_plain(32, 'favicon-32.png')
    save_plain(256, 'brand-mark.png')

    # maskable — 배경을 가장자리까지 채우고 로고는 안전영역 안으로 줄인다
    s = 512
    mask = Image.new('RGBA', (s, s), bg + (255,))
    inner = int(s * SAFE)
    mask.paste(logo.resize((inner, inner), Image.LANCZOS), ((s - inner) // 2, (s - inner) // 2), logo.resize((inner, inner), Image.LANCZOS))
    mask.save(OUT / 'icon-maskable-512.png')

    # iOS — 알파 없이 평평하게. 모서리는 iOS 가 직접 깎는다.
    ios = Image.new('RGB', (180, 180), bg)
    small = logo.resize((180, 180), Image.LANCZOS)
    ios.paste(small, (0, 0), small)
    ios.save(OUT / 'apple-touch-icon.png')

    print(f'원본 {src.width}x{src.height} · 배경색 {bg}')
    for f in sorted(OUT.glob('*.png')):
        print(f'  {f.name:<24} {Image.open(f).size}')
    print('\n완료. 로고를 바꾸셨다면 public/sw.js 의 VERSION 도 올려 주세요(캐시 갱신).')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
