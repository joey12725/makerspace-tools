from pathlib import Path

import lithophane_tiler as lt
import numpy as np
import pytest
from PIL import Image, ImageDraw

SAMPLES = Path(__file__).resolve().parents[1] / "samples"


def drawing(size=(200, 160), box=(50, 40, 120, 100)) -> Image.Image:
    img = Image.new("L", size, 255)
    ImageDraw.Draw(img).rectangle(box, fill=0)
    return img


def test_grid_prefers_wide_layouts():
    assert lt.grid_for(1) == (1, 1)
    assert lt.grid_for(9) == (3, 3)
    assert lt.grid_for(10) == (3, 4)
    assert lt.grid_for(15) == (3, 5)
    assert lt.grid_for(7, cols=2) == (4, 2)
    with pytest.raises(ValueError):
        lt.grid_for(0)


def test_ink_bounds_trims_to_the_drawing():
    assert lt.ink_bounds(drawing()) == (50, 40, 120, 100)


def test_ink_bounds_ignores_stray_specks():
    img = drawing()
    img.putpixel((2, 2), 0)
    img.putpixel((198, 150), 0)
    assert lt.ink_bounds(img) == (50, 40, 120, 100)


def test_ink_bounds_keeps_blank_images_whole():
    assert lt.ink_bounds(Image.new("L", (30, 20), 255)) == (0, 0, 30, 20)


def test_binarize_is_pure_black_and_white():
    img = Image.linear_gradient("L")
    assert set(np.unique(np.asarray(lt.binarize(img)))) == {0, 255}


def test_build_sheet_packs_and_centers_last_row():
    images = [drawing() for _ in range(5)]
    sheet, layout = lt.build_sheet(images, cols=3, padding=5)
    assert sheet.mode == "1"
    assert (layout.rows, layout.cols) == (2, 3)
    assert sheet.size == layout.size == (3 * layout.cell_w, 2 * layout.cell_h)
    # Two tiles in the last row are centered, so its left-most cell is blank.
    last_row = sheet.convert("L").crop((0, layout.cell_h, layout.cell_w // 2, 2 * layout.cell_h))
    assert last_row.getextrema() == (255, 255)


def test_cli_end_to_end(tmp_path):
    out = tmp_path / "sheet.png"
    assert lt.main([str(SAMPLES), "-o", str(out)]) == 0
    assert lt.verify(out) == []
    assert lt.main(["--verify", str(out)]) == 0


def test_verify_flags_grayscale_output(tmp_path):
    path = tmp_path / "gray.png"
    Image.linear_gradient("L").save(path)
    problems = lt.verify(path)
    assert any("1-bit" in p for p in problems)
