export interface JigDimensions {
  laserBedWidthIn: number;
  laserBedHeightIn: number;
  jigWidthIn: number;
  jigHeightIn: number;
  cardWidthIn: number;
  cardHeightIn: number;
  toleranceIn: number;
}

export interface ImageProcessingConfig {
  grayscale: boolean;
  blackPoint: number;
  whitePoint: number;
  cropXPercent: number;
  cropYPercent: number;
  cropWidthPercent: number;
  cropHeightPercent: number;
}

export interface AxisLayout {
  count: number;
  wallThicknessIn: number;
  edgeMarginIn: number;
}

export interface PocketSlot {
  column: number;
  row: number;
  xIn: number;
  yIn: number;
  widthIn: number;
  heightIn: number;
}

export interface JigLayout {
  columns: number;
  rows: number;
  pocketWidthIn: number;
  pocketHeightIn: number;
  axisX: AxisLayout;
  axisY: AxisLayout;
  slots: PocketSlot[];
}

export interface PersistedConfig {
  version: number;
  savedAt: string;
  dimensions: JigDimensions;
  imageProcessing: ImageProcessingConfig;
}
