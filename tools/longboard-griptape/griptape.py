"""Image operations behind the longboard grip tape visualizer.

Everything here is plain Pillow + NumPy so the Streamlit UI (``app.py``), the
command line and the tests all share one implementation.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

import numpy as np
from PIL import Image

Edge = Literal["top", "bottom", "left", "right"]
FillMode = Literal["black", "white", "average"]


def hex_to_rgb(hex_color: str) -> tuple[int, int, int]:
    """Convert ``#rrggbb`` to an RGB tuple."""
    hex_color = hex_color.lstrip("#")
    return tuple(int(hex_color[i : i + 2], 16) for i in (0, 2, 4))  # type: ignore[return-value]


def mask_from_color(image: Image.Image, target_rgb: tuple[int, int, int], tolerance: float) -> np.ndarray:
    """Boolean mask of pixels within ``tolerance`` (Euclidean RGB distance) of ``target_rgb``."""
    pixels = np.asarray(image.convert("RGB"), dtype=float)
    diff = np.sqrt(np.sum((pixels - np.asarray(target_rgb, dtype=float)) ** 2, axis=2))
    return diff <= tolerance


def mask_bounds(mask: np.ndarray) -> tuple[int, int, int, int] | None:
    """Bounding box of the mask as ``(min_y, max_y, min_x, max_x)``, inclusive."""
    rows = np.any(mask, axis=1)
    cols = np.any(mask, axis=0)
    if not rows.any():
        return None
    min_y, max_y = np.flatnonzero(rows)[[0, -1]]
    min_x, max_x = np.flatnonzero(cols)[[0, -1]]
    return int(min_y), int(max_y), int(min_x), int(max_x)


def mask_center_of_mass(mask: np.ndarray) -> tuple[int, int] | None:
    """Mean ``(y, x)`` of the mask's pixels."""
    ys, xs = np.nonzero(mask)
    if len(ys) == 0:
        return None
    return int(ys.mean()), int(xs.mean())


def extend_edge(image: Image.Image, edge: Edge, pixels: int, mode: FillMode, avg_pixels: int = 1) -> Image.Image:
    """Grow the image by ``pixels`` on one edge, filled with black, white or the edge's average color."""
    if pixels <= 0:
        return image
    arr = np.asarray(image.convert("RGBA"))
    h, w = arr.shape[:2]

    if mode == "black":
        fill = np.array([0, 0, 0, 255], dtype=np.uint8)
    elif mode == "white":
        fill = np.array([255, 255, 255, 255], dtype=np.uint8)
    else:
        n = max(1, min(avg_pixels, h, w))
        strip = {
            "top": arr[:n],
            "bottom": arr[-n:],
            "left": arr[:, :n],
            "right": arr[:, -n:],
        }[edge]
        fill = strip.reshape(-1, 4).mean(axis=0).astype(np.uint8)

    if edge in ("top", "bottom"):
        block = np.tile(fill, (pixels, w, 1))
        out = np.vstack([block, arr] if edge == "top" else [arr, block])
    else:
        block = np.tile(fill, (h, pixels, 1))
        out = np.hstack([block, arr] if edge == "left" else [arr, block])
    return Image.fromarray(out, "RGBA")


def crop_edges(image: Image.Image, left: int, top: int, right: int, bottom: int) -> Image.Image:
    """Trim pixels from each edge, always leaving at least a 1x1 image."""
    w, h = image.size
    x0 = min(left, w - 1)
    y0 = min(top, h - 1)
    x1 = max(w - right, x0 + 1)
    y1 = max(h - bottom, y0 + 1)
    return image.crop((x0, y0, x1, y1))


def scale(image: Image.Image, factor: float) -> Image.Image:
    if factor == 1.0:
        return image
    w, h = image.size
    return image.resize((max(1, int(w * factor)), max(1, int(h * factor))), Image.Resampling.LANCZOS)


def add_grit(image: Image.Image, intensity: float, seed: int | None = None) -> Image.Image:
    """Per-pixel brightness noise that reads as grip tape grit. Alpha is left alone."""
    if intensity <= 0:
        return image
    arr = np.asarray(image.convert("RGBA")).astype(float)
    rng = np.random.default_rng(seed)
    noise = rng.normal(0, intensity, arr.shape[:2])[:, :, np.newaxis]
    arr[:, :, :3] = np.clip(arr[:, :, :3] + noise, 0, 255)
    return Image.fromarray(arr.astype(np.uint8), "RGBA")


