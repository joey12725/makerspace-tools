import { getJigOffsetOnLaserBed } from "@/lib/layout";
import type { JigDimensions, JigLayout } from "@/lib/types";

export const DEFAULT_OUTPUT_DPI = 300;

interface BuildPngInput {
  dimensions: JigDimensions;
  layout: JigLayout;
  processedArtwork: HTMLCanvasElement;
  dpi?: number;
}

function toPixels(inches: number, dpi: number): number {
  return Math.max(1, Math.round(inches * dpi));
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error("PNG generation failed."));
      }
    }, "image/png");
  });
}

export async function buildLaserLayoutPngBlob({
  dimensions,
  layout,
  processedArtwork,
  dpi = DEFAULT_OUTPUT_DPI,
}: BuildPngInput): Promise<Blob> {
  if (dpi <= 0) {
    throw new Error("DPI must be greater than 0.");
  }

  const canvas = document.createElement("canvas");
  canvas.width = toPixels(dimensions.laserBedWidthIn, dpi);
  canvas.height = toPixels(dimensions.laserBedHeightIn, dpi);

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Unable to create canvas context for PNG generation.");
  }

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const offset = getJigOffsetOnLaserBed(dimensions);

  for (const slot of layout.slots) {
    const xPx = (offset.offsetXIn + slot.xIn) * dpi;
    const yPx = (offset.offsetYIn + slot.yIn) * dpi;
    const widthPx = slot.widthIn * dpi;
    const heightPx = slot.heightIn * dpi;

    ctx.drawImage(processedArtwork, xPx, yPx, widthPx, heightPx);
  }

  return canvasToBlob(canvas);
}
