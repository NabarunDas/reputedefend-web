#!/usr/bin/env python3
"""Derive website logo variants from the owner-supplied ProfileRelaunch artwork.

Does not redraw the symbol. Crops the supplied PNG, removes the tagline for
header use, and recolors dark greens to paper for dark-background variants.
"""

from __future__ import annotations

from pathlib import Path
import shutil
import sys

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SRC = ROOT / "public/brand/profile-relaunch-source.png"
BRAND = ROOT / "public/brand"
PAPER = (247, 248, 243)
FOREST = (16, 38, 31)
GREEN = (10, 110, 60)


def luma(r: int, g: int, b: int) -> float:
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def content_bbox(img: Image.Image, pad: int = 0) -> tuple[int, int, int, int]:
    pixels = img.load()
    width, height = img.size
    minx, miny, maxx, maxy = width, height, 0, 0
    found = False
    for y in range(height):
        for x in range(width):
            if pixels[x, y][3] >= 10:
                found = True
                minx, miny = min(minx, x), min(miny, y)
                maxx, maxy = max(maxx, x), max(maxy, y)
    if not found:
        return (0, 0, width, height)
    return (
        max(0, minx - pad),
        max(0, miny - pad),
        min(width, maxx + 1 + pad),
        min(height, maxy + 1 + pad),
    )


def recolor_light(img: Image.Image, paper: tuple[int, int, int] = PAPER) -> Image.Image:
    out = img.copy()
    pixels = out.load()
    width, height = out.size
    for y in range(height):
        for x in range(width):
            r, g, b, a = pixels[x, y]
            if a == 0:
                continue
            brightness = luma(r, g, b)
            if brightness < 62:
                t = 0.0
            elif brightness > 118:
                t = 1.0
            else:
                t = (brightness - 62) / (118 - 62)
            pixels[x, y] = (
                int(paper[0] * (1 - t) + r * t),
                int(paper[1] * (1 - t) + g * t),
                int(paper[2] * (1 - t) + b * t),
                a,
            )
    return out


def to_mono(img: Image.Image, color: tuple[int, int, int] = FOREST) -> Image.Image:
    out = img.copy()
    pixels = out.load()
    width, height = out.size
    for y in range(height):
        for x in range(width):
            r, g, b, a = pixels[x, y]
            if a:
                pixels[x, y] = (*color, a)
    return out


def erase_tagline(img: Image.Image) -> Image.Image:
    out = img.copy()
    pixels = out.load()
    width, height = out.size
    for y in range(410, height):
        for x in range(450, width):
            if pixels[x, y][3]:
                pixels[x, y] = (0, 0, 0, 0)
    return out


def to_square(img: Image.Image, size: int, pad_ratio: float = 0.14) -> Image.Image:
    crop = img.crop(content_bbox(img))
    cw, ch = crop.size
    side = int(max(cw, ch) * (1 + pad_ratio * 2))
    canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    canvas.paste(crop, ((side - cw) // 2, (side - ch) // 2), crop)
    return canvas.resize((size, size), Image.Resampling.LANCZOS)


def save(img: Image.Image, path: Path) -> None:
    img.save(path, format="PNG", optimize=True, compress_level=9)


def on_paper(img: Image.Image, size: int = 256) -> Image.Image:
    squared = to_square(img, size, pad_ratio=0.16)
    background = Image.new("RGBA", (size, size), (*PAPER, 255))
    return Image.alpha_composite(background, squared)


def main() -> int:
    src = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_SRC
    if not src.exists():
        raise SystemExit(f"Missing source artwork: {src}")

    BRAND.mkdir(parents=True, exist_ok=True)
    if src.resolve() != (BRAND / "profile-relaunch-source.png").resolve():
        shutil.copyfile(src, BRAND / "profile-relaunch-source.png")

    original = Image.open(src).convert("RGBA")
    lockup = original.crop(content_bbox(original, pad=24))
    header = erase_tagline(original).crop(content_bbox(erase_tagline(original), pad=24))
    mark_src = original.crop((50, 120, 445, 545))
    mark = to_square(mark_src, 512, pad_ratio=0.12)

    save(header, BRAND / "profile-relaunch-logo.png")
    save(recolor_light(header), BRAND / "profile-relaunch-logo-light.png")
    save(to_mono(header), BRAND / "profile-relaunch-logo-mono.png")
    save(lockup, BRAND / "profile-relaunch-lockup.png")
    save(recolor_light(lockup), BRAND / "profile-relaunch-lockup-light.png")
    save(mark, BRAND / "profile-relaunch-mark.png")
    save(recolor_light(mark), BRAND / "profile-relaunch-mark-light.png")
    save(to_mono(mark, GREEN), BRAND / "profile-relaunch-mark-mono.png")

    icon = on_paper(mark_src, 256)
    for dest in (
        ROOT / "public/icon.png",
        ROOT / "public/apple-icon.png",
        ROOT / "app/icon.png",
        ROOT / "app/apple-icon.png",
    ):
        save(icon, dest)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
