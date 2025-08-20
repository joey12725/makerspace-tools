#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
make_jenga_layout.py — TILE-RASTER RENDERER (clean icons, no text overlap)

What’s fixed
  • No rectangles on raster pages.
  • Title/subtitle never overlap (uses real text bbox).
  • Icons: no gray haze; opaque white backgrounds become transparent (configurable threshold).
  • If an icon already has proper transparency, it stays crisp (no reprocessing).
  • Fonts: auto-use title.ttf / subtitle.ttf from project root (or pass via flags).
  • Dots render below the icon, centered within the icon column, with reserved height so the image cannot overlap them.

Usage (same as before). Optional tuning:
  --icon-white-threshold 200   # 0..255: >= threshold -> transparent (try 200–230, or ~128 for half-way)
  --title-sub-gap-mm 0.6       # vertical gap below title
  --dot-vgap-mm 0.6            # vertical gap between icon bottom and dots

Dependencies:
  pip install pillow
"""

from __future__ import annotations

import argparse
import base64
import io
import json
import math
import re
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional, Tuple

from PIL import Image, ImageDraw, ImageFont, ImageOps, ImageFilter

# -----------------------------
# Units & conversions
# -----------------------------
MM_PER_INCH = 25.4

def mm_to_px_img(mm: float, dpi: int) -> int:
    return int(round(mm * dpi / MM_PER_INCH))

# -----------------------------
# Defaults
# -----------------------------
CATEGORY_DEFAULT_DOTS = {
    "drinking": 1,
    "truth": 2,
    "dare": 3,
    "spicy": 4,
}
TITLE_PATTERN = re.compile(r"\*(.*?)\*")  # *Title* capture

# -----------------------------
# Data structures
# -----------------------------
@dataclass
class BlockItem:
    category: str
    title: str
    subtitle: str
    dot_count: int
    image_path: Optional[Path]
    expected_image_name: str

@dataclass
class LayoutParams:
    bed_w: float
    bed_h: float
    block_w: float
    block_h: float
    spacing: float
    page_margin: float
    raster_margin: float
    template_tol: float
    title_size_mm: Optional[float]
    title_sub_gap_mm: float
    dot_diam_mm: float
    dot_gap_mm: float
    dot_vgap_mm: float
    max_icon_ratio: float
    text_icon_gap_mm: float
    line_height: float
    preview_dpi: int
    icon_white_threshold: int  # 0..255
    # Color mode (optional)
    color_mode: bool = False
    title_rgb: Optional[Tuple[int, int, int]] = None
    subtitle_rgb: Optional[Tuple[int, int, int]] = None
    background_style: str = "none"  # none|solid|per-category|gradient
    background_rgb: Optional[Tuple[int, int, int]] = None
    background_per_category: Optional[Dict[str, Tuple[int, int, int]]] = None
    background_grad_0: Optional[Tuple[int, int, int]] = None
    background_grad_1: Optional[Tuple[int, int, int]] = None
    # Dots options
    dots_enabled: bool = True
    dot_rgb: Optional[Tuple[int, int, int]] = None

# -----------------------------
# Files & JSON
# -----------------------------
def parse_dot_map(arg: Optional[str]) -> Dict[str, int]:
    if not arg:
        return dict(CATEGORY_DEFAULT_DOTS)
    res = dict(CATEGORY_DEFAULT_DOTS)
    for pair in [x.strip() for x in arg.split(",") if x.strip()]:
        if "=" not in pair:
            continue
        k, v = pair.split("=", 1)
        try:
            res[k.strip().lower()] = int(v.strip())
        except Exception:
            pass
    return res

def parse_blocks_json(root: Path, json_name: str, dot_map: Dict[str, int]) -> List[BlockItem]:
    path = root / json_name
    if not path.exists():
        raise FileNotFoundError(f"Could not find {json_name} at {root}")
    data = json.loads(path.read_text(encoding="utf-8"))

    items: List[BlockItem] = []
    for cat_key, arr in data.items():
        cat = cat_key.strip().lower()
        dots = dot_map.get(cat, 1)
        # track per-category counts for the sanitized first word
        name_counts: Dict[str, int] = {}
        for raw in arr:
            s = raw.strip()
            m = TITLE_PATTERN.search(s)
            if not m:
                title = s.split()[0] if s else ""
                subtitle = s
            else:
                title = m.group(1).strip()
                subtitle = s[m.end():].strip()
            base = sanitize_first_word_for_filename(title)
            cnt = name_counts.get(base, 0) + 1
            name_counts[base] = cnt
            expected_name = base if cnt == 1 else f"{base}{cnt}"
            img_path = find_image_for_block(root, cat, base, occurrence=cnt)
            items.append(BlockItem(cat, title, subtitle, dots, img_path, expected_name))
    return items

# -----------------------------
# Icon helpers
# -----------------------------
def sanitize_first_word_for_filename(title: str) -> str:
    first = title.strip().split()[0] if title.strip() else ""
    return re.sub(r"[^A-Za-z0-9]+", "", first).lower()

def find_category_dir(root: Path, category: str) -> Optional[Path]:
    for p in root.iterdir():
        if p.is_dir():
            norm = re.sub(r"[\s_-]+", "", p.name.strip().lower())
            if norm == re.sub(r"[\s_-]+", "", category.lower()):
                return p
    return None

def find_image_for_block(root: Path, category: str, title: str, occurrence: int = 1) -> Optional[Path]:
    """Find image file for a block within the given category.

    The lookup is based on the sanitized first word. For the first occurrence we
    look for "word.png", for the second occurrence "word2.png", etc.
    """
    cat_dir = find_category_dir(root, category)
    if not cat_dir:
        return None
    base = sanitize_first_word_for_filename(title)
    candidate = base if occurrence == 1 else f"{base}{occurrence}"
    p = cat_dir / f"{candidate}.png"
    if p.exists() and p.is_file():
        return p
    return None

def icon_to_black_clean(im: Image.Image, white_threshold: int = 245) -> Image.Image:
    """
    Treat white as transparent while preserving original colors.

    Behavior:
      • If the image already has transparency, keep its RGBA as-is (no reprocessing).
      • If fully opaque, compute an alpha mask by thresholding near-white pixels to 0
        (transparent) and keeping non-white pixels opaque. RGB colors are preserved.

    This removes white boxes without turning artwork black.
    """
    im = im.convert("RGBA")
    r, g, b, a = im.split()
    min_a, max_a = a.getextrema()

    if min_a < 255:  # already has transparency: keep original
        return im

    # Build a mask where near-white becomes transparent
    lum = ImageOps.grayscale(im)  # 0..255
    # Anything >= threshold is treated as background (alpha=0)
    mask = lum.point(lambda v, t=white_threshold: 0 if v >= t else 255)
    # Light cleanup so small specks vanish without soft halos
    mask = mask.filter(ImageFilter.MedianFilter(3))

    return Image.merge("RGBA", (r, g, b, mask))

# -----------------------------
# Color helpers
# -----------------------------
def parse_hex_color(s: Optional[str]) -> Optional[Tuple[int, int, int]]:
    if not s or not isinstance(s, str):
        return None
    x = s.strip()
    if x.startswith('#'):
        x = x[1:]
    if len(x) == 3:
        try:
            r = int(x[0] * 2, 16)
            g = int(x[1] * 2, 16)
            b = int(x[2] * 2, 16)
            return (r, g, b)
        except Exception:
            return None
    if len(x) == 6:
        try:
            return (int(x[0:2], 16), int(x[2:4], 16), int(x[4:6], 16))
        except Exception:
            return None
    return None

# -----------------------------
# Font helpers (Pillow)
# -----------------------------
def autofind_font(root: Path, candidates: List[str]) -> Optional[Path]:
    for name in candidates:
        p = root / name
        if p.exists():
            return p
    return None

def load_font(path: Optional[Path], size_px: int) -> ImageFont.FreeTypeFont:
    if path and path.exists():
        try:
            return ImageFont.truetype(str(path), size_px)
        except Exception:
            pass
    # fallback to DejaVuSans (bundled with Pillow) to avoid tiny bitmap font
    try:
        from PIL import __file__ as pil_file
        pil_dir = Path(pil_file).parent
        djv = pil_dir / "fonts" / "DejaVuSans.ttf"
        if djv.exists():
            return ImageFont.truetype(str(djv), size_px)
    except Exception:
        pass
    return ImageFont.load_default()

def text_wh(text: str, font: ImageFont.FreeTypeFont) -> Tuple[int, int]:
    bbox = font.getbbox(text or "")
    return bbox[2] - bbox[0], bbox[3] - bbox[1]

def wrap_to_lines(text: str, font: ImageFont.FreeTypeFont, max_width_px: int, max_lines: int = 2) -> Optional[List[str]]:
    words = (text or "").split()
    if not words:
        return [""]
    lines: List[str] = []
    cur = words[0]
    for w in words[1:]:
        test = cur + " " + w
        if text_wh(test, font)[0] <= max_width_px:
            cur = test
        else:
            lines.append(cur)
            cur = w
            if len(lines) == max_lines:
                return None
    lines.append(cur)
    return lines

# -----------------------------
# Grid & subtitle sizing
# -----------------------------
def best_grid(bed_w: float, bed_h: float, block_w: float, block_h: float, spacing: float, page_margin: float) -> Tuple[int, int, float, float]:
    usable_w = bed_w - 2 * page_margin
    usable_h = bed_h - 2 * page_margin
    step_x = block_w + spacing
    step_y = block_h + spacing
    cols = int((usable_w + spacing) // step_x) if step_x > 0 else 0
    rows = int((usable_h + spacing) // step_y) if step_y > 0 else 0
    if cols < 1 or rows < 1:
        raise ValueError("Bed too small for given block size/margins/spacing.")
    total_w = cols * block_w + (cols - 1) * spacing
    total_h = rows * block_h + (rows - 1) * spacing
    start_x = page_margin + (usable_w - total_w) / 2.0
    start_y = page_margin + (usable_h - total_h) / 2.0
    return cols, rows, start_x, start_y

def compute_subtitle_font_mm(items: List[BlockItem], params: LayoutParams, font_regular: Optional[Path], dpi: int) -> float:
    icon_alloc_w = params.block_w * params.max_icon_ratio
    text_w_mm = params.block_w - 2 * params.raster_margin - params.text_icon_gap_mm - icon_alloc_w
    if text_w_mm <= 1.0:
        raise ValueError("Text width too small; reduce margins or icon ratio.")
    text_w_px = mm_to_px_img(text_w_mm, dpi)

    title_mm = params.title_size_mm if params.title_size_mm else (params.block_h * 0.36)
    # Allow text to extend to the bottom-of-dots baseline with a fixed 1mm bottom pad
    bottom_text_pad_mm = 1.0
    subtitle_area_mm = params.block_h - (params.raster_margin + bottom_text_pad_mm) - title_mm
    subtitle_area_px = mm_to_px_img(max(1.0, subtitle_area_mm), dpi)

    lo_mm = 1.6
    hi_mm = min(title_mm * 0.92, subtitle_area_mm * 0.95)

    def ok(test_mm: float) -> bool:
        size_px = max(1, mm_to_px_img(test_mm, dpi))
        font = load_font(font_regular, size_px)
        extra = int(round((params.line_height - 1.0) * size_px))
        for it in items:
            if not it.subtitle:
                continue
            # Allow up to 3 lines if it helps fit text
            lines = wrap_to_lines(it.subtitle, font, text_w_px, max_lines=3)
            if lines is None:
                return False
            # Use real text bbox heights per line for accurate fit
            total_h = 0
            for i, line in enumerate(lines):
                _, lh = text_wh(line, font)
                total_h += lh
                if i < len(lines) - 1:
                    total_h += extra
            if total_h > subtitle_area_px:
                return False
        return True

    best = lo_mm
    if ok(hi_mm):
        best = hi_mm
    else:
        for _ in range(24):
            mid = (lo_mm + hi_mm) / 2.0
            if ok(mid):
                best = mid
                lo_mm = mid
            else:
                hi_mm = mid
    return round(best, 3)

# -----------------------------
# Tile rendering
# -----------------------------
def render_block_tile_png(it: BlockItem,
                          params: LayoutParams,
                          font_regular: Optional[Path],
                          font_bold: Optional[Path],
                          subtitle_font_mm: float,
                          dpi: int,
                          bg_rgb: Optional[Tuple[int, int, int]] = None) -> Image.Image:
    W = mm_to_px_img(params.block_w, dpi)
    H = mm_to_px_img(params.block_h, dpi)
    if params.color_mode and bg_rgb is not None:
        img = Image.new("RGBA", (W, H), (bg_rgb[0], bg_rgb[1], bg_rgb[2], 255))
    else:
        img = Image.new("RGBA", (W, H), (255, 255, 255, 0))
    drw = ImageDraw.Draw(img)

    # Layout widths
    raster_px = mm_to_px_img(params.raster_margin, dpi)
    pad_px = mm_to_px_img(1.0, dpi)  # fixed 1mm bottom pad tied to dots region
    icon_alloc_w_px = mm_to_px_img(params.block_w * params.max_icon_ratio, dpi)
    text_icon_gap_px = mm_to_px_img(params.text_icon_gap_mm, dpi)
    text_x = raster_px
    text_w_px = W - 2 * raster_px - text_icon_gap_px - icon_alloc_w_px

    # Title font (auto-shrink-to-width; then auto-shrink-to-height if needed)
    title_mm = params.title_size_mm if params.title_size_mm else (params.block_h * 0.36)
    title_px_nom = max(1, mm_to_px_img(title_mm, dpi))
    f_bold = load_font(font_bold or font_regular, title_px_nom)

    # Subtitle metrics (for fitting calculations)
    sub_px = max(1, mm_to_px_img(subtitle_font_mm, dpi))
    f_reg = load_font(font_regular, sub_px)
    lines = wrap_to_lines(it.subtitle, f_reg, text_w_px, max_lines=3) or [it.subtitle]
    # Use real bbox heights (draw context) to compute exact subtitle stack height
    extra_leading_px = int(round((params.line_height - 1.0) * sub_px))
    subtitle_h_px = 0
    for i, line in enumerate(lines):
        lb = drw.textbbox((0, 0), line, font=f_reg)
        lh = lb[3] - lb[1]
        subtitle_h_px += lh
        if i < len(lines) - 1:
            subtitle_h_px += extra_leading_px

    # Helper: measure title via draw context
    def measure_title(font_obj: ImageFont.FreeTypeFont) -> Tuple[int, int]:
        tb = drw.textbbox((0, 0), it.title, font=font_obj)
        return (tb[2] - tb[0], tb[3] - tb[1])

    # First, enforce title width fit using draw-context measurement
    tW, tH = measure_title(f_bold)
    if tW > text_w_px and tW > 0:
        scale = text_w_px / tW
        title_px_nom = max(1, int(title_px_nom * scale))
        f_bold = load_font(font_bold or font_regular, title_px_nom)
        tW, tH = measure_title(f_bold)

    # Then, if combined title + gap + subtitle would overflow, shrink title until it fits
    # Permit text down to the bottom-of-dots baseline (1mm pad), not the full bottom raster margin
    content_h_px = H - raster_px - pad_px
    gap_px = mm_to_px_img(params.title_sub_gap_mm, dpi)
    # Fudge by 2px to avoid edge-case clipping from rounding
    safety_px = 2
    required_px = tH + gap_px + subtitle_h_px + safety_px
    # Limit iterations to avoid infinite loops on pathological inputs
    for _ in range(12):
        if required_px <= content_h_px:
            break
        # Compute a conservative scale factor based on height budget
        if tH > 0:
            scale_h = max(0.6, min(0.98, (content_h_px - (gap_px + subtitle_h_px)) / max(1, tH)))
        else:
            scale_h = 0.9
        new_px = max(1, int(title_px_nom * scale_h))
        if new_px >= title_px_nom and title_px_nom > 1:
            new_px = title_px_nom - 1
        if new_px <= 0 or new_px == title_px_nom:
            break
        title_px_nom = new_px
        f_bold = load_font(font_bold or font_regular, title_px_nom)
        # After shrinking height, ensure width still fits (measure via draw)
        tW, tH = measure_title(f_bold)
        if tW > text_w_px and tW > 0:
            scale_w = text_w_px / tW
            title_px_nom = max(1, int(title_px_nom * scale_w))
            f_bold = load_font(font_bold or font_regular, title_px_nom)
            tW, tH = measure_title(f_bold)
        required_px = tH + gap_px + subtitle_h_px + safety_px

    # Final post-fit guard: if a predictive layout still overshoots due to rounding,
    # shrink the title a touch more based on measured bbox values.
    for _ in range(6):
        # Predict bottom after drawing title + lines
        title_top = raster_px
        tb = drw.textbbox((text_x, title_top), it.title, font=f_bold)
        y_probe = tb[3] + gap_px
        for i, line in enumerate(lines):
            lb = drw.textbbox((text_x, y_probe), line, font=f_reg)
            y_probe = lb[3] + (extra_leading_px if i < len(lines) - 1 else 0)
        # Compare against bottom-of-dots baseline (1mm pad)
        overshoot = y_probe - (H - pad_px)
        if overshoot <= 0:
            break
        # Compute a conservative scale factor to eliminate overshoot
        if tH > 0:
            tH_max = max(1, tH - overshoot - safety_px)
            scale_h = max(0.6, min(0.98, tH_max / tH))
        else:
            scale_h = 0.9
        new_px = max(1, int(title_px_nom * scale_h))
        if new_px >= title_px_nom and title_px_nom > 1:
            new_px = title_px_nom - 1
        if new_px <= 0 or new_px == title_px_nom:
            break
        title_px_nom = new_px
        f_bold = load_font(font_bold or font_regular, title_px_nom)
        tW, tH = measure_title(f_bold)
        if tW > text_w_px and tW > 0:
            scale_w = text_w_px / tW
            title_px_nom = max(1, int(title_px_nom * scale_w))
            f_bold = load_font(font_bold or font_regular, title_px_nom)
            tW, tH = measure_title(f_bold)

    # Draw title at final size and compute baseline for subtitle
    title_top = raster_px
    title_fill = (0, 0, 0, 255)
    sub_fill = (0, 0, 0, 255)
    if params.color_mode:
        if params.title_rgb:
            title_fill = (params.title_rgb[0], params.title_rgb[1], params.title_rgb[2], 255)
        if params.subtitle_rgb:
            sub_fill = (params.subtitle_rgb[0], params.subtitle_rgb[1], params.subtitle_rgb[2], 255)
    drw.text((text_x, title_top), it.title, font=f_bold, fill=title_fill)
    tb = drw.textbbox((text_x, title_top), it.title, font=f_bold)
    y = tb[3] + gap_px  # bottom of title + gap

    # Subtitle (draw previously wrapped lines)
    for line in lines:
        drw.text((text_x, y), line, font=f_reg, fill=sub_fill)
        lb = drw.textbbox((text_x, y), line, font=f_reg)
        # next line starts at previous line bottom plus line-height padding
        y = lb[3] + extra_leading_px

    # Dots geometry (reserve vertical space only if enabled and there are dots)
    dots_active = params.dots_enabled and it.dot_count > 0
    dot_d = max(1, mm_to_px_img(params.dot_diam_mm, dpi)) if dots_active else 0
    dot_gap_horiz = max(1, mm_to_px_img(params.dot_gap_mm, dpi)) if dots_active else 0
    # pad_px already computed above for the bottom baseline
    vgap_px = max(0, mm_to_px_img(params.dot_vgap_mm, dpi)) if dots_active else 0

    total_w = (it.dot_count * dot_d + max(0, it.dot_count - 1) * dot_gap_horiz) if dots_active else 0

    # Reserve space at the bottom of the icon column only if dots are active
    reserved_dots_h = (vgap_px + dot_d + pad_px) if dots_active else pad_px

    # Icon (right) — scale and clean alpha, within reduced height
    icon_h_px = max(1, H - 2 * raster_px - reserved_dots_h)
    icon_w_max_px = icon_alloc_w_px
    # Track icon bounds (left x) if needed later
    icon_left_x: Optional[int] = None
    if it.image_path and it.image_path.exists():
        try:
            ic = Image.open(it.image_path)
            if not params.color_mode:
                ic = icon_to_black_clean(ic, white_threshold=params.icon_white_threshold)
            else:
                ic = ic.convert("RGBA")
            w0, h0 = ic.size
            if h0 > 0:
                width_if_by_h = int(round(w0 * icon_h_px / h0))
            else:
                width_if_by_h = icon_w_max_px
            if width_if_by_h <= icon_w_max_px:
                draw_w, draw_h = width_if_by_h, icon_h_px
            else:
                draw_w = icon_w_max_px
                draw_h = int(round(h0 * icon_w_max_px / w0)) if w0 else icon_h_px
            ic = ic.resize((max(1, draw_w), max(1, draw_h)), Image.LANCZOS)
            ix = W - raster_px - draw_w
            # Center within the available icon area (which excludes reserved dots space)
            iy = raster_px + (icon_h_px - draw_h) // 2
            img.alpha_composite(ic, (ix, iy))
            icon_left_x = ix
        except Exception:
            pass

    # Dots: place UNDER the icon if active, centered horizontally within the icon column
    if dots_active:
        icon_col_left = W - raster_px - icon_alloc_w_px
        # Center within icon column if they fit, otherwise align to left of the column
        if total_w <= icon_alloc_w_px:
            start_x = icon_col_left + (icon_alloc_w_px - total_w) // 2
        else:
            start_x = icon_col_left
        cx = start_x + dot_d // 2
        # Bottom-aligned inside reserved area (above bottom padding)
        cy = H - pad_px - dot_d // 2
        dot_fill = (0, 0, 0, 255)
        if params.color_mode and params.dot_rgb:
            dot_fill = (params.dot_rgb[0], params.dot_rgb[1], params.dot_rgb[2], 255)
        for _ in range(it.dot_count):
            drw.ellipse((cx - dot_d//2, cy - dot_d//2, cx + dot_d//2, cy + dot_d//2), fill=dot_fill)
            cx += dot_d + dot_gap_horiz

    return img

# -----------------------------
# SVG writing (pages + template)
# -----------------------------
def svg_header_mm(w_mm: float, h_mm: float) -> str:
    return f'<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="{w_mm}mm" height="{h_mm}mm" viewBox="0 0 {w_mm} {h_mm}">\n'

def svg_footer() -> str:
    return "</svg>\n"

def write_text(path: Path, text: str):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")

def generate_template_svg(params: LayoutParams, cols: int, rows: int, start_x: float, start_y: float) -> str:
    hole_w = params.block_w + 2 * params.template_tol
    hole_h = params.block_h + 2 * params.template_tol
    step_x = params.block_w + params.spacing
    step_y = params.block_h + params.spacing

    s = [svg_header_mm(params.bed_w, params.bed_h)]
    s.append(f'<rect x="0" y="0" width="{params.bed_w}" height="{params.bed_h}" fill="none" stroke="#000" stroke-width="0.2"/>')
    for r in range(rows):
        for c in range(cols):
            x = start_x + c * step_x - params.template_tol
            y = start_y + r * step_y - params.template_tol
            s.append(f'<rect x="{x:.3f}" y="{y:.3f}" width="{hole_w:.3f}" height="{hole_h:.3f}" fill="none" stroke="#000" stroke-width="0.2"/>')
    s.append(svg_footer())
    return "".join(s)

def generate_template_png(params: LayoutParams, cols: int, rows: int, start_x: float, start_y: float, dpi: int) -> Image.Image:
    W = mm_to_px_img(params.bed_w, dpi)
    H = mm_to_px_img(params.bed_h, dpi)
    img = Image.new("RGB", (W, H), "white")
    drw = ImageDraw.Draw(img)
    step_x = mm_to_px_img(params.block_w + params.spacing, dpi)
    step_y = mm_to_px_img(params.block_h + params.spacing, dpi)
    x0 = mm_to_px_img(start_x - params.template_tol, dpi)
    y0 = mm_to_px_img(start_y - params.template_tol, dpi)
    hole_w = mm_to_px_img(params.block_w + 2 * params.template_tol, dpi)
    hole_h = mm_to_px_img(params.block_h + 2 * params.template_tol, dpi)
    for r in range(rows):
        for c in range(cols):
            x = x0 + c * step_x
            y = y0 + r * step_y
            drw.rectangle((x, y, x + hole_w, y + hole_h), outline="black", width=1)
    return img

def compose_page_svg_from_tiles(items_slice: List[BlockItem], tiles_slice: List[Image.Image],
                                params: LayoutParams, cols: int, rows: int, start_x: float, start_y: float,
                                dpi_encode: int) -> str:
    """Embed each tile as a base64 PNG at the correct mm coordinates in a single SVG (no outlines)."""
    step_x = params.block_w + params.spacing
    step_y = params.block_h + params.spacing
    s = [svg_header_mm(params.bed_w, params.bed_h)]

    for idx, _ in enumerate(items_slice):
        r = idx // cols
        c = idx % cols
        x = start_x + c * step_x
        y = start_y + r * step_y

        buf = io.BytesIO()
        tiles_slice[idx].save(buf, format="PNG")
        b64 = base64.b64encode(buf.getvalue()).decode("ascii")
        href = f"data:image/png;base64,{b64}"
        s.append(f'<image href="{href}" x="{x:.3f}" y="{y:.3f}" width="{params.block_w:.3f}" height="{params.block_h:.3f}" preserveAspectRatio="none"/>')
    s.append(svg_footer())
    return "".join(s)

def compose_page_png_preview(items_slice: List[BlockItem], tiles_slice: List[Image.Image],
                             params: LayoutParams, cols: int, rows: int, start_x: float, start_y: float,
                             dpi: int) -> Image.Image:
    """Quick raster preview — no borders or page rectangle."""
    W = mm_to_px_img(params.bed_w, dpi)
    H = mm_to_px_img(params.bed_h, dpi)
    img = Image.new("RGB", (W, H), "white")

    step_x_px = mm_to_px_img(params.block_w + params.spacing, dpi)
    step_y_px = mm_to_px_img(params.block_h + params.spacing, dpi)
    start_x_px = mm_to_px_img(start_x, dpi)
    start_y_px = mm_to_px_img(start_y, dpi)

    for idx, tile in enumerate(tiles_slice):
        r = idx // cols
        c = idx % cols
        x = start_x_px + c * step_x_px
        y = start_y_px + r * step_y_px
        img.paste(tile.convert("RGBA"), (x, y), tile)

    return img

# -----------------------------
# Commands
# -----------------------------
def cmd_check_images(root: Path, json_name: str, dot_map: Dict[str, int]) -> int:
    items = parse_blocks_json(root, json_name, dot_map)
    missing: Dict[str, List[str]] = {}
    for it in items:
        if it.image_path is None or not it.image_path.exists():
            missing.setdefault(it.category, []).append((it.title, getattr(it, 'expected_image_name', sanitize_first_word_for_filename(it.title))))
    if not missing:
        print("All blocks have matching images. ✅")
        return 0
    print("Missing images by category:")
    for cat in sorted(missing.keys()):
        print(f"  - {cat.capitalize()}:")
        for title, expected in missing[cat]:
            print(f"      • {title}  (expected: {expected}.png)")
    return 1

def cmd_build(root: Path,
              outdir: Path,
              json_name: str,
              font_regular: Optional[Path],
              font_bold: Optional[Path],
              params: LayoutParams,
              dot_map: Dict[str, int]) -> None:

    items = parse_blocks_json(root, json_name, dot_map)

    cols, rows, start_x, start_y = best_grid(params.bed_w, params.bed_h,
                                             params.block_w, params.block_h,
                                             params.spacing, params.page_margin)
    per_page = cols * rows
    total = len(items)
    pages = max(1, math.ceil(total / per_page))

    subtitle_mm = compute_subtitle_font_mm(items, params, font_regular, params.preview_dpi)
    print(f"Grid: {cols}×{rows} = {per_page} per sheet | Blocks: {total} | Pages: {pages}")
    print(f"Subtitle font size: {subtitle_mm:.2f} mm")

    outdir.mkdir(parents=True, exist_ok=True)

    # 1) Template (cut)
    tpl_svg = generate_template_svg(params, cols, rows, start_x, start_y)
    write_text(outdir / "template.svg", tpl_svg)
    tpl_png = generate_template_png(params, cols, rows, start_x, start_y, params.preview_dpi)
    tpl_png.save(outdir / "template.png")

    # 2) Tiles
    tiles_dir = outdir / "tiles"
    tiles_dir.mkdir(exist_ok=True)
    all_tiles: List[Image.Image] = []
    def interp(a: Tuple[int,int,int], b: Tuple[int,int,int], t: float) -> Tuple[int,int,int]:
        return (int(round(a[0] + (b[0]-a[0])*t)), int(round(a[1] + (b[1]-a[1])*t)), int(round(a[2] + (b[2]-a[2])*t)))

    for i, it in enumerate(items, start=1):
        bg_rgb = None
        if params.color_mode:
            if params.background_style == "solid" and params.background_rgb:
                bg_rgb = params.background_rgb
            elif params.background_style == "per-category" and params.background_per_category:
                bg_rgb = params.background_per_category.get(it.category, params.background_rgb)
            elif params.background_style == "gradient" and params.background_grad_0 and params.background_grad_1:
                t = 0.0 if total <= 1 else (i-1) / (total-1)
                bg_rgb = interp(params.background_grad_0, params.background_grad_1, t)

        tile = render_block_tile_png(it, params, font_regular, font_bold, subtitle_mm, params.preview_dpi, bg_rgb)
        all_tiles.append(tile)
        tile.save(tiles_dir / f"tile_{i:03d}.png")

    # 3) Pages (raster; NO outlines)
    for p in range(pages):
        i0, i1 = p * per_page, (p + 1) * per_page
        sl_items = items[i0:i1]
        sl_tiles = all_tiles[i0:i1]

        svg_text = compose_page_svg_from_tiles(sl_items, sl_tiles, params, cols, rows, start_x, start_y, params.preview_dpi)
        write_text(outdir / f"raster_page_{p+1:02d}.svg", svg_text)

        prev_img = compose_page_png_preview(sl_items, sl_tiles, params, cols, rows, start_x, start_y, params.preview_dpi)
        prev_img.save(outdir / f"raster_page_{p+1:02d}.png")

    print(f"Done. Files written to {outdir.resolve()}")

# -----------------------------
# CLI
# -----------------------------
def main():
    parser = argparse.ArgumentParser(description="Generate raster sheets and a cardboard alignment template for Jenga block laser engraving (clean icons, no overlaps).")
    sub = parser.add_subparsers(dest="cmd", required=True)

    def add_common(p):
        p.add_argument("--root", type=Path, default=Path("."), help="Project root (contains blocks.json & category folders).")
        p.add_argument("--json", type=str, default="blocks.json", help="JSON file name at root.")
        p.add_argument("--dots", type=str, default=None, help="Override dots, e.g. 'drinking=1,truth=2,dare=3,spicy=4'.")

    p_check = sub.add_parser("check-images", help="List blocks without matching images.")
    add_common(p_check)

    p_build = sub.add_parser("build", help="Build template & paginated raster files.")
    add_common(p_build)
    p_build.add_argument("--out", type=Path, default=Path("./output"), help="Output directory.")

    # Bed & block geometry
    p_build.add_argument("--bed-w", type=float, default=381.0, help="Laser bed width (mm).")
    p_build.add_argument("--bed-h", type=float, default=305.0, help="Laser bed height (mm).")
    p_build.add_argument("--block-w", type=float, default=75.0, help="Block face width (mm).")
    p_build.add_argument("--block-h", type=float, default=25.0, help="Block face height (mm).")
    p_build.add_argument("--spacing", type=float, default=2.0, help="Space between blocks (mm).")
    p_build.add_argument("--page-margin", type=float, default=6.0, help="Outer margin (mm).")

    # Content layout
    p_build.add_argument("--raster-margin", type=float, default=1.0, help="Inner margin inside block (mm).")
    p_build.add_argument("--template-tol", type=float, default=0.5, help="Template cutout tolerance per side (mm).")
    p_build.add_argument("--title-mm", type=float, default=None, help="Title font size (mm). Default ~36% of block height.")
    p_build.add_argument("--title-sub-gap-mm", type=float, default=0.6, help="Vertical gap between title and subtitle (mm).")
    p_build.add_argument("--dot-mm", type=float, default=1.5, help="Dot diameter (mm).")
    p_build.add_argument("--dot-gap-mm", type=float, default=0.9, help="Horizontal gap between dots (mm).")
    p_build.add_argument("--dot-vgap-mm", type=float, default=0.6, help="Legacy: dots are bottom-right; kept for compatibility.")
    p_build.add_argument("--icon-ratio", type=float, default=0.20, help="Max icon width fraction of block width (≤0.20).")
    p_build.add_argument("--text-icon-gap-mm", type=float, default=1.6, help="Gap between text and icon (mm).")
    p_build.add_argument("--line-height", type=float, default=1.08, help="Subtitle line-height multiplier.")
    p_build.add_argument("--icon-white-threshold", type=int, default=200, help="0..255: pixels with lightness >= threshold become transparent (for opaque icons).")

    # Rendering
    p_build.add_argument("--preview-dpi", type=int, default=300, help="Rendering DPI (also controls PNG previews).")

    # Fonts
    p_build.add_argument("--font", type=Path, default=None, help="Path to regular TTF/OTF (used for subtitles).")
    p_build.add_argument("--font-bold", type=Path, default=None, help="Path to bold TTF/OTF (used for titles).")

    args = parser.parse_args()
    dot_map = parse_dot_map(args.dots)

    # If the user only asked to check images, do it now before touching build-only args
    if args.cmd == "check-images":
        root: Path = args.root
        sys.exit(cmd_check_images(root, args.json, dot_map))

    # Auto-pick fonts from project root if not provided (build path)
    root: Path = args.root
    auto_title = autofind_font(root, ["title.ttf", "Title.ttf"])
    auto_sub = autofind_font(root, ["subtitle.ttf", "Subtitle.ttf"])

    font_regular = args.font if getattr(args, 'font', None) else auto_sub
    font_bold = args.font_bold if getattr(args, 'font_bold', None) else auto_title

    params = LayoutParams(
        bed_w=args.bed_w,
        bed_h=args.bed_h,
        block_w=args.block_w,
        block_h=args.block_h,
        spacing=args.spacing,
        page_margin=args.page_margin,
        raster_margin=args.raster_margin,
        template_tol=args.template_tol,
        title_size_mm=args.title_mm if args.title_mm else None,
        title_sub_gap_mm=args.title_sub_gap_mm,
        dot_diam_mm=args.dot_mm,
        dot_gap_mm=args.dot_gap_mm,
        dot_vgap_mm=args.dot_vgap_mm,
        max_icon_ratio=max(0.05, min(0.20, args.icon_ratio)),
        text_icon_gap_mm=args.text_icon_gap_mm,
        line_height=args.line_height,
        preview_dpi=args.preview_dpi,
        icon_white_threshold=max(0, min(255, args.icon_white_threshold)),
    )

    cmd_build(
        root=root,
        outdir=args.out,
        json_name=args.json,
        font_regular=font_regular,
        font_bold=font_bold,
        params=params,
        dot_map=dot_map,
    )

if __name__ == "__main__":
    main()
