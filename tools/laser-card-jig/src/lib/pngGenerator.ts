import { LayoutResult } from './layoutAlgorithm';

/**
 * Generate a PNG blob for the laser layout
 * Canvas size matches laser bed dimensions, with artwork positioned to match STL positions
 */
export function generatePNG(
  laserBedWidth: number,
  laserBedHeight: number,
  cardWidth: number,
  cardHeight: number,
  layout: LayoutResult,
  sourceCanvas: HTMLCanvasElement
): Promise<Blob> {
  // Convert inches to pixels (using 96 DPI as standard)
  const DPI = 96;
  const canvasWidth = Math.round(laserBedWidth * DPI);
  const canvasHeight = Math.round(laserBedHeight * DPI);
  const cardWidthPx = Math.round(cardWidth * DPI);
  const cardHeightPx = Math.round(cardHeight * DPI);

  // Create output canvas
  const canvas = document.createElement('canvas');
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    throw new Error('Failed to get canvas context');
  }

  // Fill with white background
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  // Calculate offset to center the jig area within the laser bed
  const jigWidthPx = layout.positions.length > 0 
    ? Math.max(...layout.positions.map(p => p.x)) * DPI + cardWidthPx / 2
    : 0;
  const jigHeightPx = layout.positions.length > 0
    ? Math.max(...layout.positions.map(p => p.y)) * DPI + cardHeightPx / 2
    : 0;
  
  const offsetX = (canvasWidth - jigWidthPx) / 2;
  const offsetY = (canvasHeight - jigHeightPx) / 2;

  // Draw the processed image at each card position
  layout.positions.forEach((pos) => {
    const x = pos.x * DPI - cardWidthPx / 2 + offsetX;
    const y = pos.y * DPI - cardHeightPx / 2 + offsetY;

    ctx.drawImage(
      sourceCanvas,
      0,
      0,
      sourceCanvas.width,
      sourceCanvas.height,
      x,
      y,
      cardWidthPx,
      cardHeightPx
    );
  });

  // Convert to blob
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error('Failed to create PNG blob'));
      }
    }, 'image/png');
  });
}
