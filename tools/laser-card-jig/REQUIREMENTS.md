# Project Requirements: Bulk Laser Engraving Card Jig & Template Generator

## 1. Project Overview
A web-based internal utility designed to streamline the batch production of laser-engraved cards. The tool allows the user to configure physical dimensions, upload and process artwork, and automatically generate a 3D-printable alignment jig (STL), a laser-ready layout image (PNG), and a reusable configuration file (JSON). It is heavily inspired by the architecture and workflow of the "Jenga project".

## 2. Target Tech Stack
* **Framework:** Next.js (React) deployed on Vercel.
* **Styling:** TailwindCSS (for rapid, functional UI development).
* **2D Image Processing & PNG Generation:** Native HTML5 `<canvas>` API.
* **3D STL Generation:** `@jscad/modeling` (or equivalent client-side CSG library).
* **File Handling:** `file-saver` (for downloading the STL, PNG, and JSON artifacts).

## 3. User Inputs & Configuration
The UI must provide input fields for the following parameters, pre-populated with these default values:

### 3.1 Dimensions & Physical Constraints
* **Laser Cutter Max Bed Dimensions:** Total X and Y dimensions of the laser software workspace.
  * *Default:* `15.00 in` Width x `12.01 in` Height (Creality Falcon A1 Max Bed Size)
* **Center Bed/Jig Dimensions:** The X and Y dimensions of the designated center area on the laser bed (this dictates the overall size of the 3D printed jig).
  * *Default:* `15.00 in` Width x `12.00 in` Height
* **Card Dimensions:** Width and height of the individual cards.
  * *Default:* `3.346 in` Width x `2.165 in` Height (Equivalent to 85 mm x 55 mm)
* **Card Tolerance:** Extra padding added to the card dimensions in the STL to ensure the physical cards fit easily into the printed slots.

### 3.2 Artwork & Image Processing
* **Image Upload:** Capability to upload a standard image file.
* **Image Cropping:** Basic tools to crop the uploaded image to the desired aspect ratio of the card.
* **Image Adjustments:**
  * **Grayscale Toggle:** Convert the uploaded image to grayscale.
  * **Black Point Slider:** Adjust the darkest threshold of the image.
  * **White Point Slider:** Adjust the lightest threshold of the image.

## 4. Core Logic & Algorithms

### 4.1 Jig Layout & Spacing Algorithm
The application must calculate the maximum number of cards (`n`) that can fit within the **Center Bed/Jig Dimensions** while adhering to strict structural rules.
* **Jig Geometry:** The jig is conceptually a solid rectangular panel 1/4" (6.35mm) thick, with rectangular depressions removed from the top surface that are 1/8" (3.175mm) deep.
* **Spacing Rules:**
  * Cards must be spread out evenly across the available surface area.
  * Gap width calculation: `(Total Width - (n * Card Width)) / n`.
  * **Minimum Edge Margin:** The distance from any card to the outer edge of the jig must *never* be less than 1/8".
  * **Minimum Wall Thickness:** The walls separating individual cards must *never* be less than 1/8".
  * **Constraint Fallback:** If fitting `n` cards causes either the edge margin or the wall thickness to drop below 1/8", the system must automatically reduce `n` by 1 in that specific axis and recalculate the layout to maximize spacing.

### 4.2 Output Generation Logic
* **STL Generation:**
  * Generate a base plate of the Center Bed dimensions at 1/8" thickness.
  * Extrude the calculated wall grid upwards by an additional 1/8" (resulting in a total max thickness of 1/4").
  * The pockets must accommodate the exact dimensions of the `Card + Tolerance`.
* **PNG Generation:**
  * Canvas size must exactly match the **Laser Cutter Max Bed Dimensions**.
  * The processed artwork (cropped, grayscale, black/white point adjusted) must be duplicated and positioned onto the canvas.
  * The positions of the artwork *must exactly mirror* the mathematical coordinates of the card pockets in the STL, centered within the total canvas area.
* **JSON Generation:**
  * Serialize all current form inputs (dimensions, tolerances, image processing values, but excluding the raw image data) into a downloadable JSON file.

## 5. Artifacts Produced
When the user clicks "Generate", the application will trigger the download of three files:
1. **`jig_template.stl`**: The 3D model of the alignment tray.
2. **`laser_layout.png`**: The final image to be imported into the laser cutting software (e.g., LightBurn).
3. **`config_[timestamp].json`**: The settings file to reload this exact layout in the future.

## 6. Testing Expectations

### 6.1 Unit Testing (Layout Math)
* **Spacing Constraints:** Input parameters that intentionally crowd the board to verify the algorithm correctly drops a card and prioritizes the >= 1/8" wall/edge constraints.
* **Tolerance Application:** Verify that the STL pocket dimensions strictly equal `Card Dimension + Tolerance` and that wall thickness calculations account for this tolerance.

### 6.2 Visual & Functional Testing
* **Canvas vs. STL Alignment:** Overlay the generated PNG onto a top-down projection of the STL to ensure a 1:1 positional match.
* **Image Processing:** Verify that black point and white point slider adjustments correctly map pixel values to pure black or pure white on the HTML5 Canvas.
* **State Hydration:** Upload a previously generated JSON file and confirm all UI inputs and image adjustments accurately return to their saved states.
* **Print Viability:** Slice the first generated STL to confirm the 1/8" depth and 1/4" total thickness render correctly as solid bodies without non-manifold edges.
