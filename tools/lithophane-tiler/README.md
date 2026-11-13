# Lithophane Tiler

A small image-processing project that turns a collection of generated artwork
into a high-contrast, tiled lithophane image suitable for fabrication.

## Workflow

1. Place the source PNG/JPEG artwork in the project directory.
2. Run `generate_lithophane.py` to crop, normalize, threshold, and tile the
   images into `lithophane_output.png`.
3. Run `verify_output.py` to check the output mode, dimensions, and color
   palette.

```bash
python3 generate_lithophane.py
python3 verify_output.py
```

## Requirements

```bash
python3 -m pip install Pillow
```

The scripts currently use the original macOS project path for their input and
output locations. Update those constants when running from another machine.

Generated images are retained locally for fabrication but are ignored by the
repository so the source code stays easy to reuse.
