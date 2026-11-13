#!/usr/bin/env python3
"""Regenerate the procedural sample inputs used by every tool's quickstart.

All artwork here is drawn from code, so the samples are free to reuse (CC0).

    uv run python scripts/make_samples.py
"""

from __future__ import annotations

import json
import math
import re
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[1]
TOOLS = ROOT / "tools"
INK = 0
W = 14  # stroke width for line art


# --- pictograms ------------------------------------------------------------


def _canvas(size: int = 512) -> tuple[Image.Image, ImageDraw.ImageDraw]:
    img = Image.new("L", (size, size), 255)
    return img, ImageDraw.Draw(img)


def star(d: ImageDraw.ImageDraw, cx: float, cy: float, r: float, points: int = 5, fill=None) -> None:
    pts = []
    for i in range(points * 2):
        rad = r if i % 2 == 0 else r * 0.45
        a = math.pi * i / points - math.pi / 2
        pts.append((cx + rad * math.cos(a), cy + rad * math.sin(a)))
    d.polygon(pts, outline=INK, fill=fill, width=W)


def draw_sun(d, s):
    c = s / 2
    d.ellipse((c - 90, c - 90, c + 90, c + 90), outline=INK, width=W)
    for i in range(12):
        a = i * math.pi / 6
        d.line(
            (c + 120 * math.cos(a), c + 120 * math.sin(a), c + 190 * math.cos(a), c + 190 * math.sin(a)),
            fill=INK,
            width=W,
        )
    d.arc((c - 50, c - 30, c + 50, c + 50), 20, 160, fill=INK, width=W)
    d.ellipse((c - 40, c - 35, c - 20, c - 15), fill=INK)
    d.ellipse((c + 20, c - 35, c + 40, c - 15), fill=INK)


def draw_house(d, s):
    d.rectangle((120, 230, 392, 440), outline=INK, width=W)
    d.polygon([(90, 240), (256, 90), (422, 240)], outline=INK, width=W)
    d.rectangle((220, 320, 292, 440), outline=INK, width=W)
    d.rectangle((140, 270, 200, 320), outline=INK, width=W)
    d.rectangle((312, 270, 372, 320), outline=INK, width=W)
    d.rectangle((320, 110, 360, 190), outline=INK, width=W)


def draw_tree(d, s):
    d.rectangle((230, 330, 282, 460), outline=INK, width=W)
    for _i, (y, half) in enumerate([(120, 80), (190, 130), (260, 170)]):
        d.polygon([(256 - half, y + 90), (256, y - 40), (256 + half, y + 90)], outline=INK, width=W)
    star(d, 256, 70, 35, fill=INK)


def draw_mountains(d, s):
    d.polygon([(40, 440), (190, 160), (340, 440)], outline=INK, width=W)
    d.polygon([(200, 440), (340, 220), (480, 440)], outline=INK, width=W)
    d.line((150, 235, 190, 160, 230, 235), fill=INK, width=W)
    d.ellipse((380, 70, 450, 140), outline=INK, width=W)
    d.line((30, 450, 490, 450), fill=INK, width=W)


def draw_boat(d, s):
    d.polygon([(100, 330), (412, 330), (360, 410), (150, 410)], outline=INK, width=W)
    d.line((256, 330, 256, 90), fill=INK, width=W)
    d.polygon([(256, 100), (256, 300), (390, 300)], outline=INK, width=W)
    d.polygon([(246, 130), (246, 300), (140, 300)], outline=INK, width=W)
    for x in range(60, 460, 80):
        d.arc((x, 420, x + 80, 470), 200, 340, fill=INK, width=W)


def draw_flower(d, s):
    c = 256
    for i in range(8):
        a = i * math.pi / 4
        x, y = c + 85 * math.cos(a), 200 + 85 * math.sin(a)
        d.ellipse((x - 50, y - 50, x + 50, y + 50), outline=INK, width=W)
    d.ellipse((c - 45, 155, c + 45, 245), fill=INK)
    d.line((c, 290, c, 470), fill=INK, width=W)
    d.ellipse((c, 370, c + 90, 410), outline=INK, width=W)


