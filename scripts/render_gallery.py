#!/usr/bin/env python3
"""Render the README gallery images from each tool's bundled samples.

    uv run python scripts/render_gallery.py

The laser-card-jig screenshot is captured from the running web app instead;
see tools/laser-card-jig/README.md.
"""

from __future__ import annotations

import sys
import tempfile
from pathlib import Path

from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[1]
TOOLS = ROOT / "tools"
OUT = ROOT / "docs" / "gallery"
WIDTH = 1200

for tool in ("jenga-maker", "lithophane-tiler", "longboard-griptape"):
    sys.path.insert(0, str(TOOLS / tool))

import griptape  # noqa: E402
import lithophane_tiler  # noqa: E402
import make_jenga_layout as jenga  # noqa: E402


def save(img: Image.Image, name: str, border: int = 24) -> None:
    img = img.convert("RGB")
    bbox = ImageOps.invert(img.convert("L")).getbbox()
    if bbox:
        img = img.crop(bbox)
    img = ImageOps.expand(img, border=border, fill="white")
    if img.width > WIDTH:
        img = img.resize((WIDTH, round(img.height * WIDTH / img.width)), Image.Resampling.LANCZOS)
    path = OUT / f"{name}.png"
    img.quantize(colors=128, dither=Image.Dither.FLOYDSTEINBERG).save(path, optimize=True)
    print(f"wrote {path.relative_to(ROOT)} ({img.width}x{img.height})")


def jenga_sheet() -> None:
    root = TOOLS / "jenga-maker" / "examples"
    params = jenga.LayoutParams(
        bed_w=381.0,
        bed_h=305.0,
        block_w=75.0,
        block_h=25.0,
        spacing=2.0,
        page_margin=6.0,
        raster_margin=1.0,
        template_tol=0.5,
        title_size_mm=None,
        title_sub_gap_mm=0.6,
        dot_diam_mm=1.5,
        dot_gap_mm=0.9,
        dot_vgap_mm=0.6,
        max_icon_ratio=0.20,
        text_icon_gap_mm=1.6,
        line_height=1.08,
        preview_dpi=200,
        icon_white_threshold=200,
    )
    with tempfile.TemporaryDirectory() as td:
        jenga.cmd_build(
            root, Path(td), "blocks.json", jenga.BUNDLED_SUBTITLE_FONT, jenga.BUNDLED_TITLE_FONT, params, {}
        )
        page = Image.open(Path(td) / "raster_page_01.png")
        save(page, "jenga-maker")


def lithophane_sheet() -> None:
    samples = TOOLS / "lithophane-tiler" / "samples"
    images = [Image.open(p) for p in lithophane_tiler.find_images(samples)]
    sheet, _ = lithophane_tiler.build_sheet(images, cols=3, padding=30)
    save(sheet, "lithophane-tiler")


def griptape_render() -> None:
    samples = TOOLS / "longboard-griptape" / "samples"
    deck = Image.open(samples / "deck.png")
    pattern = Image.open(samples / "sunset-pattern.png")
    out = griptape.render(deck, pattern, settings=griptape.GripSettings(grit=18, seed=7))
    save(out, "longboard-griptape", border=0)


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    jenga_sheet()
    lithophane_sheet()
    griptape_render()