def apply_grip(base: Image.Image, grip: Image.Image, mask: np.ndarray, offset_x: int, offset_y: int) -> Image.Image:
    """Paint ``grip`` onto ``base`` wherever ``mask`` is set, with grip's top-left at the offset."""
    out = np.asarray(base.convert("RGBA")).copy()
    grip_arr = np.asarray(grip.convert("RGBA"))
    bh, bw = out.shape[:2]
    gh, gw = grip_arr.shape[:2]

    # Overlap of the grip rectangle with the base image, in base coordinates.
    y0, y1 = max(0, offset_y), min(bh, offset_y + gh)
    x0, x1 = max(0, offset_x), min(bw, offset_x + gw)
    if y0 >= y1 or x0 >= x1:
        return Image.fromarray(out, "RGBA")

    region_mask = mask[y0:y1, x0:x1]
    grip_region = grip_arr[y0 - offset_y : y1 - offset_y, x0 - offset_x : x1 - offset_x]
    out[y0:y1, x0:x1][region_mask] = grip_region[region_mask]
    return Image.fromarray(out, "RGBA")


@dataclass
class GripSettings:
    """Every knob in the visualizer, applied in a fixed order: crop, extend, scale, rotate, grit."""

    crop: tuple[int, int, int, int] = (0, 0, 0, 0)  # left, top, right, bottom
    extend: tuple[int, int, int, int] = (0, 0, 0, 0)  # left, top, right, bottom
    extend_mode: FillMode = "black"
    extend_avg_pixels: int = 5
    scale: float = 1.0
    rotation: float = 0.0
    grit: float = 15.0
    seed: int | None = None


def process_grip(grip: Image.Image, s: GripSettings) -> Image.Image:
    """Run the grip pattern through the full transform pipeline."""
    out = grip.convert("RGBA")
    if any(s.crop):
        out = crop_edges(out, *s.crop)
    for edge, px in zip(("left", "top", "right", "bottom"), s.extend, strict=False):
        out = extend_edge(out, edge, px, s.extend_mode, s.extend_avg_pixels)  # type: ignore[arg-type]
    out = scale(out, s.scale)
    if s.rotation:
        out = out.rotate(s.rotation, expand=True, fillcolor=(0, 0, 0, 0))
    return add_grit(out, s.grit, s.seed)


def snap_offsets(mask: np.ndarray, grip_size: tuple[int, int]) -> dict[str, tuple[int, int]]:
    """Candidate ``(offset_x, offset_y)`` positions for the snap buttons."""
    bounds = mask_bounds(mask)
    if bounds is None:
        return {}
    min_y, max_y, min_x, max_x = bounds
    gw, gh = grip_size
    snaps = {
        "top": (min_x, min_y),
        "bottom": (min_x, max_y - gh + 1),
        "center": ((min_x + max_x) // 2 - gw // 2, (min_y + max_y) // 2 - gh // 2),
    }
    com = mask_center_of_mass(mask)
    if com:
        snaps["mass"] = (com[1] - gw // 2, com[0] - gh // 2)
    return snaps


def render(
    deck: Image.Image,
    pattern: Image.Image,
    cutout_rgb: tuple[int, int, int] = (0, 0, 0),
    tolerance: float = 50,
    fit: Literal["width", "height", "none"] = "width",
    snap: str = "center",
    settings: GripSettings | None = None,
) -> Image.Image:
    """One-shot render: mask the cutout, fit the pattern to it, snap it in place and apply."""
    settings = settings or GripSettings()
    mask = mask_from_color(deck, cutout_rgb, tolerance)
    bounds = mask_bounds(mask)
    if bounds is None:
        raise ValueError("no pixels match the cutout color")
    min_y, max_y, min_x, max_x = bounds
    if fit == "width":
        settings.scale = (max_x - min_x + 1) / pattern.width
    elif fit == "height":
        settings.scale = (max_y - min_y + 1) / pattern.height
    grip = process_grip(pattern, settings)
    offset_x, offset_y = snap_offsets(mask, grip.size)[snap]
    return apply_grip(deck, grip, mask, offset_x, offset_y)


def main(argv: list[str] | None = None) -> int:
    import argparse

    parser = argparse.ArgumentParser(description="Render a grip tape pattern onto a deck image.")
    parser.add_argument("deck", help="deck image with the grip area in one solid color")
    parser.add_argument("pattern", help="grip tape pattern image")
    parser.add_argument("-o", "--output", default="griptape_preview.png")
    parser.add_argument("--cutout", default="#000000", help="cutout color (default: black)")
    parser.add_argument("--tolerance", type=float, default=50)
    parser.add_argument("--fit", choices=["width", "height", "none"], default="width")
    parser.add_argument("--snap", choices=["top", "bottom", "center", "mass"], default="center")
    parser.add_argument("--rotate", type=float, default=0.0)
    parser.add_argument("--grit", type=float, default=15.0)
    parser.add_argument("--seed", type=int, default=None)
    args = parser.parse_args(argv)

    settings = GripSettings(rotation=args.rotate, grit=args.grit, seed=args.seed)
    with Image.open(args.deck) as deck, Image.open(args.pattern) as pattern:
        out = render(deck, pattern, hex_to_rgb(args.cutout), args.tolerance, args.fit, args.snap, settings)
    out.save(args.output)
    print(f"Saved {args.output} ({out.width}x{out.height})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
