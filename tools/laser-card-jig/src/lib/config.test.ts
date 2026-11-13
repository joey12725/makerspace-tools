import { describe, expect, it } from "vitest";
import {
  buildPersistedConfig,
  DEFAULT_DIMENSIONS,
  DEFAULT_IMAGE_PROCESSING,
  parsePersistedConfig,
} from "@/lib/config";

describe("config round trip", () => {
  it("restores every saved setting", () => {
    const dimensions = { ...DEFAULT_DIMENSIONS, cardWidthIn: 3.5, cardHeightIn: 2, toleranceIn: 0.02 };
    const imageProcessing = { ...DEFAULT_IMAGE_PROCESSING, grayscale: false, blackPoint: 40, whitePoint: 210 };

    const saved = JSON.stringify(buildPersistedConfig(dimensions, imageProcessing));
    const restored = parsePersistedConfig(saved);

    expect(restored.dimensions).toEqual(dimensions);
    expect(restored.imageProcessing.grayscale).toBe(false);
    expect(restored.imageProcessing.blackPoint).toBe(40);
    expect(restored.imageProcessing.whitePoint).toBe(210);
  });

  it("fills missing or malformed fields with defaults", () => {
    const restored = parsePersistedConfig(JSON.stringify({ dimensions: { cardWidthIn: "wide" } }));
    expect(restored.dimensions).toEqual(DEFAULT_DIMENSIONS);
  });

  it("rejects files that are not JSON", () => {
    expect(() => parsePersistedConfig("not json")).toThrow(/not valid JSON/);
  });
});
