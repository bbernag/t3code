import { describe, expect, it } from "vite-plus/test";

import {
  estimateFloatingChatMenuHeight,
  FLOATING_CHAT_BUBBLE_SIZE,
  FLOATING_CHAT_BUBBLE_TOUCH_SIZE,
  normalizeFloatingChatPoint,
  projectFloatingChatRelease,
  resolveFloatingChatBounds,
  resolveFloatingChatMenuLayout,
  resolveFloatingChatPoint,
} from "./floatingRecentThreadsLayout";

const insets = { top: 44, right: 0, bottom: 34, left: 0 };

describe("floating recent chats layout", () => {
  it("keeps a smaller visual bubble inside an accessible interaction target", () => {
    expect(FLOATING_CHAT_BUBBLE_SIZE).toBe(48);
    expect(FLOATING_CHAT_BUBBLE_TOUCH_SIZE).toBe(56);
  });

  it("estimates the bounded menu from its visible rows", () => {
    expect(estimateFloatingChatMenuHeight(5)).toBe(420);
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
    });

    expect(bounds.minX).toBe(56);
    expect(bounds.maxX).toBe(740);
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
    });
    const lower = resolveFloatingChatMenuLayout({
      point: { x: 20, y: 730 },
      viewportWidth: 390,
      viewportHeight: 844,
      insets,
      estimatedHeight: 360,
    });

    expect(upper.opensBelow).toBe(true);
    expect(upper.left + upper.width).toBeLessThanOrEqual(378);
    expect(lower.opensBelow).toBe(false);
    expect(lower.top).toBeGreaterThanOrEqual(insets.top + 12);
  });
});
