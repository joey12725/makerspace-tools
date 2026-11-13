import io
import json
import re
import sys
import tempfile
import zipfile
from pathlib import Path

from flask import Flask, jsonify, request, send_file

# Ensure we can import the project script from repo root
ROOT = Path(__file__).resolve().parents[1]
sys.path.append(str(ROOT))

try:
    import make_jenga_layout as mj
except Exception:
    mj = None

app = Flask(__name__)


def _norm_cat(name: str) -> str:
    return re.sub(r"[\s_-]+", "", (name or "").strip().lower())


# "/" for the local dev server mount, "/api/generate" for Vercel, which passes the full path.
@app.post("/")
@app.post("/api/generate")
def generate():
    if mj is None:
        return jsonify({"error": "make_jenga_layout.py not importable"}), 500

    # Accept multipart with a required JSON field named 'config'
    conf_text = request.form.get("config")
    if not conf_text:
        return jsonify({"error": "Missing config"}), 400

    try:
        config = json.loads(conf_text)
    except Exception:
        return jsonify({"error": "Invalid config JSON"}), 400

    # Expected structure
    blocks_map = config.get("blocks") or {}
    params = config.get("params") or {}
    color_cfg = (config.get("color") or {}) if isinstance(config.get("color"), dict) else {}
    dots = config.get("dots") or {}

    # Build normalized category map based on blocks_map keys
    cat_keys = list(blocks_map.keys())
    norm_to_real = {_norm_cat(k): k for k in cat_keys}

    # Create temp project root
    with tempfile.TemporaryDirectory() as td:
        root = Path(td)

        # 1) Write blocks.json
        (root / "blocks.json").write_text(json.dumps(blocks_map, ensure_ascii=False, indent=2), encoding="utf-8")

        # 2) Save fonts if provided
        title_f = request.files.get("titleFont")
        if title_f:
            # Preserve extension if present
            ext = Path(title_f.filename or "").suffix or ".ttf"
            dest = root / f"title{ext}"
            title_f.save(str(dest))
        sub_f = request.files.get("subtitleFont")
        if sub_f:
            ext = Path(sub_f.filename or "").suffix or ".ttf"
            dest = root / f"subtitle{ext}"
            sub_f.save(str(dest))

        # 3) Pre-compute expected image names using the project logic
        try:
            # Convert dots mapping keys to lowercase for parser
            dot_map = {(k or "").strip().lower(): int(v) for k, v in (dots or {}).items()}
        except Exception:
            dot_map = mj.CATEGORY_DEFAULT_DOTS

        items = mj.parse_blocks_json(root, "blocks.json", dot_map)

        # Build expected-name queue per category (in order of blocks)
        expected_by_cat = {}
        for it in items:
            expected_by_cat.setdefault(it.category, []).append(it.expected_image_name)

        # 4) Save uploaded images into category folders with expected names
        # We accept fields named images_<categoryNormalized> where normalized removes spaces/underscores and lowers
        for key in request.files:
            if not key.startswith("images_"):
                continue
            cat_norm = key[len("images_") :]
            cat_real = norm_to_real.get(cat_norm)
            if not cat_real:
                continue

            files = request.files.getlist(key)
            if not files:
                continue
            exp_list = list(expected_by_cat.get(cat_real, []))
            if not exp_list:
                # If no expected list (e.g., empty category), still create folder and drop raw names
                dest_dir = root / cat_real
                dest_dir.mkdir(parents=True, exist_ok=True)
                for f in files:
                    # save as-is to png extension if possible
                    name = Path(f.filename or "image.png").stem
                    (dest_dir / f"{name}.png").write_bytes(f.read())
                continue

            dest_dir = root / cat_real
            dest_dir.mkdir(parents=True, exist_ok=True)

            # Map files in upload order to expected names
            for idx, f in enumerate(files):
                if idx >= len(exp_list):
                    break
                target = dest_dir / f"{exp_list[idx]}.png"
                # Convert to PNG via Pillow if not PNG
                try:
                    from PIL import Image

                    im = Image.open(f.stream)
                    im = im.convert("RGBA")
                    im.save(target, format="PNG")
                except Exception:
                    # Fallback: raw write
                    f.stream.seek(0)
                    target.write_bytes(f.read())

        # 5) Build outputs
        try:
            # Base params
            lp = mj.LayoutParams(
                bed_w=float(params.get("bed_w", 381.0)),
                bed_h=float(params.get("bed_h", 305.0)),
                block_w=float(params.get("block_w", 75.0)),
                block_h=float(params.get("block_h", 25.0)),
                spacing=float(params.get("spacing", 2.0)),
                page_margin=float(params.get("page_margin", 6.0)),
                raster_margin=float(params.get("raster_margin", 1.0)),
                template_tol=float(params.get("template_tol", 0.5)),
                title_size_mm=(float(params["title_mm"]) if params.get("title_mm") not in (None, "") else None),
                title_sub_gap_mm=float(params.get("title_sub_gap_mm", 0.6)),
                dot_diam_mm=float(params.get("dot_mm", 1.5)),
                dot_gap_mm=float(params.get("dot_gap_mm", 0.9)),
                dot_vgap_mm=float(params.get("dot_vgap_mm", 0.6)),
                max_icon_ratio=max(0.05, min(0.20, float(params.get("icon_ratio", 0.20)))),
                text_icon_gap_mm=float(params.get("text_icon_gap_mm", 1.6)),
                line_height=float(params.get("line_height", 1.08)),
                preview_dpi=int(params.get("preview_dpi", 300)),
                icon_white_threshold=max(0, min(255, int(params.get("icon_white_threshold", 200)))),
            )
            # Global dots enabled toggle
            show_dots = params.get("show_dots")
            if isinstance(show_dots, bool):
                lp.dots_enabled = show_dots
            # Color options
            mode = (color_cfg.get("mode") or "bw").strip().lower()
            lp.color_mode = mode == "color"
            if lp.color_mode:
                _hex_to_rgb = mj.parse_hex_color

                lp.title_rgb = _hex_to_rgb(color_cfg.get("title")) or (0, 0, 0)
                lp.subtitle_rgb = _hex_to_rgb(color_cfg.get("subtitle")) or (0, 0, 0)
                dot_hex = color_cfg.get("dot")
                if dot_hex:
                    lp.dot_rgb = _hex_to_rgb(dot_hex)

                bg = color_cfg.get("background") or {}
                style = (bg.get("style") or "solid").strip().lower()
                if style not in ("solid", "per-category", "gradient"):
                    style = "solid"
                lp.background_style = style
                if style == "solid":
                    lp.background_rgb = _hex_to_rgb(bg.get("solid") or "#ffffff") or (255, 255, 255)
                elif style == "per-category":
                    per = bg.get("perCategory") or {}
                    per_rgb = {}
                    for k, v in per.items():
                        c = _hex_to_rgb(v)
                        if not c:
                            continue
                        per_rgb[(k or "").strip().lower()] = c
                    lp.background_per_category = per_rgb
                    # default fallback color if specific category missing
                    lp.background_rgb = _hex_to_rgb(bg.get("solid") or "#ffffff") or (255, 255, 255)
                elif style == "gradient":
                    arr = bg.get("gradient") or []
                    c0 = _hex_to_rgb(arr[0]) if len(arr) > 0 else (255, 255, 255)
                    c1 = _hex_to_rgb(arr[1]) if len(arr) > 1 else (200, 200, 200)
                    lp.background_grad_0 = c0 or (255, 255, 255)
                    lp.background_grad_1 = c1 or (200, 200, 200)
        except Exception as e:
            return jsonify({"error": f"Invalid params: {e}"}), 400

        outdir = root / "output"

        # Auto font discovery: if uploads present they reside as title.* / subtitle.*
        title_auto = (
            mj.autofind_font(root, ["title.ttf", "Title.ttf", "title.otf", "Title.otf"]) or mj.BUNDLED_TITLE_FONT
        )
        sub_auto = (
            mj.autofind_font(root, ["subtitle.ttf", "Subtitle.ttf", "subtitle.otf", "Subtitle.otf"])
            or mj.BUNDLED_SUBTITLE_FONT
        )

        try:
            mj.cmd_build(
                root=root,
                outdir=outdir,
                json_name="blocks.json",
                font_regular=sub_auto,
                font_bold=title_auto,
                params=lp,
                dot_map=dot_map,
            )
        except Exception as e:
            return jsonify({"error": f"Build failed: {e}"}), 500

        # 6) Zip the output directory
        mem = io.BytesIO()
        with zipfile.ZipFile(mem, mode="w", compression=zipfile.ZIP_DEFLATED) as zf:
            for p in outdir.rglob("*"):
                if p.is_file():
                    zf.write(p, arcname=str(p.relative_to(outdir)))
        mem.seek(0)
        return send_file(mem, mimetype="application/zip", as_attachment=True, download_name="jenga-output.zip")
