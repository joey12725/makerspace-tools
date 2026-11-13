#!/usr/bin/env python3
"""Tile a folder of line art into one crisp 1-bit sheet for lithophanes and laser engraving.

Every image is trimmed to its ink, scaled into a shared cell size, hard-thresholded
to pure black and white, and packed into a centered grid. The result is a single
1-bit PNG that drops straight into a lithophane generator or laser software.

    python lithophane_tiler.py samples/ -o sheet.png
    python lithophane_tiler.py samples/ -o sheet.png --cols 3 --padding 24 --threshold 110
    python lithophane_tiler.py --verify sheet.png
"""

from __future__ import annotations

import argparse
import math
import sys
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from PIL import Image

IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg"}

# Pixels at or below this gray level count as ink (roughly 65% black).
DEFAULT_THRESHOLD = 89

# How many ink pixels a trim edge must skip, so a few stray specks
# near the border do not stop the crop from tightening.
DEFAULT_SPECK_TOLERANCE = 3


@dataclass(frozen=True)
class SheetLayout:
    rows: int
    cols: int
    cell_w: int
    cell_h: int

    @property
    def size(self) -> tuple[int, int]:
        return self.cols * self.cell_w, self.rows * self.cell_h


def find_images(directory: Path, exclude: Path | None = None) -> list[Path]:
    """Return image files in ``directory`` in a stable, sorted order."""
    files = [p for p in directory.iterdir() if p.is_file() and p.suffix.lower() in IMAGE_EXTENSIONS]
    if exclude is not None:
        files = [p for p in files if p.resolve() != exclude.resolve()]
    return sorted(files)


def grid_for(count: int, cols: int | None = None) -> tuple[int, int]:
    """Pick a (rows, cols) grid that holds ``count`` tiles, slightly wider than tall."""
    if count < 1:
        raise ValueError("need at least one image")
    if cols:
        return math.ceil(count / cols), cols
    if count == 15:
        return 3, 5
    rows = max(1, int(math.sqrt(count)))
    return rows, math.ceil(count / rows)


def ink_bounds(
    gray: Image.Image,
    threshold: int = DEFAULT_THRESHOLD,
    speck_tolerance: int = DEFAULT_SPECK_TOLERANCE,
) -> tuple[int, int, int, int]:
    """Bounding box (left, top, right, bottom) of the ink in a grayscale image.

    Each edge sits on the ``speck_tolerance + 1``-th ink pixel counted from that
    side, so isolated specks are trimmed away. Images with too little ink keep
    their full frame.
    """
    ink = np.asarray(gray.convert("L")) <= threshold
    height, width = ink.shape
    need = speck_tolerance + 1
    if int(ink.sum()) < 2 * need:
        return (0, 0, width, height)

    def edges(counts: np.ndarray) -> tuple[int, int]:
        lo = int(np.searchsorted(np.cumsum(counts), need))
        hi = len(counts) - 1 - int(np.searchsorted(np.cumsum(counts[::-1]), need))
        return lo, hi

    left, right = edges(ink.sum(axis=0))
    top, bottom = edges(ink.sum(axis=1))
    if left >= right or top >= bottom:
        return (0, 0, width, height)
    return (left, top, right, bottom)


def fit_into_cell(img: Image.Image, cell_w: int, cell_h: int) -> Image.Image:
    """Scale ``img`` to fit inside the cell, centered on a white background."""
    ratio = min(cell_w / img.width, cell_h / img.height)
    new_size = (max(1, int(img.width * ratio)), max(1, int(img.height * ratio)))
    scaled = img.resize(new_size, Image.Resampling.LANCZOS)
    cell = Image.new("L", (cell_w, cell_h), 255)
    cell.paste(scaled, ((cell_w - new_size[0]) // 2, (cell_h - new_size[1]) // 2))
    return cell


def binarize(img: Image.Image, threshold: int = DEFAULT_THRESHOLD) -> Image.Image:
    """Hard threshold: ink becomes 0, everything else 255."""
    return img.point(lambda p: 0 if p <= threshold else 255)


def build_sheet(
    images: list[Image.Image],
    threshold: int = DEFAULT_THRESHOLD,
    cols: int | None = None,
    padding: int = 0,
) -> tuple[Image.Image, SheetLayout]:
    """Trim, normalize and tile ``images`` into one 1-bit sheet.

    ``padding`` adds that many white pixels around every tile.
    """
    trimmed = []
    for img in images:
        gray = img.convert("L")
        trimmed.append(gray.crop(ink_bounds(gray, threshold)))

    rows, cols = grid_for(len(trimmed), cols)
    layout = SheetLayout(
        rows=rows,
        cols=cols,
        cell_w=max(t.width for t in trimmed) + 2 * padding,
        cell_h=max(t.height for t in trimmed) + 2 * padding,
    )
    canvas = Image.new("L", layout.size, 255)

    last_row_count = len(trimmed) - (rows - 1) * cols
    for i, tile in enumerate(trimmed):
        row, col = divmod(i, cols)
        x_offset = 0
        if row == rows - 1 and last_row_count < cols:
            # Center a short final row.
            x_offset = (layout.size[0] - last_row_count * layout.cell_w) // 2
        inner = fit_into_cell(tile, layout.cell_w - 2 * padding, layout.cell_h - 2 * padding)
        cell = binarize(inner, threshold)
        canvas.paste(cell, (x_offset + col * layout.cell_w + padding, row * layout.cell_h + padding))

    return canvas.convert("1"), layout


def verify(path: Path) -> list[str]:
    """Return a list of problems with a generated sheet (empty means good)."""
    problems = []
    with Image.open(path) as img:
        if img.mode != "1":
            problems.append(f"expected 1-bit mode, got {img.mode}")
        colors = {c for _, c in img.convert("L").getcolors(maxcolors=256) or []}
        if not colors <= {0, 255}:
            problems.append(f"found gray levels {sorted(colors - {0, 255})[:5]}")
    return problems


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("input", type=Path, nargs="?", help="folder of PNG/JPEG artwork")
    parser.add_argument("-o", "--output", type=Path, default=Path("lithophane_sheet.png"))
    parser.add_argument(
        "--threshold", type=int, default=DEFAULT_THRESHOLD, help="gray level (0-255) at or below which a pixel is ink"
    )
    parser.add_argument("--cols", type=int, default=None, help="force a column count")
    parser.add_argument("--padding", type=int, default=0, help="white border around each tile, in pixels")
    parser.add_argument(
        "--verify", type=Path, metavar="SHEET", help="check that an existing sheet is pure 1-bit and exit"
    )
    args = parser.parse_args(argv)

    if args.verify:
        problems = verify(args.verify)
        with Image.open(args.verify) as img:
            print(f"{args.verify}: {img.width}x{img.height} {img.mode}")
        for p in problems:
            print(f"  ! {p}")
        return 1 if problems else 0

    if args.input is None or not args.input.is_dir():
        parser.error("input must be a folder of images")

    paths = find_images(args.input, exclude=args.output)
    if not paths:
        print(f"No images found in {args.input}", file=sys.stderr)
        return 1

    images = []
    for p in paths:
        with Image.open(p) as img:
            images.append(img.copy())

    sheet, layout = build_sheet(images, threshold=args.threshold, cols=args.cols, padding=args.padding)
    sheet.save(args.output)
    print(
        f"{len(images)} images -> {layout.rows}x{layout.cols} grid, "
        f"{layout.cell_w}x{layout.cell_h}px cells, sheet {sheet.width}x{sheet.height}px"
    )
    print(f"Saved {args.output}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
