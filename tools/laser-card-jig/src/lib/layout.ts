import type { AxisLayout, JigDimensions, JigLayout, PocketSlot } from "@/lib/types";

export const MIN_EDGE_MARGIN_IN = 0.125;
export const MIN_WALL_THICKNESS_IN = 0.125;

interface AxisInput {
  totalIn: number;
  pocketIn: number;
}

const POSITIVE_TOLERANCE = 1e-9;

export function calculateAxisLayout({ totalIn, pocketIn }: AxisInput): AxisLayout {
  if (totalIn <= 0 || pocketIn <= 0) {
    throw new Error("Axis dimensions must be positive numbers.");
  }

  const maxCards = Math.floor(totalIn / pocketIn);
  if (maxCards < 1) {
    throw new Error("Pocket dimensions do not fit this axis.");
  }

  for (let count = maxCards; count >= 1; count -= 1) {
    const wallThicknessIn = (totalIn - count * pocketIn) / count;
    const edgeMarginIn = wallThicknessIn / 2;

    const wallOk = wallThicknessIn + POSITIVE_TOLERANCE >= MIN_WALL_THICKNESS_IN;
    const edgeOk = edgeMarginIn + POSITIVE_TOLERANCE >= MIN_EDGE_MARGIN_IN;

    if (wallOk && edgeOk) {
      return {
        count,
        wallThicknessIn,
        edgeMarginIn,
      };
    }
  }

  throw new Error(
    `Unable to satisfy minimum wall and edge constraints with total=${totalIn.toFixed(3)} and pocket=${pocketIn.toFixed(3)}.`,
  );
}

export function calculateJigLayout(dimensions: JigDimensions): JigLayout {
  validateDimensions(dimensions);

  const pocketWidthIn = dimensions.cardWidthIn + dimensions.toleranceIn;
  const pocketHeightIn = dimensions.cardHeightIn + dimensions.toleranceIn;

  const axisX = calculateAxisLayout({
    totalIn: dimensions.jigWidthIn,
    pocketIn: pocketWidthIn,
  });
  const axisY = calculateAxisLayout({
    totalIn: dimensions.jigHeightIn,
    pocketIn: pocketHeightIn,
  });

  const slots: PocketSlot[] = [];

  for (let row = 0; row < axisY.count; row += 1) {
    for (let column = 0; column < axisX.count; column += 1) {
      const xIn = axisX.edgeMarginIn + column * (pocketWidthIn + axisX.wallThicknessIn);
      const yIn = axisY.edgeMarginIn + row * (pocketHeightIn + axisY.wallThicknessIn);

      slots.push({
        column,
        row,
        xIn,
        yIn,
        widthIn: pocketWidthIn,
        heightIn: pocketHeightIn,
      });
    }
  }

  return {
    columns: axisX.count,
    rows: axisY.count,
    pocketWidthIn,
    pocketHeightIn,
    axisX,
    axisY,
    slots,
  };
}

export function getJigOffsetOnLaserBed(dimensions: JigDimensions) {
  const offsetXIn = (dimensions.laserBedWidthIn - dimensions.jigWidthIn) / 2;
  const offsetYIn = (dimensions.laserBedHeightIn - dimensions.jigHeightIn) / 2;

  if (offsetXIn < 0 || offsetYIn < 0) {
    throw new Error("Laser bed dimensions must be greater than or equal to jig dimensions.");
  }

  return {
    offsetXIn,
    offsetYIn,
  };
}

function validateDimensions(dimensions: JigDimensions) {
  const numericValues: Array<[string, number]> = [
    ["laserBedWidthIn", dimensions.laserBedWidthIn],
    ["laserBedHeightIn", dimensions.laserBedHeightIn],
    ["jigWidthIn", dimensions.jigWidthIn],
    ["jigHeightIn", dimensions.jigHeightIn],
    ["cardWidthIn", dimensions.cardWidthIn],
    ["cardHeightIn", dimensions.cardHeightIn],
    ["toleranceIn", dimensions.toleranceIn],
  ];

  for (const [key, value] of numericValues) {
    if (!Number.isFinite(value)) {
      throw new Error(`Invalid numeric value for ${key}.`);
    }
  }

  if (dimensions.laserBedWidthIn <= 0 || dimensions.laserBedHeightIn <= 0) {
    throw new Error("Laser bed dimensions must be greater than 0.");
  }

  if (dimensions.jigWidthIn <= 0 || dimensions.jigHeightIn <= 0) {
    throw new Error("Jig dimensions must be greater than 0.");
  }

  if (dimensions.cardWidthIn <= 0 || dimensions.cardHeightIn <= 0) {
    throw new Error("Card dimensions must be greater than 0.");
  }

  if (dimensions.toleranceIn < 0) {
    throw new Error("Tolerance cannot be negative.");
  }
}