def draw_cat(d, s):
    d.ellipse((120, 150, 392, 420), outline=INK, width=W)
    d.polygon([(140, 230), (150, 90), (230, 160)], outline=INK, width=W)
    d.polygon([(372, 230), (362, 90), (282, 160)], outline=INK, width=W)
    d.ellipse((190, 240, 230, 290), fill=INK)
    d.ellipse((282, 240, 322, 290), fill=INK)
    d.polygon([(240, 320), (272, 320), (256, 340)], fill=INK)
    for dy in (-15, 15):
        d.line((90, 330 + dy, 200, 335), fill=INK, width=8)
        d.line((422, 330 + dy, 312, 335), fill=INK, width=8)


def draw_rocket(d, s):
    d.polygon([(256, 60), (320, 170), (320, 360), (192, 360), (192, 170)], outline=INK, width=W)
    d.ellipse((226, 180, 286, 240), outline=INK, width=W)
    d.polygon([(192, 280), (130, 380), (192, 360)], outline=INK, width=W)
    d.polygon([(320, 280), (382, 380), (320, 360)], outline=INK, width=W)
    d.polygon([(220, 370), (256, 470), (292, 370)], outline=INK, width=W)


def draw_heart(d, s):
    pts = []
    for i in range(120):
        t = 2 * math.pi * i / 120
        x = 16 * math.sin(t) ** 3
        y = 13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t) - math.cos(4 * t)
        pts.append((256 + 12 * x, 250 - 12 * y))
    d.polygon(pts, outline=INK, width=W)
    star(d, 256, 250, 60, fill=INK)


def draw_bolt(d, s):
    d.polygon([(290, 50), (150, 290), (250, 290), (210, 470), (370, 210), (270, 210)], outline=INK, width=W)


def draw_star(d, s):
    star(d, 256, 266, 210)


