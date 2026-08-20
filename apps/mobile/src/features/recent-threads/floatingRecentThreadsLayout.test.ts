import { describe, expect, it } from "vite-plus/test";

import {
  estimateFloatingChatMenuHeight,
  FLOATING_CHAT_BUBBLE_SIZE,
  FLOATING_CHAT_BUBBLE_TOUCH_SIZE,
  FLOATING_CHAT_DISMISS_CAPTURE_RADIUS,
  FLOATING_CHAT_DISMISS_TARGET_MARGIN,
  FLOATING_CHAT_DISMISS_TARGET_SIZE,
  FLOATING_CHAT_MENU_GAP,
  isFloatingChatDismissCaptured,
  normalizeFloatingChatPoint,
  projectFloatingChatRelease,
  resolveFloatingChatBounds,
  resolveFloatingChatDismissTarget,
  resolveFloatingChatMenuLayout,
  resolveFloatingChatMenuScaleOrigin,
  resolveFloatingChatPoint,
} from "./floatingRecentThreadsLayout";

const insets = { top: 44, right: 0, bottom: 34, left: 0 };

describe("floating recent chats layout", () => {
  it("keeps a smaller visual bubble inside an accessible interaction target", () => {
    expect(FLOATING_CHAT_BUBBLE_SIZE).toBe(42);
    expect(FLOATING_CHAT_BUBBLE_TOUCH_SIZE).toBe(56);
  });

  it("estimates the bounded menu from its visible rows", () => {
    expect(estimateFloatingChatMenuHeight(5)).toBe(322);
  });

  it("round-trips docked positions inside safe bounds", () => {
    const bounds = resolveFloatingChatBounds({ width: 390, height: 844, insets });

    for (const position of [
      { x: 0, y: 0.41 },
      { x: 1, y: 0.73 },
    ]) {
      const roundTrip = normalizeFloatingChatPoint(
        resolveFloatingChatPoint(position, bounds),
        bounds,
      );
      expect(roundTrip.x).toBe(position.x);
      expect(roundTrip.y).toBeCloseTo(position.y);
    }
  });

  it("resolves older middle-screen positions to the nearest side", () => {
    const bounds = resolveFloatingChatBounds({ width: 390, height: 844, insets });
    const midpointX = bounds.minX + (bounds.maxX - bounds.minX) / 2;

    expect(resolveFloatingChatPoint({ x: 0.49, y: 0.4 }, bounds).x).toBe(bounds.minX);
    expect(resolveFloatingChatPoint({ x: 0.5, y: 0.4 }, bounds).x).toBe(bounds.maxX);
    expect(normalizeFloatingChatPoint({ x: midpointX - 1, y: bounds.minY }, bounds).x).toBe(0);
    expect(normalizeFloatingChatPoint({ x: midpointX, y: bounds.minY }, bounds).x).toBe(1);
  });

  it("keeps valid bounds on a tiny viewport", () => {
    const bounds = resolveFloatingChatBounds({ width: 40, height: 80, insets });

    expect(bounds.maxX).toBe(bounds.minX);
    expect(bounds.maxY).toBe(bounds.minY);
    expect(bounds.maxPresentationX).toBe(bounds.minPresentationX);
    expect(normalizeFloatingChatPoint({ x: 500, y: 500 }, bounds)).toEqual({ x: 0, y: 0 });
  });

  it("respects horizontal safe areas in landscape", () => {
    const landscapeInsets = { top: 0, right: 44, bottom: 21, left: 44 };
    const bounds = resolveFloatingChatBounds({
      width: 844,
      height: 390,
      insets: landscapeInsets,
    });
    const menu = resolveFloatingChatMenuLayout({
      point: { x: bounds.minX, y: 80 },
      viewportWidth: 844,
      viewportHeight: 390,
      insets: landscapeInsets,
      estimatedHeight: 220,
      gap: FLOATING_CHAT_MENU_GAP,
    });

    expect(bounds.minX).toBe(56);
    expect(bounds.maxX).toBe(746);
    expect(menu.left).toBeGreaterThanOrEqual(56);
    expect(menu.left + menu.width).toBeLessThanOrEqual(788);
  });

  it("uses projected horizontal momentum to select a side", () => {
    const bounds = resolveFloatingChatBounds({ width: 390, height: 844, insets });

    expect(
      projectFloatingChatRelease({
        point: { x: bounds.maxX, y: 300 },
        velocityX: -4_000,
        velocityY: 0,
        bounds,
      }).x,
    ).toBe(bounds.minX);
    expect(
      projectFloatingChatRelease({
        point: { x: bounds.minX, y: 300 },
        velocityX: 4_000,
        velocityY: 0,
        bounds,
      }).x,
    ).toBe(bounds.maxX);
  });

  it("selects the right side at the projected midpoint", () => {
    const bounds = resolveFloatingChatBounds({ width: 390, height: 844, insets });
    const midpointX = bounds.minX + (bounds.maxX - bounds.minX) / 2;

    expect(
      projectFloatingChatRelease({
        point: { x: midpointX, y: 300 },
        velocityX: 0,
        velocityY: 0,
        bounds,
      }).x,
    ).toBe(bounds.maxX);
  });

  it("projects vertical velocity but clamps around safe areas and the keyboard", () => {
    const bounds = resolveFloatingChatBounds({ width: 390, height: 844, insets });

    expect(
      projectFloatingChatRelease({
        point: { x: 300, y: 500 },
        velocityX: 4_000,
        velocityY: 4_000,
        keyboardHeight: 280,
        bounds,
      }),
    ).toEqual({ x: bounds.maxX, y: bounds.maxY - 280 });

    expect(
      projectFloatingChatRelease({
        point: { x: 40, y: 200 },
        velocityX: 0,
        velocityY: -4_000,
        bounds,
      }),
    ).toEqual({ x: bounds.minX, y: bounds.minY });
  });

  it("keeps the dropdown on screen above and below the bubble", () => {
    const upper = resolveFloatingChatMenuLayout({
      point: { x: 310, y: 80 },
      viewportWidth: 390,
      viewportHeight: 844,
      insets,
      estimatedHeight: 360,
      gap: FLOATING_CHAT_MENU_GAP,
    });
    const lower = resolveFloatingChatMenuLayout({
      point: { x: 20, y: 730 },
      viewportWidth: 390,
      viewportHeight: 844,
      insets,
      estimatedHeight: 360,
      gap: FLOATING_CHAT_MENU_GAP,
    });

    expect(upper.opensBelow).toBe(true);
    expect(upper.anchorX).toBe(299);
    expect(upper.left + upper.width).toBeLessThanOrEqual(378);
    expect(upper.gap).toBe(FLOATING_CHAT_MENU_GAP);
    expect(upper.top).toBe(80 + FLOATING_CHAT_BUBBLE_SIZE + FLOATING_CHAT_MENU_GAP);
    expect(upper.bottom).toBeUndefined();
    expect(lower.opensBelow).toBe(false);
    expect(lower.anchorX).toBe(29);
    expect(lower.top).toBeUndefined();
    expect(lower.gap).toBe(FLOATING_CHAT_MENU_GAP);
    expect(lower.bottom).toBe(844 - (730 - FLOATING_CHAT_MENU_GAP));
  });

  it("keeps below-menu spacing independent of row count and estimated height", () => {
    for (const x of [20, 310]) {
      for (const threadCount of [1, 3, 5]) {
        const point = { x, y: 80 };
        const menu = resolveFloatingChatMenuLayout({
          point,
          viewportWidth: 390,
          viewportHeight: 844,
          insets,
          estimatedHeight: estimateFloatingChatMenuHeight(threadCount),
          gap: FLOATING_CHAT_MENU_GAP,
        });

        expect(menu.opensBelow).toBe(true);
        if (!menu.opensBelow) throw new Error("Expected menu to open below the bubble");
        expect(menu.gap).toBe(FLOATING_CHAT_MENU_GAP);
        expect(menu.top - (point.y + FLOATING_CHAT_BUBBLE_SIZE)).toBe(FLOATING_CHAT_MENU_GAP);
      }
    }
  });

  it("keeps above-menu spacing independent of row count and estimated height", () => {
    for (const x of [20, 310]) {
      for (const threadCount of [1, 3, 5]) {
        const menu = resolveFloatingChatMenuLayout({
          point: { x, y: 730 },
          viewportWidth: 390,
          viewportHeight: 844,
          insets,
          estimatedHeight: estimateFloatingChatMenuHeight(threadCount),
          gap: FLOATING_CHAT_MENU_GAP,
        });

        expect(menu.opensBelow).toBe(false);
        if (menu.opensBelow) throw new Error("Expected menu to open above the bubble");
        expect(menu.gap).toBe(FLOATING_CHAT_MENU_GAP);
        expect(menu.bottom).toBe(844 - (730 - FLOATING_CHAT_MENU_GAP));
        expect(730 - (844 - menu.bottom)).toBe(FLOATING_CHAT_MENU_GAP);
      }
    }
  });

  it("paints the same bubble-to-menu gap in both directions", () => {
    expect(FLOATING_CHAT_MENU_GAP).toBe(7);

    const upperBubble = resolveFloatingChatMenuLayout({
      point: { x: 310, y: 80 },
      viewportWidth: 390,
      viewportHeight: 844,
      insets,
      estimatedHeight: estimateFloatingChatMenuHeight(3),
      gap: FLOATING_CHAT_MENU_GAP,
    });
    const lowerBubble = resolveFloatingChatMenuLayout({
      point: { x: 310, y: 730 },
      viewportWidth: 390,
      viewportHeight: 844,
      insets,
      estimatedHeight: estimateFloatingChatMenuHeight(3),
      gap: FLOATING_CHAT_MENU_GAP,
    });

    expect(upperBubble.opensBelow).toBe(true);
    if (!upperBubble.opensBelow) throw new Error("Expected menu to open below the bubble");
    expect(lowerBubble.opensBelow).toBe(false);
    if (lowerBubble.opensBelow) throw new Error("Expected menu to open above the bubble");

    const paintedGapBelowBubble = upperBubble.top - (80 + FLOATING_CHAT_BUBBLE_SIZE);
    const paintedGapAboveBubble = 730 - (844 - lowerBubble.bottom);
    expect(paintedGapBelowBubble).toBe(paintedGapAboveBubble);
  });

  it("anchors the dismiss target above the safe area and the keyboard", () => {
    const resting = resolveFloatingChatDismissTarget({
      viewportWidth: 390,
      viewportHeight: 844,
      insets,
    });
    const lifted = resolveFloatingChatDismissTarget({
      viewportWidth: 390,
      viewportHeight: 844,
      insets,
      keyboardHeight: 280,
    });

    expect(resting.x).toBe(195);
    expect(resting.y).toBe(
      844 -
        insets.bottom -
        FLOATING_CHAT_DISMISS_TARGET_MARGIN -
        FLOATING_CHAT_DISMISS_TARGET_SIZE / 2,
    );
    expect(lifted.y).toBe(
      844 - 280 - FLOATING_CHAT_DISMISS_TARGET_MARGIN - FLOATING_CHAT_DISMISS_TARGET_SIZE / 2,
    );
  });

  it("captures the bubble by its center inside the dismiss radius", () => {
    const target = { x: 195, y: 758 };
    const centered = {
      x: target.x - FLOATING_CHAT_BUBBLE_SIZE / 2,
      y: target.y - FLOATING_CHAT_BUBBLE_SIZE / 2,
    };

    expect(isFloatingChatDismissCaptured({ point: centered, target })).toBe(true);
    expect(
      isFloatingChatDismissCaptured({
        point: { ...centered, y: centered.y - FLOATING_CHAT_DISMISS_CAPTURE_RADIUS },
        target,
      }),
    ).toBe(true);
    expect(
      isFloatingChatDismissCaptured({
        point: { ...centered, y: centered.y - FLOATING_CHAT_DISMISS_CAPTURE_RADIUS - 1 },
        target,
      }),
    ).toBe(false);
  });

  it("pins the menu scale pivot against the nearest edge under center-based transforms", () => {
    const upper = resolveFloatingChatMenuLayout({
      point: { x: 310, y: 80 },
      viewportWidth: 390,
      viewportHeight: 844,
      insets,
      estimatedHeight: 360,
      gap: FLOATING_CHAT_MENU_GAP,
    });
    const lower = resolveFloatingChatMenuLayout({
      point: { x: 20, y: 730 },
      viewportWidth: 390,
      viewportHeight: 844,
      insets,
      estimatedHeight: 360,
      gap: FLOATING_CHAT_MENU_GAP,
    });
    const height = 266;

    const upperOrigin = resolveFloatingChatMenuScaleOrigin({
      anchorX: upper.anchorX,
      height,
      opensBelow: upper.opensBelow,
      width: upper.width,
    });
    const lowerOrigin = resolveFloatingChatMenuScaleOrigin({
      anchorX: lower.anchorX,
      height,
      opensBelow: lower.opensBelow,
      width: lower.width,
    });

    expect(upperOrigin).toEqual({ x: 139, y: -133 });
    expect(lowerOrigin).toEqual({ x: -131, y: 133 });

    // The menu's translate-then-scale transform fixes the point center + offset,
    // which must land on the anchor point of the launcher-adjacent edge.
    expect(upperOrigin.x + upper.width / 2).toBe(upper.anchorX);
    expect(upperOrigin.y + height / 2).toBe(0);
    expect(lowerOrigin.x + lower.width / 2).toBe(lower.anchorX);
    expect(lowerOrigin.y + height / 2).toBe(height);
  });
});
