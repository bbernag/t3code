import type { EdgeInsets } from "react-native-safe-area-context";

import type { RecentThreadBubblePosition } from "../../persistence/imperative";
import { DEFAULT_RECENT_THREAD_BUBBLE_POSITION } from "./recentThreads";

// Painted bubble geometry. The bubble views size themselves from these constants
// so the menu layout math can treat them as ground truth; rem-based utility
// classes render at the app's 14pt rem and would silently drift from them.
export const FLOATING_CHAT_BUBBLE_SIZE = 42;
export const FLOATING_CHAT_BUBBLE_TOUCH_SIZE = 56;
export const FLOATING_CHAT_BUBBLE_TOUCH_INSET =
  (FLOATING_CHAT_BUBBLE_TOUCH_SIZE - FLOATING_CHAT_BUBBLE_SIZE) / 2;
export const FLOATING_CHAT_SCREEN_MARGIN = 12;
export const FLOATING_CHAT_MENU_GAP = 7;
export const FLOATING_CHAT_MENU_MAX_WIDTH = 320;
const FLOATING_CHAT_RELEASE_PROJECTION_SECONDS = 0.1;
// min-h-12 header and min-h-16 rows at the app's 14pt rem.
const FLOATING_CHAT_MENU_HEADER_HEIGHT = 42;
const FLOATING_CHAT_MENU_ROW_HEIGHT = 56;

export type FloatingChatPoint = {
  readonly x: number;
  readonly y: number;
};

export type FloatingChatBounds = {
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
  readonly minPresentationX: number;
  readonly maxPresentationX: number;
};

type FloatingChatMenuLayoutBase = {
  readonly anchorX: number;
  readonly left: number;
  readonly gap: number;
  readonly width: number;
  readonly maxHeight: number;
};

export type FloatingChatMenuLayout = FloatingChatMenuLayoutBase &
  (
    | {
        readonly bottom?: undefined;
        readonly opensBelow: true;
        readonly top: number;
      }
    | {
        readonly bottom: number;
        readonly opensBelow: false;
        readonly top?: undefined;
      }
  );

export function estimateFloatingChatMenuHeight(threadCount: number): number {
  return (
    FLOATING_CHAT_MENU_HEADER_HEIGHT + Math.max(0, threadCount) * FLOATING_CHAT_MENU_ROW_HEIGHT
  );
}

export function clampFloatingChatValue(value: number, min: number, max: number): number {
  "worklet";
  return Math.min(max, Math.max(min, value));
}

export function resolveFloatingChatBounds(input: {
  readonly width: number;
  readonly height: number;
  readonly insets: EdgeInsets;
}): FloatingChatBounds {
  const minPresentationX = input.insets.left;
  const maxPresentationX = Math.max(
    minPresentationX,
    input.width - input.insets.right - FLOATING_CHAT_BUBBLE_SIZE,
  );
  const minPresentationY = input.insets.top;
  const maxPresentationY = Math.max(
    minPresentationY,
    input.height - input.insets.bottom - FLOATING_CHAT_BUBBLE_SIZE,
  );
  const minX = Math.min(maxPresentationX, minPresentationX + FLOATING_CHAT_SCREEN_MARGIN);
  const minY = Math.min(maxPresentationY, minPresentationY + FLOATING_CHAT_SCREEN_MARGIN);
  return {
    minX,
    maxX: Math.max(minX, maxPresentationX - FLOATING_CHAT_SCREEN_MARGIN),
    minY,
    maxY: Math.max(minY, maxPresentationY - FLOATING_CHAT_SCREEN_MARGIN),
    minPresentationX,
    maxPresentationX,
  };
}

export function resolveFloatingChatPoint(
  position: RecentThreadBubblePosition | null,
  bounds: FloatingChatBounds,
): FloatingChatPoint {
  const normalized = position ?? DEFAULT_RECENT_THREAD_BUBBLE_POSITION;
  return {
    x: normalized.x < 0.5 ? bounds.minX : bounds.maxX,
    y: bounds.minY + normalized.y * (bounds.maxY - bounds.minY),
  };
}

