
import os
import math
from PIL import Image, ImageOps

def get_images(directory):
    extensions = ['.png', '.jpg', '.jpeg']
    files = [os.path.join(directory, f) for f in os.listdir(directory) 
             if os.path.splitext(f)[1].lower() in extensions 
             and not f.startswith('lithophane_output')]
    # Sort to ensure deterministic order
    files.sort()
    return files

def calculate_grid_layout(num_images):
    # For 15 images, 3x5 is ideal.
    if num_images == 15:
        return 3, 5
        
    # For other numbers, try to find a grid that is roughly rectangular.
    # We want rows * cols >= num_images.
    # We prefer a layout that is slightly wider than it is tall (landscape style overall).
    rows = int(math.sqrt(num_images))
    cols = math.ceil(num_images / rows)
    
    return rows, cols

def get_safe_crop_box(img, threshold=89):
    """
    Finds the bounding box of the "content" defined by pixels darker than threshold.
    "Cannot crop past the first 4 black pixels in any given direction" implies:
    We must preserve the image content from the 4th black pixel on the left to the 4th from right, etc.
    Actually, to be safe and satisfy "as large as it can be", we should crop TO these bounds 
    (removing empty white space) but not FURTHER.
    """
    # Convert to Greyscale for analysis
    gray = img.convert("L")
    width, height = gray.size
    pixels = gray.load()
    
    # Identify all "black" pixels
    # We store X and Y coordinates of pixels that are considered black
    black_pixels = []
    for y in range(height):
        for x in range(width):
            if pixels[x, y] <= threshold:
                black_pixels.append((x, y))
    
    if len(black_pixels) < 8:
        # Not enough black pixels, protect the whole image
        return (0, 0, width, height)

    # Sort by X to find left/right bounds
    black_pixels.sort(key=lambda p: p[0])
    # 4th black pixel from left (index 3)
    min_x = black_pixels[3][0]
    # 4th black pixel from right (index -4)
    max_x = black_pixels[-4][0]
    
    # Sort by Y to find top/bottom bounds
    black_pixels.sort(key=lambda p: p[1])
    min_y = black_pixels[3][1]
    max_y = black_pixels[-4][1]
    
    # Validity check (ensure crop is valid and non-negative)
    if min_x >= max_x or min_y >= max_y:
        return (0, 0, width, height)
        
    return (min_x, min_y, max_x, max_y)

def resize_aspect_fit(img, target_w, target_h):
    """
    Resizes image to fit WITHIN the target box, preserving aspect ratio.
    Pads the rest with White.
    """
    img_w, img_h = img.size
    ratio = min(target_w / img_w, target_h / img_h)
    new_w = int(img_w * ratio)
    new_h = int(img_h * ratio)
    
    # Resize
    img = img.resize((new_w, new_h), Image.Resampling.LANCZOS)
    
    # Create new white background
    bg = Image.new('L', (target_w, target_h), 255)
    
    # Center paste
    x = (target_w - new_w) // 2
    y = (target_h - new_h) // 2
    bg.paste(img, (x, y))
    
    return bg

def apply_threshold(img, threshold=89):
    """
    Applies strict thresholding.
    < 65% black (value > 89) -> White (255)
    >= 65% black (value <= 89) -> Black (0)
    """
    # Point function: if x <= threshold return 0 else 255
    return img.point(lambda p: 0 if p <= threshold else 255)

def main():
    directory = "./images"
    images = get_images(directory)
    
    if not images:
        print("No images found!")
        return

    num_images = len(images)
    print(f"Found {num_images} images.")
    
    rows, cols = calculate_grid_layout(num_images)
    print(f"Layout: {rows} rows x {cols} cols")
    
    # 1. Load and Crop "Safe Content"
    cropped_images = []
    
    print("Analyzing images for smart cropping...")
    for img_path in images:
        with Image.open(img_path) as img:
            gray_img = img.convert('L')
            
            # Threshold 89 is "65% black" (pixels <= 89 are considered black)
            box = get_safe_crop_box(gray_img, threshold=89)
            
            cropped = gray_img.crop(box)
            cropped_images.append(cropped)
            
    # Calculate Max dimensions
    max_w = max(img.width for img in cropped_images)
    max_h = max(img.height for img in cropped_images)
    
    print(f"Max Content Size: {max_w}x{max_h}")
    
    cell_w = max_w
    cell_h = max_h
    
    # Create canvas
    canvas_w = cols * cell_w
    canvas_h = rows * cell_h
    canvas = Image.new('L', (canvas_w, canvas_h), 255) # White bg
    
    print(f"Canvas size: {canvas_w}x{canvas_h}")
    
    num_images_last_row = num_images % cols
    if num_images_last_row == 0:
        num_images_last_row = cols

    for i, img in enumerate(cropped_images):
        # Resize to fit cell
        processed_img = resize_aspect_fit(img, cell_w, cell_h)
        
        # Threshold
        final_img = apply_threshold(processed_img, threshold=89)
        
        # Paste
        row = i // cols
        col = i % cols
        
        x_offset = 0
        if row == rows - 1 and num_images_last_row < cols:
            # Center the last row
            x_offset = (canvas_w - (num_images_last_row * cell_w)) // 2
            
        x = x_offset + (col * cell_w)
        y = row * cell_h
        
        canvas.paste(final_img, (x, y))
        print(f"Placed image {i+1}/{num_images} at ({x}, {y})")

    # Convert to '1' mode
    output_img = canvas.convert('1')
    
    output_path = os.path.join(directory, "lithophane_output.png")
    output_img.save(output_path)
    print(f"Saved lithophane to {output_path}")

if __name__ == "__main__":
    main()
