export interface LayoutResult {
  cardsX: number;
  cardsY: number;
  horizontalGap: number;
  verticalGap: number;
  edgeMarginX: number;
  edgeMarginY: number;
  positions: Array<{ x: number; y: number }>;
}

const MIN_WALL = 0.125; // 1/8 inch minimum wall thickness

/**
 * Calculate the optimal layout for cards in the jig
 * Ensures minimum 1/8" walls between cards and 1/8" edge margins
 */
export function calculateLayout(
  jigWidth: number,
  jigHeight: number,
  cardWidth: number,
  cardHeight: number,
  cardTolerance: number
): LayoutResult {
  const effectiveCardWidth = cardWidth + cardTolerance;
  const effectiveCardHeight = cardHeight + cardTolerance;

  // Start with maximum possible cards in each direction
  let cardsX = Math.floor(jigWidth / effectiveCardWidth);
  let cardsY = Math.floor(jigHeight / effectiveCardHeight);

  // Function to check if X direction satisfies constraints
  const meetsXConstraints = (nx: number): boolean => {
    if (nx <= 0) return false;
    const totalCardWidth = nx * effectiveCardWidth;
    const remainingWidth = jigWidth - totalCardWidth;
    const horizontalGap = nx > 1 ? remainingWidth / nx : 0;
    const edgeMarginX = nx > 1 ? horizontalGap / 2 : remainingWidth / 2;
    const wallX = nx > 1 ? horizontalGap : Infinity;
    return edgeMarginX >= MIN_WALL && wallX >= MIN_WALL;
  };

  // Function to check if Y direction satisfies constraints
  const meetsYConstraints = (ny: number): boolean => {
    if (ny <= 0) return false;
    const totalCardHeight = ny * effectiveCardHeight;
    const remainingHeight = jigHeight - totalCardHeight;
    const verticalGap = ny > 1 ? remainingHeight / ny : 0;
    const edgeMarginY = ny > 1 ? verticalGap / 2 : remainingHeight / 2;
    const wallY = ny > 1 ? verticalGap : Infinity;
    return edgeMarginY >= MIN_WALL && wallY >= MIN_WALL;
  };

  // Reduce cardsX until X constraints are met
  while (!meetsXConstraints(cardsX) && cardsX > 0) {
    cardsX--;
  }

  // Reduce cardsY until Y constraints are met
  while (!meetsYConstraints(cardsY) && cardsY > 0) {
    cardsY--;
  }

  // Recalculate final layout values
  const totalCardWidth = cardsX * effectiveCardWidth;
  const totalCardHeight = cardsY * effectiveCardHeight;

  const remainingWidth = jigWidth - totalCardWidth;
  const remainingHeight = jigHeight - totalCardHeight;

  const horizontalGap = cardsX > 1 ? remainingWidth / cardsX : 0;
  const verticalGap = cardsY > 1 ? remainingHeight / cardsY : 0;
  const edgeMarginX = cardsX > 1 ? horizontalGap / 2 : remainingWidth / 2;
  const edgeMarginY = cardsY > 1 ? verticalGap / 2 : remainingHeight / 2;

  // Calculate positions for each card (center of each card slot)
  const positions: Array<{ x: number; y: number }> = [];
  for (let row = 0; row < cardsY; row++) {
    for (let col = 0; col < cardsX; col++) {
      const x = edgeMarginX + col * (effectiveCardWidth + horizontalGap) + effectiveCardWidth / 2;
      const y = edgeMarginY + row * (effectiveCardHeight + verticalGap) + effectiveCardHeight / 2;
      positions.push({ x, y });
    }
  }

  return {
    cardsX,
    cardsY,
    horizontalGap,
    verticalGap,
    edgeMarginX,
    edgeMarginY,
    positions,
  };
}