export function normalizeFloatingChatPoint(
  point: FloatingChatPoint,
  bounds: FloatingChatBounds,
): RecentThreadBubblePosition {
  "worklet";
  const width = bounds.maxX - bounds.minX;
  const height = bounds.maxY - bounds.minY;
  return {
    x: width <= 0 || point.x < bounds.minX + width / 2 ? 0 : 1,
    y: height <= 0 ? 0 : clampFloatingChatValue((point.y - bounds.minY) / height, 0, 1),
  };
}

export function projectFloatingChatRelease(input: {
  readonly point: FloatingChatPoint;
  readonly velocityX: number;
  readonly velocityY: number;
  readonly bounds: FloatingChatBounds;
  readonly keyboardHeight?: number;
}): FloatingChatPoint {
  "worklet";
  const maxY = Math.max(input.bounds.minY, input.bounds.maxY - Math.abs(input.keyboardHeight ?? 0));
  const projectedX = input.point.x + input.velocityX * FLOATING_CHAT_RELEASE_PROJECTION_SECONDS;
  const midpointX = input.bounds.minX + (input.bounds.maxX - input.bounds.minX) / 2;
  return {
    x: projectedX < midpointX ? input.bounds.minX : input.bounds.maxX,
    y: clampFloatingChatValue(
      input.point.y + input.velocityY * FLOATING_CHAT_RELEASE_PROJECTION_SECONDS,
      input.bounds.minY,
      maxY,
    ),
  };
}

export function resolveFloatingChatMenuLayout(input: {
  readonly point: FloatingChatPoint;
  readonly viewportWidth: number;
  readonly viewportHeight: number;
  readonly insets: EdgeInsets;
  readonly estimatedHeight: number;
  readonly gap: number;
}): FloatingChatMenuLayout {
  // The gap applies verbatim in both directions on both platforms. iOS clips the
  // menu surface shadow (overflow hidden on GlassSurface), so any directional
  // shadow compensation paints as visible asymmetry between the two variants.
  const safeLeft = input.insets.left + FLOATING_CHAT_SCREEN_MARGIN;
  const safeRight = input.viewportWidth - input.insets.right - FLOATING_CHAT_SCREEN_MARGIN;
  const safeTop = input.insets.top + FLOATING_CHAT_SCREEN_MARGIN;
  const safeBottom = input.viewportHeight - input.insets.bottom - FLOATING_CHAT_SCREEN_MARGIN;
  const width = Math.max(0, Math.min(FLOATING_CHAT_MENU_MAX_WIDTH, safeRight - safeLeft));
  const left = clampFloatingChatValue(
    input.point.x + FLOATING_CHAT_BUBBLE_SIZE - width,
    safeLeft,
    Math.max(safeLeft, safeRight - width),
  );
  const spaceAbove = Math.max(0, input.point.y - input.gap - safeTop);
  const spaceBelow = Math.max(
    0,
    safeBottom - (input.point.y + FLOATING_CHAT_BUBBLE_SIZE + input.gap),
  );
  const opensBelow = spaceBelow >= Math.min(input.estimatedHeight, 220) || spaceBelow > spaceAbove;
  const gap = input.gap;
  const availableHeight = opensBelow ? spaceBelow : spaceAbove;
  const maxHeight = Math.min(input.estimatedHeight, availableHeight);
  const anchorX = clampFloatingChatValue(
    input.point.x + FLOATING_CHAT_BUBBLE_SIZE / 2 - left,
    0,
    width,
  );
  const base = { anchorX, gap, left, width, maxHeight };

  return opensBelow
    ? {
        ...base,
        opensBelow: true,
        top: input.point.y + FLOATING_CHAT_BUBBLE_SIZE + gap,
      }
    : {
        ...base,
        bottom: input.viewportHeight - (input.point.y - gap),
        opensBelow: false,
      };
}

// React Native applies a view's transform matrix about the view center, so the
// menu's edge pivot must be expressed as an offset from that center. The menu
// applies translate((1 - scale) * offset) followed by scale, which pins the
// launcher-adjacent edge at (anchorX, top-or-bottom) while scaling.
export function resolveFloatingChatMenuScaleOrigin(input: {
  readonly anchorX: number;
  readonly height: number;
  readonly opensBelow: boolean;
  readonly width: number;
}): { readonly x: number; readonly y: number } {
  return {
    x: input.anchorX - input.width / 2,
    y: input.opensBelow ? -input.height / 2 : input.height / 2,
  };
}
