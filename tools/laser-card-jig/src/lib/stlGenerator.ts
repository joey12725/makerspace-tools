import { primitives, booleans, transforms } from '@jscad/modeling';
import { serialize } from '@jscad/stl-serializer';
import { LayoutResult } from './layoutAlgorithm';

const { cuboid } = primitives;
const { subtract } = booleans;
const { translate } = transforms;

const BASE_THICKNESS = 0.125; // 1/8 inch
const WALL_HEIGHT = 0.125; // 1/8 inch additional height for walls
const POCKET_DEPTH = 0.125; // 1/8 inch deep pockets

/**
 * Generate an STL blob for the jig
 */
export function generateSTL(
  jigWidth: number,
  jigHeight: number,
  cardWidth: number,
  cardHeight: number,
  cardTolerance: number,
  layout: LayoutResult
): Blob {
  const effectiveCardWidth = cardWidth + cardTolerance;
  const effectiveCardHeight = cardHeight + cardTolerance;

  // Create base plate (1/8" thick)
  let jig = cuboid({
    size: [jigWidth, jigHeight, BASE_THICKNESS],
    center: [jigWidth / 2, jigHeight / 2, BASE_THICKNESS / 2],
  });

  // Add walls by creating a thicker base with pockets subtracted
  const wallBase = cuboid({
    size: [jigWidth, jigHeight, BASE_THICKNESS + WALL_HEIGHT],
    center: [jigWidth / 2, jigHeight / 2, (BASE_THICKNESS + WALL_HEIGHT) / 2],
  });

  // Subtract pockets for each card
  let subtractedJig = wallBase;
  layout.positions.forEach((pos) => {
    const pocket = cuboid({
      size: [effectiveCardWidth, effectiveCardHeight, POCKET_DEPTH],
      center: [pos.x, pos.y, BASE_THICKNESS + POCKET_DEPTH / 2],
    });
    subtractedJig = subtract(subtractedJig, pocket);
  });

  // Serialize to STL
  const rawData = serialize({ binary: true }, subtractedJig);
  return new Blob([rawData], { type: 'model/stl' });
}
