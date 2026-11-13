import importlib.util
import io
import json
import zipfile
from pathlib import Path

import make_jenga_layout as mj
import pytest

TOOL = Path(__file__).resolve().parents[1]
EXAMPLES = TOOL / "examples"


def params(**overrides) -> mj.LayoutParams:
    base = dict(
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
        preview_dpi=60,
        icon_white_threshold=200,
    )
    base.update(overrides)
    return mj.LayoutParams(**base)


def test_best_grid_fits_the_bed():
    cols, rows, x, y = mj.best_grid(381, 305, 75, 25, 2, 6)
    assert (cols, rows) == (4, 10)
    assert x >= 6 and y >= 6
    with pytest.raises(ValueError):
        mj.best_grid(50, 50, 75, 25, 2, 6)


def test_parse_dot_map():
    assert mj.parse_dot_map("a=1, b = 3,bad,c=x") == {"a": 1, "b": 3}
    assert mj.parse_dot_map(None) == {}


def test_parse_blocks_assigns_titles_dots_and_icons():
    items = mj.parse_blocks_json(EXAMPLES, "blocks.json", {"story": 5})
    assert len(items) == 36
    first = items[0]
    assert (first.category, first.title, first.dot_count) == ("warm-up", "High Five", 1)
    assert first.subtitle.startswith("high five")
    assert first.image_path and first.image_path.name == "high.png"
    assert {it.dot_count for it in items if it.category == "challenge"} == {2}
    assert {it.dot_count for it in items if it.category == "story"} == {5}


def test_duplicate_first_words_get_numbered(tmp_path):
    (tmp_path / "blocks.json").write_text(json.dumps({"Fun": ["*Big One* a", "*Big Two* b"]}))
    names = [it.expected_image_name for it in mj.parse_blocks_json(tmp_path, "blocks.json", {})]
    assert names == ["big", "big2"]


def test_check_images_reports_missing(tmp_path, capsys):
    (tmp_path / "blocks.json").write_text(json.dumps({"Fun": ["*Wave* say hi"]}))
    assert mj.cmd_check_images(tmp_path, "blocks.json", {}) == 1
    assert "wave.png" in capsys.readouterr().out
    assert mj.cmd_check_images(EXAMPLES, "blocks.json", {}) == 0


def test_parse_hex_color():
    assert mj.parse_hex_color("#0f0") == (0, 255, 0)
    assert mj.parse_hex_color("123456") == (0x12, 0x34, 0x56)
    assert mj.parse_hex_color("nope") is None


def test_build_writes_template_pages_and_tiles(tmp_path):
    mj.cmd_build(EXAMPLES, tmp_path, "blocks.json", mj.BUNDLED_SUBTITLE_FONT, mj.BUNDLED_TITLE_FONT, params(), {})
    assert (tmp_path / "template.svg").read_text().count("<rect") == 1 + 40
    assert (tmp_path / "raster_page_01.png").exists()
    assert (tmp_path / "raster_page_01.svg").read_text().count("<image") == 36
    assert len(list((tmp_path / "tiles").glob("tile_*.png"))) == 36


def load_api():
    spec = importlib.util.spec_from_file_location("jenga_api", TOOL / "api" / "generate.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.app


def test_api_returns_a_zip():
    client = load_api().test_client()
    config = {
        "blocks": {"Warm-up": ["*Wave* say hi to everyone", "*Stretch* reach for the ceiling"]},
        "params": {"preview_dpi": 60},
        "color": {"mode": "color", "title": "#222", "background": {"style": "gradient", "gradient": ["#fff", "#eee"]}},
    }
    res = client.post("/", data={"config": json.dumps(config)}, content_type="multipart/form-data")
    assert res.status_code == 200, res.get_json()
    names = zipfile.ZipFile(io.BytesIO(res.data)).namelist()
    assert "template.svg" in names and "raster_page_01.png" in names


def test_api_rejects_missing_config():
    res = load_api().test_client().post("/", data={}, content_type="multipart/form-data")
    assert res.status_code == 400
