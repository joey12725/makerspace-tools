
from PIL import Image
import collections

img_path = "./images/lithophane_output.png"
img = Image.open(img_path)

print(f"Format: {img.format}")
print(f"Mode: {img.mode}")
print(f"Size: {img.size}")

# Verify color palette or strictly B/W
colors = img.getcolors()
# For '1' mode, getcolors might behave differently or just show 2 colors.
print(f"Colors found: {colors}")

# If mode is not '1', we should check pixels manually or convert.
if img.mode != '1':
    print("Warning: Image is not in 1-bit mode.")
