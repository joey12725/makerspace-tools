import { describe, expect, it } from "vitest";
import {
  calculateAxisLayout,
  calculateJigLayout,
  MIN_EDGE_MARGIN_IN,
  MIN_WALL_THICKNESS_IN,
} from "@/lib/layout";
import { DEFAULT_DIMENSIONS } from "@/lib/config";

describe("calculateAxisLayout", () => {
  it("drops card count when edge margin would be below 1/8 inch", () => {
    const axis = calculateAxisLayout({
      totalIn: 12,
      pocketIn: 2.165,
    });

    expect(axis.count).toBe(4);
    expect(axis.wallThicknessIn).toBeGreaterThanOrEqual(MIN_WALL_THICKNESS_IN);
    expect(axis.edgeMarginIn).toBeGreaterThanOrEqual(MIN_EDGE_MARGIN_IN);
  });

  it("throws when no valid card count can satisfy minimum wall and edge constraints", () => {
    expect(() =>
      calculateAxisLayout({
        totalIn: 0.2,
        pocketIn: 0.15,
      }),
    ).toThrow(/Unable to satisfy minimum wall and edge constraints/);
  });
});

describe("calculateJigLayout", () => {
  it("uses card+tolerance pocket dimensions in layout and wall calculations", () => {
    const dimensions = {
      ...DEFAULT_DIMENSIONS,
      jigWidthIn: 10,
      jigHeightIn: 4.5,
      cardWidthIn: 3,
      cardHeightIn: 1,
      toleranceIn: 0.2,
    };

    const layout = calculateJigLayout(dimensions);

    expect(layout.pocketWidthIn).toBeCloseTo(3.2, 6);
    expect(layout.pocketHeightIn).toBeCloseTo(1.2, 6);

    const expectedWallX =
      (dimensions.jigWidthIn - layout.columns * (dimensions.cardWidthIn + dimensions.toleranceIn)) /
      layout.columns;

    expect(layout.axisX.wallThicknessIn).toBeCloseTo(expectedWallX, 6);
    expect(layout.axisX.wallThicknessIn).toBeGreaterThanOrEqual(MIN_WALL_THICKNESS_IN);
    expect(layout.axisX.edgeMarginIn).toBeGreaterThanOrEqual(MIN_EDGE_MARGIN_IN);
  });

  it("reduces card capacity as tolerance increases", () => {
    const withoutTolerance = calculateJigLayout({
      ...DEFAULT_DIMENSIONS,
      jigWidthIn: 10,
      jigHeightIn: 6,
      cardWidthIn: 3,
      cardHeightIn: 2,
      toleranceIn: 0,
    });

    const withTolerance = calculateJigLayout({
      ...DEFAULT_DIMENSIONS,
      jigWidthIn: 10,
      jigHeightIn: 6,
      cardWidthIn: 3,
      cardHeightIn: 2,
      toleranceIn: 0.2,
    });

    expect(withTolerance.columns).toBeLessThan(withoutTolerance.columns);
    expect(withTolerance.rows).toBeLessThanOrEqual(withoutTolerance.rows);
  });

  it("maximizes cards while reducing each axis independently when constraints are violated", () => {
    const dimensions = {
      ...DEFAULT_DIMENSIONS,
      jigWidthIn: 7.1,
      jigHeightIn: 4.6,
      cardWidthIn: 2.3,
      cardHeightIn: 1.4,
      toleranceIn: 0,
    };

    const maxColumnsIgnoringSpacing = Math.floor(dimensions.jigWidthIn / dimensions.cardWidthIn);
    const maxRowsIgnoringSpacing = Math.floor(dimensions.jigHeightIn / dimensions.cardHeightIn);

    const layout = calculateJigLayout(dimensions);

    expect(layout.columns).toBeLessThan(maxColumnsIgnoringSpacing);
    expect(layout.rows).toBeLessThan(maxRowsIgnoringSpacing);
    expect(layout.axisX.wallThicknessIn).toBeGreaterThanOrEqual(MIN_WALL_THICKNESS_IN);
    expect(layout.axisX.edgeMarginIn).toBeGreaterThanOrEqual(MIN_EDGE_MARGIN_IN);
    expect(layout.axisY.wallThicknessIn).toBeGreaterThanOrEqual(MIN_WALL_THICKNESS_IN);
    expect(layout.axisY.edgeMarginIn).toBeGreaterThanOrEqual(MIN_EDGE_MARGIN_IN);
  });
});
