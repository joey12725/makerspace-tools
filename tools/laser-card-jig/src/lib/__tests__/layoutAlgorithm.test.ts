import { calculateLayout } from '../layoutAlgorithm';

describe('layoutAlgorithm', () => {
  const MIN_WALL = 0.125;

  describe('calculateLayout', () => {
    test('should calculate layout for default dimensions', () => {
      const result = calculateLayout(
        15.0, // jigWidth
        12.0, // jigHeight
        3.346, // cardWidth
        2.165, // cardHeight
        0.02 // cardTolerance
      );

      expect(result.cardsX).toBeGreaterThan(0);
      expect(result.cardsY).toBeGreaterThan(0);
      expect(result.positions.length).toBe(result.cardsX * result.cardsY);
    });

    test('should ensure minimum edge margins', () => {
      const result = calculateLayout(15.0, 12.0, 3.346, 2.165, 0.02);

      expect(result.edgeMarginX).toBeGreaterThanOrEqual(MIN_WALL);
      expect(result.edgeMarginY).toBeGreaterThanOrEqual(MIN_WALL);
    });

    test('should ensure minimum wall thickness between cards', () => {
      const result = calculateLayout(15.0, 12.0, 3.346, 2.165, 0.02);

      if (result.cardsX > 1) {
        expect(result.horizontalGap).toBeGreaterThanOrEqual(MIN_WALL);
      }
      if (result.cardsY > 1) {
        expect(result.verticalGap).toBeGreaterThanOrEqual(MIN_WALL);
      }
    });

    test('should reduce card count when constraints are violated', () => {
      // Intentionally crowd the board
      const crowdedResult = calculateLayout(
        8.0, // smaller jig
        6.0,
        3.346, // large cards
        2.165,
        0.02
      );

      // Should have fewer cards to maintain constraints
      expect(crowdedResult.cardsX).toBeLessThanOrEqual(2);
      expect(crowdedResult.cardsY).toBeLessThanOrEqual(2);
      expect(crowdedResult.edgeMarginX).toBeGreaterThanOrEqual(MIN_WALL);
      expect(crowdedResult.edgeMarginY).toBeGreaterThanOrEqual(MIN_WALL);
    });

    test('should apply card tolerance to pocket dimensions', () => {
      const tolerance = 0.05;
      const result = calculateLayout(15.0, 12.0, 3.0, 2.0, tolerance);

      // The effective card size should be cardWidth + tolerance
      const effectiveCardWidth = 3.0 + tolerance;
      const effectiveCardHeight = 2.0 + tolerance;

      // Calculate what the layout should accommodate
      const totalCardWidth = result.cardsX * effectiveCardWidth;
      const totalCardHeight = result.cardsY * effectiveCardHeight;

      // Total should fit within jig dimensions
      expect(totalCardWidth + result.edgeMarginX * 2 + (result.cardsX - 1) * result.horizontalGap)
        .toBeLessThanOrEqual(15.0 + 0.001); // small epsilon for floating point
      expect(totalCardHeight + result.edgeMarginY * 2 + (result.cardsY - 1) * result.verticalGap)
        .toBeLessThanOrEqual(12.0 + 0.001);
    });

    test('should calculate correct positions for all cards', () => {
      const result = calculateLayout(15.0, 12.0, 3.346, 2.165, 0.02);

      expect(result.positions).toHaveLength(result.cardsX * result.cardsY);

      // Check that positions are within jig bounds
      result.positions.forEach((pos) => {
        expect(pos.x).toBeGreaterThan(0);
        expect(pos.x).toBeLessThan(15.0);
        expect(pos.y).toBeGreaterThan(0);
        expect(pos.y).toBeLessThan(12.0);
      });
    });

    test('should handle single card layouts', () => {
      const result = calculateLayout(
        4.0, // jig only fits one card
        3.0,
        3.346,
        2.165,
        0.02
      );

      expect(result.cardsX).toBe(1);
      expect(result.cardsY).toBe(1);
      expect(result.positions).toHaveLength(1);

      // Single card should still have edge margins
      expect(result.edgeMarginX).toBeGreaterThanOrEqual(MIN_WALL);
      expect(result.edgeMarginY).toBeGreaterThanOrEqual(MIN_WALL);
    });

    test('should prioritize maintaining minimum constraints over maximizing cards', () => {
      const result = calculateLayout(10.0, 8.0, 3.0, 2.5, 0.1);

      // Verify all constraints are met
      expect(result.edgeMarginX).toBeGreaterThanOrEqual(MIN_WALL);
      expect(result.edgeMarginY).toBeGreaterThanOrEqual(MIN_WALL);

      if (result.cardsX > 1) {
        expect(result.horizontalGap).toBeGreaterThanOrEqual(MIN_WALL);
      }
      if (result.cardsY > 1) {
        expect(result.verticalGap).toBeGreaterThanOrEqual(MIN_WALL);
      }
    });

    test('should handle edge case where no cards fit', () => {
      const result = calculateLayout(
        1.0, // too small
        1.0,
        3.346,
        2.165,
        0.02
      );

      // Should gracefully handle this by returning 0 cards
      expect(result.cardsX).toBe(0);
      expect(result.cardsY).toBe(0);
      expect(result.positions).toHaveLength(0);
    });

    test('should distribute gaps evenly across cards', () => {
      const result = calculateLayout(15.0, 12.0, 3.0, 2.0, 0.02);

      if (result.cardsX > 1) {
        // Check that horizontal spacing is consistent
        const positions = result.positions.filter((_, i) => i < result.cardsX); // First row
        for (let i = 1; i < positions.length; i++) {
          const gap = positions[i].x - positions[i - 1].x;
          const expectedGap = 3.02 + result.horizontalGap; // card width + tolerance + gap
          expect(Math.abs(gap - expectedGap)).toBeLessThan(0.001);
        }
      }
    });
  });
});
