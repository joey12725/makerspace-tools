"""Streamlit UI for previewing custom grip tape on a longboard deck."""

import io

import griptape as gt
import numpy as np
import streamlit as st
from PIL import Image

st.set_page_config(page_title="Longboard Grip Tape Visualizer", layout="wide")
st.title("Longboard Grip Tape Visualizer")

state = st.session_state
for key, default in {
    "base_image": None,
    "grip_image": None,
    "processed_grip": None,
    "offset_x": 0,
    "offset_y": 0,
    "scale": 1.0,
}.items():
    state.setdefault(key, default)

st.sidebar.header("Controls")
st.sidebar.subheader("1. Upload Images")
base_file = st.sidebar.file_uploader("Deck image (cutout area in a solid color)", type=["png", "jpg", "jpeg"])
grip_file = st.sidebar.file_uploader("Grip tape pattern", type=["png", "jpg", "jpeg"])

if base_file:
    state.base_image = Image.open(base_file).convert("RGBA")
if grip_file:
    state.grip_image = Image.open(grip_file).convert("RGBA")
    if state.processed_grip is None:
        state.processed_grip = state.grip_image.copy()

col1, col2 = st.columns(2)
with col1:
    st.subheader("Deck")
    if state.base_image:
        st.image(state.base_image, width="stretch")
    else:
        st.info("Upload an image of your deck")
with col2:
    st.subheader("Grip Tape Pattern")
    if state.processed_grip:
        st.image(state.processed_grip, width="stretch")
    else:
        st.info("Upload a grip tape pattern")

if not (state.base_image and state.grip_image):
    st.info("Upload both images to start designing your grip tape.")
else:
    st.sidebar.divider()
    st.sidebar.subheader("2. Define Cutout Area")
    st.sidebar.markdown("Pick the color on the deck image that marks where grip tape goes.")
    cutout_color = st.sidebar.color_picker("Cutout Color", "#000000")
    tolerance = st.sidebar.slider("Color Tolerance", 0, 255, 50)

    mask = gt.mask_from_color(state.base_image, gt.hex_to_rgb(cutout_color), tolerance)
    bounds = gt.mask_bounds(mask)

    if st.sidebar.checkbox("Show Cutout Mask Preview"):
        st.sidebar.image((mask * 255).astype(np.uint8), caption="Cutout (white = grip)", width="stretch")

    st.sidebar.divider()
    st.sidebar.subheader("3. Crop & Extend (applied first)")
    st.sidebar.markdown("**Crop (pixels to remove)**")
    c1, c2 = st.sidebar.columns(2)
    crop_left = c1.number_input("Left", 0, 2000, 0, key="crop_left")
    crop_top = c1.number_input("Top", 0, 2000, 0, key="crop_top")
    crop_right = c2.number_input("Right", 0, 2000, 0, key="crop_right")
    crop_bottom = c2.number_input("Bottom", 0, 2000, 0, key="crop_bottom")

    st.sidebar.markdown("**Extend (pixels to add)**")
    extend_mode = st.sidebar.selectbox("Fill Mode", ["black", "white", "average"])
    avg_n = st.sidebar.slider("Average from edge (n pixels)", 1, 20, 5) if extend_mode == "average" else 1
    e1, e2 = st.sidebar.columns(2)
    ext_left = e1.number_input("Left", 0, 2000, 0, key="ext_left")
    ext_top = e1.number_input("Top", 0, 2000, 0, key="ext_top")
    ext_right = e2.number_input("Right", 0, 2000, 0, key="ext_right")
    ext_bottom = e2.number_input("Bottom", 0, 2000, 0, key="ext_bottom")

    st.sidebar.divider()
    st.sidebar.subheader("4. Scale")
    scale = st.sidebar.slider("Scale Factor", 0.1, 5.0, state.scale, 0.05)
    if bounds:
        min_y, max_y, min_x, max_x = bounds
        s1, s2 = st.sidebar.columns(2)
        if s1.button("Match Width"):
            state.scale = (max_x - min_x + 1) / state.grip_image.width
            st.rerun()
        if s2.button("Match Height"):
            state.scale = (max_y - min_y + 1) / state.grip_image.height
            st.rerun()

    st.sidebar.divider()
    st.sidebar.subheader("5. Rotation")
    rotation = st.sidebar.slider("Rotation (degrees)", -180, 180, 0)

    st.sidebar.divider()
    st.sidebar.subheader("6. Position")
    base_w, base_h = state.base_image.size
    offset_x = st.sidebar.slider("X Offset", -base_w, base_w, state.offset_x)
    offset_y = st.sidebar.slider("Y Offset", -base_h, base_h, state.offset_y)

    st.sidebar.markdown("**Snap Position**")
    snaps = gt.snap_offsets(mask, state.processed_grip.size) if state.processed_grip else {}
    p1, p2 = st.sidebar.columns(2)
    for column, key, label in (
        (p1, "top", "Snap Top"),
        (p2, "bottom", "Snap Bottom"),
        (p1, "center", "Center (Box)"),
        (p2, "mass", "Center (Mass)"),
    ):
        if key in snaps and column.button(label):
            state.offset_x, state.offset_y = snaps[key]
            st.rerun()

    st.sidebar.divider()
    st.sidebar.subheader("7. Grip Tape Texture")
    grit = st.sidebar.slider("Grit (brightness noise)", 0, 50, 15)

    st.divider()
    st.subheader("Result Preview")
    if st.button("Generate Preview", type="primary"):
        with st.spinner("Rendering..."):
            settings = gt.GripSettings(
                crop=(crop_left, crop_top, crop_right, crop_bottom),
                extend=(ext_left, ext_top, ext_right, ext_bottom),
                extend_mode=extend_mode,
                extend_avg_pixels=avg_n,
                scale=scale,
                rotation=rotation,
                grit=grit,
            )
            processed = gt.process_grip(state.grip_image, settings)
            state.processed_grip = processed
            state.scale = scale

            result = gt.apply_grip(state.base_image, processed, mask, offset_x, offset_y)
            st.image(result, caption="Final Result", width="stretch")

            buf = io.BytesIO()
            result.save(buf, format="PNG")
            st.download_button("Download Result", buf.getvalue(), "longboard_grip_tape.png", "image/png")

with st.expander("How to use"):
    st.markdown(
        """
1. **Upload** a deck image with the grip area filled in one solid color, plus any pattern image.
2. **Define the cutout** by picking that color; the tolerance slider catches anti-aliased edges.
3. **Crop & extend** the pattern so it covers the deck shape.
4. **Scale** with the slider, or snap to the cutout's width or height.
5. **Rotate** the pattern to taste.
6. **Position** it with the sliders or the snap buttons.
7. **Add grit** to fake the sandpaper texture of real grip tape.
8. **Generate** the preview and download a PNG.
"""
    )
