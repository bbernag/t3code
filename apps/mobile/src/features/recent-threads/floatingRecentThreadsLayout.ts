import type { EdgeInsets } from "react-native-safe-area-context";

import type { RecentThreadBubblePosition } from "../../persistence/imperative";
import { DEFAULT_RECENT_THREAD_BUBBLE_POSITION } from "./recentThreads";

export const FLOATING_CHAT_BUBBLE_SIZE = 48;
export const FLOATING_CHAT_BUBBLE_TOUCH_SIZE = 56;
export const FLOATING_CHAT_BUBBLE_TOUCH_INSET =
  (FLOATING_CHAT_BUBBLE_TOUCH_SIZE - FLOATING_CHAT_BUBBLE_SIZE) / 2;
export const FLOATING_CHAT_SCREEN_MARGIN = 12;
export const FLOATING_CHAT_MENU_GAP = 10;
export const FLOATING_CHAT_MENU_MAX_WIDTH = 320;
const FLOATING_CHAT_RELEASE_PROJECTION_SECONDS = 0.1;
const FLOATING_CHAT_MENU_HEADER_HEIGHT = 48;
const FLOATING_CHAT_MENU_ROW_HEIGHT = 64;

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

export type FloatingChatMenuLayout = {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly maxHeight: number;
  readonly opensBelow: boolean;
};

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
}): FloatingChatMenuLayout {
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
  const spaceAbove = Math.max(0, input.point.y - FLOATING_CHAT_MENU_GAP - safeTop);
  const spaceBelow = Math.max(
    0,
    safeBottom - (input.point.y + FLOATING_CHAT_BUBBLE_SIZE + FLOATING_CHAT_MENU_GAP),
  );
  const opensBelow = spaceBelow >= Math.min(input.estimatedHeight, 220) || spaceBelow > spaceAbove;
  const availableHeight = opensBelow ? spaceBelow : spaceAbove;
  const maxHeight = Math.min(input.estimatedHeight, availableHeight);
  const top = opensBelow
    ? input.point.y + FLOATING_CHAT_BUBBLE_SIZE + FLOATING_CHAT_MENU_GAP
    : input.point.y - FLOATING_CHAT_MENU_GAP - maxHeight;

  return { left, top, width, maxHeight, opensBelow };
}
