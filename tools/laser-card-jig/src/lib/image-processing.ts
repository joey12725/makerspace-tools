import type { ImageProcessingConfig } from "@/lib/types";

interface CropRectPx {
  x: number;
  y: number;
  width: number;
  height: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function normalizeImageProcessing(config: ImageProcessingConfig): ImageProcessingConfig {
  const cropXPercent = clamp(config.cropXPercent, 0, 99);
  const cropYPercent = clamp(config.cropYPercent, 0, 99);
  const cropWidthPercent = clamp(config.cropWidthPercent, 1, 100 - cropXPercent);
  const cropHeightPercent = clamp(config.cropHeightPercent, 1, 100 - cropYPercent);

  let blackPoint = Math.round(clamp(config.blackPoint, 0, 255));
  let whitePoint = Math.round(clamp(config.whitePoint, 0, 255));

  if (whitePoint <= blackPoint) {
    if (blackPoint >= 255) {
      blackPoint = 254;
      whitePoint = 255;
    } else {
      whitePoint = blackPoint + 1;
    }
  }

  return {
    grayscale: config.grayscale,
    blackPoint,
    whitePoint,
    cropXPercent,
    cropYPercent,
    cropWidthPercent,
    cropHeightPercent,
  };
}

export function autoCropToAspect(
  imageWidth: number,
  imageHeight: number,
  targetAspectRatio: number,
): Pick<ImageProcessingConfig, "cropXPercent" | "cropYPercent" | "cropWidthPercent" | "cropHeightPercent"> {
  if (imageWidth <= 0 || imageHeight <= 0 || targetAspectRatio <= 0) {
    return {
      cropXPercent: 0,
      cropYPercent: 0,
      cropWidthPercent: 100,
      cropHeightPercent: 100,
    };
  }

  const imageAspect = imageWidth / imageHeight;

  if (imageAspect > targetAspectRatio) {
    const cropWidthPercent = (targetAspectRatio / imageAspect) * 100;
    return {
      cropXPercent: (100 - cropWidthPercent) / 2,
      cropYPercent: 0,
      cropWidthPercent,
      cropHeightPercent: 100,
    };
  }

  const cropHeightPercent = (imageAspect / targetAspectRatio) * 100;
  return {
    cropXPercent: 0,
    cropYPercent: (100 - cropHeightPercent) / 2,
    cropWidthPercent: 100,
    cropHeightPercent,
  };
}

export function getCropRectPixels(
  image: HTMLImageElement,
  processingConfig: ImageProcessingConfig,
): CropRectPx {
  const normalized = normalizeImageProcessing(processingConfig);

  const x = Math.floor((normalized.cropXPercent / 100) * image.naturalWidth);
  const y = Math.floor((normalized.cropYPercent / 100) * image.naturalHeight);

  const maxCropWidth = image.naturalWidth - x;
  const maxCropHeight = image.naturalHeight - y;

  const width = Math.max(
    1,
    Math.floor((normalized.cropWidthPercent / 100) * image.naturalWidth),
  );
  const height = Math.max(
    1,
    Math.floor((normalized.cropHeightPercent / 100) * image.naturalHeight),
  );

  return {
    x,
    y,
    width: Math.min(width, maxCropWidth),
    height: Math.min(height, maxCropHeight),
  };
}

export function createProcessedArtworkCanvas(
  image: HTMLImageElement,
  processingConfig: ImageProcessingConfig,
): HTMLCanvasElement {
  const normalized = normalizeImageProcessing(processingConfig);
  const crop = getCropRectPixels(image, normalized);

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, crop.width);
  canvas.height = Math.max(1, crop.height);

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Unable to create canvas context for image processing.");
  }

  ctx.drawImage(image, crop.x, crop.y, crop.width, crop.height, 0, 0, crop.width, crop.height);

  const imageData = ctx.getImageData(0, 0, crop.width, crop.height);
  applyLevels(imageData.data, normalized.blackPoint, normalized.whitePoint, normalized.grayscale);
  ctx.putImageData(imageData, 0, 0);

  return canvas;
}

export function drawSourcePreview(
  canvas: HTMLCanvasElement,
  image: HTMLImageElement,
  processingConfig: ImageProcessingConfig,
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return;
  }

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#0b0f14";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const drawScale = Math.min(canvas.width / image.naturalWidth, canvas.height / image.naturalHeight);
  const drawWidth = image.naturalWidth * drawScale;
  const drawHeight = image.naturalHeight * drawScale;
  const offsetX = (canvas.width - drawWidth) / 2;
  const offsetY = (canvas.height - drawHeight) / 2;

  ctx.drawImage(image, offsetX, offsetY, drawWidth, drawHeight);

  const crop = getCropRectPixels(image, processingConfig);
  const cropX = offsetX + crop.x * drawScale;
  const cropY = offsetY + crop.y * drawScale;
  const cropWidth = crop.width * drawScale;
  const cropHeight = crop.height * drawScale;

  ctx.save();
  ctx.fillStyle = "rgba(0, 0, 0, 0.45)";
  ctx.beginPath();
  ctx.rect(offsetX, offsetY, drawWidth, drawHeight);
  ctx.rect(cropX, cropY, cropWidth, cropHeight);
  ctx.fill("evenodd");

  ctx.strokeStyle = "#22d3ee";
  ctx.lineWidth = 2;
  ctx.strokeRect(cropX, cropY, cropWidth, cropHeight);
  ctx.restore();
}

export function drawScaledPreview(canvas: HTMLCanvasElement, source: HTMLCanvasElement): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return;
  }

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#0b0f14";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const scale = Math.min(canvas.width / source.width, canvas.height / source.height);
  const width = source.width * scale;
  const height = source.height * scale;
  const x = (canvas.width - width) / 2;
  const y = (canvas.height - height) / 2;

  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, x, y, width, height);
}

function applyLevels(
  pixels: Uint8ClampedArray,
  blackPoint: number,
  whitePoint: number,
  grayscale: boolean,
): void {
  const span = Math.max(1, whitePoint - blackPoint);

  for (let idx = 0; idx < pixels.length; idx += 4) {
    let r = pixels[idx];
    let g = pixels[idx + 1];
    let b = pixels[idx + 2];

    if (grayscale) {
      const gray = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      r = gray;
      g = gray;
      b = gray;
    }

    pixels[idx] = remapChannel(r, blackPoint, span);
    pixels[idx + 1] = remapChannel(g, blackPoint, span);
    pixels[idx + 2] = remapChannel(b, blackPoint, span);
  }
}

function remapChannel(value: number, blackPoint: number, span: number): number {
  if (value <= blackPoint) {
    return 0;
  }
  if (value >= blackPoint + span) {
    return 255;
  }

  const normalized = (value - blackPoint) / span;
  return Math.round(normalized * 255);
}
