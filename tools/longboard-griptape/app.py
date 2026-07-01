import streamlit as st
import numpy as np
from PIL import Image
import io

st.set_page_config(page_title="Longboard Grip Tape Visualizer", layout="wide")
st.title("Longboard Grip Tape Visualizer")


def hex_to_rgb(hex_color):
    """Convert hex string to RGB tuple."""
    hex_color = hex_color.lstrip("#")
    return tuple(int(hex_color[i : i + 2], 16) for i in (0, 2, 4))


def create_mask_from_color(image, target_color, tolerance):
    """Create a binary mask based on color selection with tolerance."""
    img_array = np.array(image.convert("RGB"))
    target = np.array(target_color)
    diff = np.sqrt(np.sum((img_array.astype(float) - target.astype(float)) ** 2, axis=2))
    mask = diff <= tolerance
    return mask


def get_mask_bounds(mask):
    """Get the bounding box of the mask (min_y, max_y, min_x, max_x)."""
    rows = np.any(mask, axis=1)
    cols = np.any(mask, axis=0)
    if not np.any(rows) or not np.any(cols):
        return None
    min_y, max_y = np.where(rows)[0][[0, -1]]
    min_x, max_x = np.where(cols)[0][[0, -1]]
    return int(min_y), int(max_y), int(min_x), int(max_x)


def get_mask_center_of_mass(mask):
    """Get the center of mass of the mask."""
    y_coords, x_coords = np.where(mask)
    if len(y_coords) == 0:
        return None
    center_y = np.mean(y_coords)
    center_x = np.mean(x_coords)
    return int(center_y), int(center_x)


def extend_image_edge(image, direction, pixels, mode, avg_pixels=1):
    """Extend image by adding pixels to a specific edge."""
    img_array = np.array(image)
    h, w = img_array.shape[:2]
    channels = img_array.shape[2] if len(img_array.shape) > 2 else 1

    if pixels <= 0:
        return image

    if mode == "black":
        fill_value = np.zeros(channels, dtype=np.uint8) if channels > 1 else 0
    elif mode == "white":
        fill_value = np.ones(channels, dtype=np.uint8) * 255 if channels > 1 else 255
    else:  # average
        avg_pixels = min(avg_pixels, min(h, w))
        if direction == "top":
            edge = img_array[:avg_pixels, :, :]
        elif direction == "bottom":
            edge = img_array[-avg_pixels:, :, :]
        elif direction == "left":
            edge = img_array[:, :avg_pixels, :]
        else:  # right
            edge = img_array[:, -avg_pixels:, :]
        fill_value = np.mean(edge, axis=(0, 1)).astype(np.uint8)

    if direction == "top":
        extension = np.tile(fill_value, (pixels, w, 1))
        result = np.vstack([extension, img_array])
    elif direction == "bottom":
        extension = np.tile(fill_value, (pixels, w, 1))
        result = np.vstack([img_array, extension])
    elif direction == "left":
        extension = np.tile(fill_value, (h, pixels, 1))
        result = np.hstack([extension, img_array])
    else:  # right
        extension = np.tile(fill_value, (h, pixels, 1))
        result = np.hstack([img_array, extension])

    return Image.fromarray(result)


def crop_image(image, left, top, right, bottom):
    """Crop image by removing pixels from edges."""
    w, h = image.size
    new_left = min(left, w - 1)
    new_top = min(top, h - 1)
    new_right = max(w - right, new_left + 1)
    new_bottom = max(h - bottom, new_top + 1)
    return image.crop((new_left, new_top, new_right, new_bottom))


def scale_image(image, scale_factor):
    """Scale image by a factor."""
    if scale_factor == 1.0:
        return image
    w, h = image.size
    new_w = max(1, int(w * scale_factor))
    new_h = max(1, int(h * scale_factor))
    return image.resize((new_w, new_h), Image.Resampling.LANCZOS)


def add_brightness_noise(image, intensity):
    """Add random brightness noise to simulate grip tape texture."""
    if intensity <= 0:
        return image
    img_array = np.array(image).astype(float)
    noise = np.random.normal(0, intensity, img_array.shape[:2])
    if len(img_array.shape) == 3:
        noise = noise[:, :, np.newaxis]
    noisy = img_array + noise
    noisy = np.clip(noisy, 0, 255).astype(np.uint8)
    return Image.fromarray(noisy)


def apply_grip_tape_to_base(base_image, grip_image, mask, offset_x, offset_y):
    """Apply grip tape image to base image using mask."""
    base_array = np.array(base_image.convert("RGBA"))
    grip_array = np.array(grip_image.convert("RGBA"))

    result = base_array.copy()
    base_h, base_w = base_array.shape[:2]
    grip_h, grip_w = grip_array.shape[:2]

    for y in range(base_h):
        for x in range(base_w):
            if mask[y, x]:
                grip_y = y - offset_y
                grip_x = x - offset_x
                if 0 <= grip_y < grip_h and 0 <= grip_x < grip_w:
                    result[y, x] = grip_array[grip_y, grip_x]

    return Image.fromarray(result)


