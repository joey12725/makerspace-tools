import { normalizeImageProcessing } from "@/lib/image-processing";
import type { ImageProcessingConfig, JigDimensions, PersistedConfig } from "@/lib/types";

export const DEFAULT_DIMENSIONS: JigDimensions = {
  laserBedWidthIn: 15,
  laserBedHeightIn: 12.01,
  jigWidthIn: 15,
  jigHeightIn: 12,
  cardWidthIn: 3.346,
  cardHeightIn: 2.165,
  toleranceIn: 0.01,
};

export const DEFAULT_IMAGE_PROCESSING: ImageProcessingConfig = {
  grayscale: true,
  blackPoint: 20,
  whitePoint: 235,
  cropXPercent: 0,
  cropYPercent: 0,
  cropWidthPercent: 100,
  cropHeightPercent: 100,
};

function asNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

export function buildPersistedConfig(
  dimensions: JigDimensions,
  imageProcessing: ImageProcessingConfig,
): PersistedConfig {
  return {
    version: 1,
    savedAt: new Date().toISOString(),
    dimensions,
    imageProcessing,
  };
}

export function parsePersistedConfig(input: string): {
  dimensions: JigDimensions;
  imageProcessing: ImageProcessingConfig;
} {
  let parsed: unknown;

  try {
    parsed = JSON.parse(input);
  } catch {
    throw new Error("The selected config file is not valid JSON.");
  }

  if (!parsed || typeof parsed !== "object") {
    throw new Error("The selected config file has an invalid format.");
  }

  const config = parsed as Partial<PersistedConfig>;
  const dimensionsRaw = config.dimensions ?? {};
  const imageRaw = config.imageProcessing ?? {};

  const dimensions: JigDimensions = {
    laserBedWidthIn: asNumber(
      (dimensionsRaw as Partial<JigDimensions>).laserBedWidthIn,
      DEFAULT_DIMENSIONS.laserBedWidthIn,
    ),
    laserBedHeightIn: asNumber(
      (dimensionsRaw as Partial<JigDimensions>).laserBedHeightIn,
      DEFAULT_DIMENSIONS.laserBedHeightIn,
    ),
    jigWidthIn: asNumber((dimensionsRaw as Partial<JigDimensions>).jigWidthIn, DEFAULT_DIMENSIONS.jigWidthIn),
    jigHeightIn: asNumber((dimensionsRaw as Partial<JigDimensions>).jigHeightIn, DEFAULT_DIMENSIONS.jigHeightIn),
    cardWidthIn: asNumber((dimensionsRaw as Partial<JigDimensions>).cardWidthIn, DEFAULT_DIMENSIONS.cardWidthIn),
    cardHeightIn: asNumber((dimensionsRaw as Partial<JigDimensions>).cardHeightIn, DEFAULT_DIMENSIONS.cardHeightIn),
    toleranceIn: asNumber((dimensionsRaw as Partial<JigDimensions>).toleranceIn, DEFAULT_DIMENSIONS.toleranceIn),
  };

  const imageProcessing = normalizeImageProcessing({
    grayscale: asBoolean((imageRaw as Partial<ImageProcessingConfig>).grayscale, DEFAULT_IMAGE_PROCESSING.grayscale),
    blackPoint: asNumber((imageRaw as Partial<ImageProcessingConfig>).blackPoint, DEFAULT_IMAGE_PROCESSING.blackPoint),
    whitePoint: asNumber((imageRaw as Partial<ImageProcessingConfig>).whitePoint, DEFAULT_IMAGE_PROCESSING.whitePoint),
    cropXPercent: asNumber((imageRaw as Partial<ImageProcessingConfig>).cropXPercent, DEFAULT_IMAGE_PROCESSING.cropXPercent),
    cropYPercent: asNumber((imageRaw as Partial<ImageProcessingConfig>).cropYPercent, DEFAULT_IMAGE_PROCESSING.cropYPercent),
    cropWidthPercent: asNumber((imageRaw as Partial<ImageProcessingConfig>).cropWidthPercent, DEFAULT_IMAGE_PROCESSING.cropWidthPercent),
    cropHeightPercent: asNumber((imageRaw as Partial<ImageProcessingConfig>).cropHeightPercent, DEFAULT_IMAGE_PROCESSING.cropHeightPercent),
  });

  return {
    dimensions,
    imageProcessing,
  };
}

export function formatTimestampForFile(date: Date = new Date()): string {
  return date.toISOString().replaceAll(":", "-").replaceAll(".", "-");
}