def draw_gear(d, s):
    c = 256
    pts = []
    for i in range(48):
        a = i * 2 * math.pi / 48
        r = 200 if (i // 3) % 2 == 0 else 160
        pts.append((c + r * math.cos(a), c + r * math.sin(a)))
    d.polygon(pts, outline=INK, width=W)
    d.ellipse((c - 60, c - 60, c + 60, c + 60), outline=INK, width=W)


PICTOGRAMS = [
    draw_sun,
    draw_house,
    draw_tree,
    draw_mountains,
    draw_boat,
    draw_flower,
    draw_cat,
    draw_rocket,
    draw_heart,
    draw_bolt,
    draw_star,
    draw_gear,
]


def pictogram(i: int, size: int = 512) -> Image.Image:  # drawers assume 512px
    img, d = _canvas(size)
    PICTOGRAMS[i % len(PICTOGRAMS)](d, size)
    return img


# --- lithophane-tiler --------------------------------------------------------


def lithophane_samples() -> None:
    out = TOOLS / "lithophane-tiler" / "samples"
    out.mkdir(exist_ok=True)
    rng = np.random.default_rng(7)
    names = ["sun", "house", "tree", "mountains", "boat", "flower", "cat", "rocket", "heart"]
    for i, name in enumerate(names):
        art = pictogram(i)
        # Place each drawing on a differently sized, slightly gray page with soft edges
        # and a few stray specks, so trimming and thresholding have something to do.
        pad_x, pad_y = (int(v) for v in rng.integers(40, 220, size=2))
        page = Image.new("L", (512 + 2 * pad_x, 512 + 2 * pad_y), 238)
        page.paste(art.point(lambda v: 238 if v > 128 else v), (pad_x, pad_y))
        page = page.filter(ImageFilter.GaussianBlur(1.5))
        specks = ImageDraw.Draw(page)
        for _ in range(3):
            x, y = int(rng.integers(0, page.width)), int(rng.integers(0, page.height))
            specks.point((x, y), fill=30)
        page.save(out / f"{i + 1:02d}-{name}.png", optimize=True)


# --- longboard-griptape ------------------------------------------------------


def griptape_samples() -> None:
    out = TOOLS / "longboard-griptape" / "samples"
    out.mkdir(exist_ok=True)

    # Deck: maple top view on a white background; the grip area is solid black.
    w, h = 1200, 360
    deck = Image.new("RGB", (w, h), (255, 255, 255))
    d = ImageDraw.Draw(deck)
    d.rounded_rectangle((40, 40, w - 40, h - 40), radius=150, fill=(214, 170, 112), outline=(150, 105, 60), width=6)
    for y in range(60, h - 60, 14):
        d.line((120, y, w - 120, y + 6), fill=(200, 154, 98), width=2)
    d.rounded_rectangle((95, 75, w - 95, h - 75), radius=110, fill=(0, 0, 0))
    for x in (300, w - 300):
        for dx in (-40, 40):
            for dy in (-50, 50):
                d.ellipse((x + dx - 9, h // 2 + dy - 9, x + dx + 9, h // 2 + dy + 9), fill=(120, 120, 120))
    deck.save(out / "deck.png", optimize=True)

    # Pattern: a sunset with layered mountain ridges.
    pw, ph = 900, 260
    yy = np.linspace(0, 1, ph)[:, None]
    top, bottom = np.array([255, 94, 98]), np.array([255, 195, 113])
    sky = (top * (1 - yy[..., None]) + bottom * yy[..., None]).repeat(pw, axis=1)
    pattern = Image.fromarray(sky.astype(np.uint8), "RGB")
    pd = ImageDraw.Draw(pattern)
    pd.ellipse((pw // 2 - 70, 70, pw // 2 + 70, 210), fill=(255, 236, 170))
    colors = [(91, 44, 111), (58, 31, 93), (30, 20, 60)]
    rng = np.random.default_rng(3)
    for layer, color in enumerate(colors):
        base = 140 + layer * 40
        xs = np.linspace(0, pw, 14)
        ys = base + rng.normal(0, 22, len(xs))
        pd.polygon([(0, ph)] + list(zip(xs, ys, strict=False)) + [(pw, ph)], fill=color)
    pattern.save(out / "sunset-pattern.png", optimize=True)


# --- jenga-maker ---------------------------------------------------------------


def jenga_icons() -> None:
    root = TOOLS / "jenga-maker" / "examples"
    data = json.loads((root / "blocks.json").read_text())
    i = 0
    for category, prompts in data.items():
        folder = root / category
        folder.mkdir(exist_ok=True)
        seen: dict[str, int] = {}
        for prompt in prompts:
            title = re.search(r"\*(.*?)\*", prompt).group(1)
            base = re.sub(r"[^A-Za-z0-9]+", "", title.split()[0]).lower()
            seen[base] = seen.get(base, 0) + 1
            name = base if seen[base] == 1 else f"{base}{seen[base]}"
            pictogram(i).resize((256, 256), Image.Resampling.LANCZOS).save(folder / f"{name}.png", optimize=True)
            i += 1


# --- laser-card-jig ------------------------------------------------------------


def laser_card_sample() -> None:
    out = TOOLS / "laser-card-jig" / "samples"
    out.mkdir(exist_ok=True)
    fonts = TOOLS / "jenga-maker" / "fonts"
    card = Image.new("L", (850, 550), 255)
    d = ImageDraw.Draw(card)
    d.rounded_rectangle((20, 20, 830, 530), radius=40, outline=0, width=10)
    card.paste(pictogram(7).resize((300, 300)), (500, 140))
    title = ImageFont.truetype(str(fonts / "BagelFatOne-Regular.ttf"), 96)
    body = ImageFont.truetype(str(fonts / "NataSans-Variable.ttf"), 40)
    d.text((70, 150), "MAKER", font=title, fill=0)
    d.text((70, 250), "NIGHT", font=title, fill=0)
    d.text((74, 380), "build something weird", font=body, fill=60)
    card.save(out / "card-art.png", optimize=True)


if __name__ == "__main__":
    lithophane_samples()
    griptape_samples()
    jenga_icons()
    laser_card_sample()
    print("Samples written under tools/*/samples and tools/jenga-maker/examples")