# Sidebar for controls
st.sidebar.header("Controls")

# Image uploads
st.sidebar.subheader("1. Upload Images")
base_file = st.sidebar.file_uploader("Upload Base Image (Longboard)", type=["png", "jpg", "jpeg"])
grip_file = st.sidebar.file_uploader("Upload Grip Tape Pattern", type=["png", "jpg", "jpeg"])

# Initialize session state
if "base_image" not in st.session_state:
    st.session_state.base_image = None
if "grip_image" not in st.session_state:
    st.session_state.grip_image = None
if "processed_grip" not in st.session_state:
    st.session_state.processed_grip = None
if "offset_x" not in st.session_state:
    st.session_state.offset_x = 0
if "offset_y" not in st.session_state:
    st.session_state.offset_y = 0
if "scale" not in st.session_state:
    st.session_state.scale = 1.0

# Load images
if base_file:
    st.session_state.base_image = Image.open(base_file).convert("RGBA")

if grip_file:
    st.session_state.grip_image = Image.open(grip_file).convert("RGBA")
    if st.session_state.processed_grip is None:
        st.session_state.processed_grip = st.session_state.grip_image.copy()

# Main content area
col1, col2 = st.columns(2)

with col1:
    st.subheader("Base Image")
    if st.session_state.base_image:
        st.image(st.session_state.base_image, use_container_width=True)
    else:
        st.info("Upload a base image of your longboard")

with col2:
    st.subheader("Grip Tape Pattern")
    if st.session_state.processed_grip:
        st.image(st.session_state.processed_grip, use_container_width=True)
    else:
        st.info("Upload a grip tape pattern image")

