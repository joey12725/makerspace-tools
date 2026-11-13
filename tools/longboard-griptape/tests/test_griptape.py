from pathlib import Path

import griptape as gt
import numpy as np
from PIL import Image

SAMPLES = Path(__file__).resolve().parents[1] / "samples"


def deck_with_cutout(size=(100, 60), box=(20, 10, 80, 50)) -> Image.Image:
    arr = np.full((size[1], size[0], 3), 255, dtype=np.uint8)
    x0, y0, x1, y1 = box
    arr[y0:y1, x0:x1] = 0
    return Image.fromarray(arr, "RGB")


def test_hex_to_rgb():
    assert gt.hex_to_rgb("#ff8000") == (255, 128, 0)


def test_mask_bounds_and_center():
    mask = gt.mask_from_color(deck_with_cutout(), (0, 0, 0), 10)
    assert gt.mask_bounds(mask) == (10, 49, 20, 79)
    assert gt.mask_center_of_mass(mask) == (29, 49)
    empty = np.zeros((5, 5), dtype=bool)
    assert gt.mask_bounds(empty) is None
    assert gt.mask_center_of_mass(empty) is None


def test_extend_and_crop():
    img = Image.new("RGBA", (10, 8), (10, 20, 30, 255))
    grown = gt.extend_edge(img, "left", 5, "white")
    assert grown.size == (15, 8)
    assert grown.getpixel((0, 0)) == (255, 255, 255, 255)
    avg = gt.extend_edge(img, "bottom", 3, "average")
    assert avg.size == (10, 11)
    assert avg.getpixel((0, 10)) == (10, 20, 30, 255)
    assert gt.crop_edges(img, 2, 1, 3, 1).size == (5, 6)
    assert gt.crop_edges(img, 50, 50, 50, 50).size == (1, 1)


def test_apply_grip_only_paints_inside_mask():
    deck = deck_with_cutout()
    mask = gt.mask_from_color(deck, (0, 0, 0), 10)
    grip = Image.new("RGBA", (200, 200), (255, 0, 0, 255))
    out = np.asarray(gt.apply_grip(deck, grip, mask, -50, -50))
    assert (out[mask][:, :3] == [255, 0, 0]).all()
    assert (out[~mask][:, :3] == [255, 255, 255]).all()


def test_apply_grip_handles_offsets_off_canvas():
    deck = deck_with_cutout()
    mask = gt.mask_from_color(deck, (0, 0, 0), 10)
    grip = Image.new("RGBA", (10, 10), (255, 0, 0, 255))
    out = gt.apply_grip(deck, grip, mask, 500, 500)
    assert np.array_equal(np.asarray(out), np.asarray(deck.convert("RGBA")))


def test_grit_is_seeded_and_keeps_alpha():
    img = Image.new("RGBA", (20, 20), (128, 128, 128, 77))
    a = gt.add_grit(img, 10, seed=1)
    b = gt.add_grit(img, 10, seed=1)
    assert np.array_equal(np.asarray(a), np.asarray(b))
    assert set(np.asarray(a)[:, :, 3].ravel()) == {77}


def test_snap_offsets():
    mask = gt.mask_from_color(deck_with_cutout(), (0, 0, 0), 10)
    snaps = gt.snap_offsets(mask, (20, 10))
    assert snaps["top"] == (20, 10)
    assert snaps["bottom"] == (20, 40)
    assert snaps["center"] == (39, 24)


def test_render_samples(tmp_path):
    out = tmp_path / "preview.png"
    assert gt.main([str(SAMPLES / "deck.png"), str(SAMPLES / "sunset-pattern.png"), "-o", str(out), "--seed", "1"]) == 0
    with Image.open(out) as img, Image.open(SAMPLES / "deck.png") as deck:
        assert img.size == deck.size
        # The cutout is no longer plain black.
        mask = gt.mask_from_color(deck, (0, 0, 0), 50)
        assert np.asarray(img.convert("RGB"))[mask].mean() > 40
