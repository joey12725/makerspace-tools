import { describe, expect, it } from "vitest";
import { DEFAULT_DIMENSIONS } from "@/lib/config";
import { calculateJigLayout } from "@/lib/layout";
import { buildJigStlBlob } from "@/lib/stl";

const MM_PER_IN = 25.4;

async function readBinaryStl(blob: Blob) {
  const view = new DataView(await blob.arrayBuffer());
  const triangles = view.getUint32(80, true);
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];

  for (let t = 0; t < triangles; t += 1) {
    const base = 84 + t * 50 + 12; // skip the normal vector
    for (let v = 0; v < 3; v += 1) {
      for (let axis = 0; axis < 3; axis += 1) {
        const value = view.getFloat32(base + v * 12 + axis * 4, true);
        min[axis] = Math.min(min[axis], value);
        max[axis] = Math.max(max[axis], value);
      }
    }
  }

  return { byteLength: view.byteLength, triangles, min, max };
}

describe("buildJigStlBlob", () => {
  it("writes a well-formed binary STL the size of the jig", async () => {
    const layout = calculateJigLayout(DEFAULT_DIMENSIONS);
    const stl = await readBinaryStl(buildJigStlBlob(layout, DEFAULT_DIMENSIONS));

    expect(stl.triangles).toBeGreaterThan(12);
    expect(stl.byteLength).toBe(84 + stl.triangles * 50);

    const size = stl.max.map((value, axis) => value - stl.min[axis]);
    expect(size[0]).toBeCloseTo(DEFAULT_DIMENSIONS.jigWidthIn * MM_PER_IN, 2);
    expect(size[1]).toBeCloseTo(DEFAULT_DIMENSIONS.jigHeightIn * MM_PER_IN, 2);
    // 1/8" base plate plus a 1/8" pocket grid.
    expect(size[2]).toBeCloseTo(0.25 * MM_PER_IN, 2);
    expect(stl.min[2]).toBeCloseTo(0, 5);
  });

  it("adds geometry for every pocket", async () => {
    const one = { ...DEFAULT_DIMENSIONS, jigWidthIn: 4, jigHeightIn: 3, laserBedWidthIn: 4, laserBedHeightIn: 3 };
    const small = await readBinaryStl(buildJigStlBlob(calculateJigLayout(one), one));
    const full = await readBinaryStl(buildJigStlBlob(calculateJigLayout(DEFAULT_DIMENSIONS), DEFAULT_DIMENSIONS));

    expect(calculateJigLayout(one).slots).toHaveLength(1);
    expect(full.triangles).toBeGreaterThan(small.triangles);
  });
});