if st.session_state.base_image and st.session_state.grip_image:
    st.sidebar.divider()

    # Color selection for cutout
    st.sidebar.subheader("2. Define Cutout Area")
    st.sidebar.markdown("Select the color on the base image that defines where grip tape should go")

    cutout_color = st.sidebar.color_picker("Cutout Color", "#000000")
    color_tolerance = st.sidebar.slider("Color Tolerance", 0, 255, 50)

    # Create mask
    target_rgb = hex_to_rgb(cutout_color)
    mask = create_mask_from_color(st.session_state.base_image, target_rgb, color_tolerance)
    mask_bounds = get_mask_bounds(mask)
    mask_com = get_mask_center_of_mass(mask)

    # Show mask preview
    if st.sidebar.checkbox("Show Cutout Mask Preview"):
        mask_preview = (mask * 255).astype(np.uint8)
        st.sidebar.image(mask_preview, caption="Cutout Area (white = grip tape)", use_container_width=True)

    st.sidebar.divider()

    # Grip tape transformations
    st.sidebar.subheader("3. Crop & Extend (Applied First)")

    # Crop controls
    st.sidebar.markdown("**Crop (pixels to remove)**")
    crop_col1, crop_col2 = st.sidebar.columns(2)
    with crop_col1:
        crop_left = st.number_input("Left", 0, 2000, 0, key="crop_left")
        crop_top = st.number_input("Top", 0, 2000, 0, key="crop_top")
    with crop_col2:
        crop_right = st.number_input("Right", 0, 2000, 0, key="crop_right")
        crop_bottom = st.number_input("Bottom", 0, 2000, 0, key="crop_bottom")

    # Extend controls
    st.sidebar.markdown("**Extend (pixels to add)**")
    extend_mode = st.sidebar.selectbox("Fill Mode", ["black", "white", "average"])
    if extend_mode == "average":
        avg_n = st.sidebar.slider("Average from edge (n pixels)", 1, 20, 5)
    else:
        avg_n = 1

    extend_col1, extend_col2 = st.sidebar.columns(2)
    with extend_col1:
        extend_left = st.number_input("Left", 0, 2000, 0, key="ext_left")
        extend_top = st.number_input("Top", 0, 2000, 0, key="ext_top")
    with extend_col2:
        extend_right = st.number_input("Right", 0, 2000, 0, key="ext_right")
        extend_bottom = st.number_input("Bottom", 0, 2000, 0, key="ext_bottom")

    st.sidebar.divider()

    # Scale controls
    st.sidebar.subheader("4. Scale")
    scale = st.sidebar.slider("Scale Factor", 0.1, 5.0, st.session_state.scale, 0.05)

    # Scale snap buttons
    if mask_bounds:
        min_y, max_y, min_x, max_x = mask_bounds
        cutout_width = max_x - min_x + 1
        cutout_height = max_y - min_y + 1

        scale_col1, scale_col2 = st.sidebar.columns(2)
        with scale_col1:
            if st.button("Match Width"):
                grip_w = st.session_state.grip_image.size[0]
                st.session_state.scale = cutout_width / grip_w
                st.rerun()
        with scale_col2:
            if st.button("Match Height"):
                grip_h = st.session_state.grip_image.size[1]
                st.session_state.scale = cutout_height / grip_h
                st.rerun()

    st.sidebar.divider()

    # Rotation
    st.sidebar.subheader("5. Rotation")
    rotation = st.sidebar.slider("Rotation (degrees)", -180, 180, 0)

    st.sidebar.divider()

    # Position controls
    st.sidebar.subheader("6. Position")
    base_w, base_h = st.session_state.base_image.size
    offset_x = st.sidebar.slider("X Offset", -base_w, base_w, st.session_state.offset_x)
    offset_y = st.sidebar.slider("Y Offset", -base_h, base_h, st.session_state.offset_y)

    # Position snap buttons
    st.sidebar.markdown("**Snap Position**")
    if mask_bounds:
        min_y, max_y, min_x, max_x = mask_bounds
        cutout_width = max_x - min_x + 1
        cutout_height = max_y - min_y + 1
        cutout_center_x = (min_x + max_x) // 2
        cutout_center_y = (min_y + max_y) // 2

        pos_col1, pos_col2 = st.sidebar.columns(2)
        with pos_col1:
            if st.button("Snap Top"):
                # Align top of grip to top of cutout
                st.session_state.offset_y = min_y
                st.session_state.offset_x = min_x
                st.rerun()
            if st.button("Center (Square)"):
                # Center grip on cutout center (geometric center)
                if st.session_state.processed_grip:
                    grip_w, grip_h = st.session_state.processed_grip.size
                    st.session_state.offset_x = cutout_center_x - grip_w // 2
                    st.session_state.offset_y = cutout_center_y - grip_h // 2
                    st.rerun()
        with pos_col2:
            if st.button("Snap Bottom"):
                # Align bottom of grip to bottom of cutout
                if st.session_state.processed_grip:
                    grip_h = st.session_state.processed_grip.size[1]
                    st.session_state.offset_y = max_y - grip_h + 1
                    st.session_state.offset_x = min_x
                    st.rerun()
            if st.button("Center (Mass)"):
                # Center grip on center of mass
                if mask_com and st.session_state.processed_grip:
                    com_y, com_x = mask_com
                    grip_w, grip_h = st.session_state.processed_grip.size
                    st.session_state.offset_x = com_x - grip_w // 2
                    st.session_state.offset_y = com_y - grip_h // 2
                    st.rerun()

    st.sidebar.divider()

    # Noise for grip tape texture
    st.sidebar.subheader("7. Grip Tape Texture")
    noise_intensity = st.sidebar.slider("Brightness Noise Intensity", 0, 50, 15)

    st.sidebar.divider()

    # Generate final result
    st.divider()
    st.subheader("Result Preview")

    if st.button("Generate Preview", type="primary"):
        with st.spinner("Generating preview..."):
            # Process grip tape image
            processed = st.session_state.grip_image.copy()

            # 1. Apply crop FIRST
            if any([crop_left, crop_top, crop_right, crop_bottom]):
                processed = crop_image(processed, crop_left, crop_top, crop_right, crop_bottom)

            # 2. Apply extend SECOND
            if extend_top > 0:
                processed = extend_image_edge(processed, "top", extend_top, extend_mode, avg_n)
            if extend_bottom > 0:
                processed = extend_image_edge(processed, "bottom", extend_bottom, extend_mode, avg_n)
            if extend_left > 0:
                processed = extend_image_edge(processed, "left", extend_left, extend_mode, avg_n)
            if extend_right > 0:
                processed = extend_image_edge(processed, "right", extend_right, extend_mode, avg_n)

            # 3. Apply scale THIRD
            if scale != 1.0:
                processed = scale_image(processed, scale)

            # 4. Apply rotation FOURTH
            if rotation != 0:
                processed = processed.rotate(rotation, expand=True, fillcolor=(0, 0, 0, 0))

            # 5. Apply noise LAST
            if noise_intensity > 0:
                processed = add_brightness_noise(processed, noise_intensity)

            st.session_state.processed_grip = processed
            st.session_state.scale = scale

            # Apply grip tape to base image
            result = apply_grip_tape_to_base(
                st.session_state.base_image,
                processed,
                mask,
                offset_x,
                offset_y,
            )
            st.image(result, caption="Final Result", use_container_width=True)

            # Download button
            buf = io.BytesIO()
            result.save(buf, format="PNG")
            st.download_button(
                label="Download Result",
                data=buf.getvalue(),
                file_name="longboard_grip_tape.png",
                mime="image/png",
            )

else:
    st.info("Upload both images to start customizing your grip tape design!")

# Instructions
with st.expander("How to Use"):
    st.markdown(
        """
    1. **Upload Images**: Upload your longboard base image and a grip tape pattern
    2. **Define Cutout**: Pick a color from the base image that represents where the grip tape should go
    3. **Crop & Extend**: Adjust the grip tape image size (applied first before other transforms)
    4. **Scale**: Use slider or snap to match cutout width/height
    5. **Rotate**: Rotate the pattern as needed
    6. **Position**: Use sliders or snap buttons to align grip tape with cutout
    7. **Texture**: Add noise to simulate grip tape material
    8. **Generate**: Click "Generate Preview" to apply all transformations and see the result
    """
    )
