import { booleans, primitives } from "@jscad/modeling";
import { serialize } from "@jscad/stl-serializer";
import type { JigDimensions, JigLayout, PocketSlot } from "@/lib/types";

const INCH_TO_MM = 25.4;
const BASE_THICKNESS_IN = 0.125;
const TOP_GRID_THICKNESS_IN = 0.125;
const CSG_EPSILON_MM = 0.01;

const { cuboid } = primitives;
const { subtract, union } = booleans;

function inToMm(valueIn: number): number {
  return valueIn * INCH_TO_MM;
}

function slotCenterInJigSpace(dimensions: JigDimensions, slot: PocketSlot) {
  const xIn = -dimensions.jigWidthIn / 2 + slot.xIn + slot.widthIn / 2;
  const yIn = dimensions.jigHeightIn / 2 - slot.yIn - slot.heightIn / 2;

  return { xIn, yIn };
}

function concatArrayBuffers(buffers: ArrayBuffer[]): ArrayBuffer {
  const totalLength = buffers.reduce((sum, buffer) => sum + buffer.byteLength, 0);
  const out = new Uint8Array(totalLength);

  let offset = 0;
  for (const buffer of buffers) {
    out.set(new Uint8Array(buffer), offset);
    offset += buffer.byteLength;
  }

  return out.buffer;
}

export function buildJigStlBlob(layout: JigLayout, dimensions: JigDimensions): Blob {
  const jigWidthMm = inToMm(dimensions.jigWidthIn);
  const jigHeightMm = inToMm(dimensions.jigHeightIn);
  const baseThicknessMm = inToMm(BASE_THICKNESS_IN);
  const topThicknessMm = inToMm(TOP_GRID_THICKNESS_IN);

  const basePlate = cuboid({
    size: [jigWidthMm, jigHeightMm, baseThicknessMm],
    center: [0, 0, baseThicknessMm / 2],
  });

  const topLayer = cuboid({
    size: [jigWidthMm, jigHeightMm, topThicknessMm],
    center: [0, 0, baseThicknessMm + topThicknessMm / 2],
  });

  const pocketCutouts = layout.slots.map((slot) => {
    const center = slotCenterInJigSpace(dimensions, slot);

    return cuboid({
      size: [
        inToMm(layout.pocketWidthIn),
        inToMm(layout.pocketHeightIn),
        topThicknessMm + CSG_EPSILON_MM,
      ],
      center: [inToMm(center.xIn), inToMm(center.yIn), baseThicknessMm + topThicknessMm / 2],
    });
  });

  const wallGrid = pocketCutouts.length > 0 ? subtract(topLayer, ...pocketCutouts) : topLayer;
  const jigGeometry = union(basePlate, wallGrid);

  const buffers = serialize({ binary: true }, jigGeometry) as ArrayBuffer[];
  const stlBinary = concatArrayBuffers(buffers);

  return new Blob([stlBinary], { type: "model/stl" });
}
