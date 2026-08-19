import * as Haptics from "expo-haptics";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import {
  BackHandler,
  Keyboard,
  Platform,
  Pressable,
  View,
  type AccessibilityActionEvent,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { useKeyboardContext } from "react-native-keyboard-controller";
import Animated, {
  cancelAnimation,
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { scheduleOnRN } from "react-native-worklets";

import { AppText as Text } from "../../components/AppText";
import { SymbolView } from "../../components/AppSymbol";
import { OverlayPortal } from "../../components/OverlayPortal";
import { useThemeColor } from "../../lib/useThemeColor";
import type { RecentThreadBubblePosition } from "../../persistence/imperative";
import {
  FLOATING_CHAT_BUBBLE_SIZE,
  FLOATING_CHAT_BUBBLE_TOUCH_INSET,
  FLOATING_CHAT_BUBBLE_TOUCH_SIZE,
  FLOATING_CHAT_MENU_GAP,
  clampFloatingChatValue,
  estimateFloatingChatMenuHeight,
  normalizeFloatingChatPoint,
  projectFloatingChatRelease,
  resolveFloatingChatBounds,
  resolveFloatingChatMenuLayout,
  resolveFloatingChatPoint,
} from "./floatingRecentThreadsLayout";
import { RecentThreadsBubbleMenu } from "./RecentThreadsBubbleMenu";
import {
  recentThreadsBubbleAccessibilityLabel,
  type RecentThreadBubbleItem,
} from "./recentThreadAttention";
import {
  BubbleMenuPresence,
  closeBubbleMenu,
  toggleBubbleMenu,
} from "./recentThreadsBubbleMenuState";

const POSITION_SPRING = {
  damping: 18,
  mass: 1,
  overshootClamping: false,
  reduceMotion: ReduceMotion.System,
  stiffness: 200,
} as const;
const SHAPE_SPRING = {
  damping: 24,
  mass: 0.7,
  reduceMotion: ReduceMotion.System,
  stiffness: 360,
} as const;
const PRESS_TIMING = {
  duration: 90,
  reduceMotion: ReduceMotion.System,
} as const;
const MENU_CLOSE_TIMING = {
  duration: 140,
  easing: Easing.out(Easing.cubic),
  reduceMotion: ReduceMotion.System,
} as const;
const MENU_BUBBLE_OFFSET = 3;
const MENU_BUBBLE_SCALE_X = 0.05;
const MENU_BUBBLE_SCALE_Y = 0.09;
const ACCESSIBILITY_NUDGE = 52;
const BUBBLE_TOUCH_TARGET_STYLE = {
  height: FLOATING_CHAT_BUBBLE_TOUCH_SIZE,
  width: FLOATING_CHAT_BUBBLE_TOUCH_SIZE,
} as const;
const BUBBLE_CIRCLE_STYLE = {
  height: FLOATING_CHAT_BUBBLE_SIZE,
  width: FLOATING_CHAT_BUBBLE_SIZE,
} as const;

type Props = {
  readonly attentionCount: number;
  readonly height: number;
  readonly items: ReadonlyArray<RecentThreadBubbleItem>;
  readonly position: RecentThreadBubblePosition | null;
  readonly width: number;
  readonly onPositionChange: (position: RecentThreadBubblePosition) => void;
  readonly onSelectThread: (item: RecentThreadBubbleItem) => void;
};

function areBubbleItemsEqual(
  left: ReadonlyArray<RecentThreadBubbleItem>,
  right: ReadonlyArray<RecentThreadBubbleItem>,
): boolean {
  return (
    left === right ||
    (left.length === right.length &&
      left.every((item, index) => {
        const candidate = right[index];
        return (
          candidate !== undefined &&
          item.attentionOccurredAt === candidate.attentionOccurredAt &&
          item.status === candidate.status &&
          item.thread.environmentId === candidate.thread.environmentId &&
          item.thread.threadId === candidate.thread.threadId &&
          item.thread.title === candidate.thread.title &&
          item.thread.projectTitle === candidate.thread.projectTitle
        );
      }))
  );
}

function arePropsEqual(previous: Props, next: Props): boolean {
  return (
    previous.attentionCount === next.attentionCount &&
    previous.height === next.height &&
    areBubbleItemsEqual(previous.items, next.items) &&
    previous.position?.x === next.position?.x &&
    previous.position?.y === next.position?.y &&
    previous.width === next.width &&
    previous.onPositionChange === next.onPositionChange &&
    previous.onSelectThread === next.onSelectThread
  );
}

function fireSelectionHaptic() {
  void Haptics.selectionAsync().catch(() => undefined);
}

function fireSettleHaptic() {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
}

// The host observes bounded shell metadata. Memoization keeps status-equivalent updates from
// re-projecting this portal; Reanimated owns all drag-frame updates independently.
export const FloatingRecentThreadsBubble = memo(function FloatingRecentThreadsBubble(props: Props) {
  const insets = useSafeAreaInsets();
  const { height: keyboardHeight } = useKeyboardContext().reanimated;
  const primaryForegroundColor = useThemeColor("--color-primary-foreground");
  const [menuPresence, setMenuPresence] = useState(BubbleMenuPresence.Closed);
  const menuMounted = menuPresence !== BubbleMenuPresence.Closed;
  const menuOpen = menuPresence === BubbleMenuPresence.Open;

  const bounds = useMemo(
    () =>
      resolveFloatingChatBounds({
        width: props.width,
        height: props.height,
        insets,
      }),
    [insets, props.height, props.width],
  );
  const point = useMemo(
    () => resolveFloatingChatPoint(props.position, bounds),
    [bounds, props.position],
  );
  const menuLayout = useMemo(
    () =>
      resolveFloatingChatMenuLayout({
        point,
        viewportWidth: props.width,
        viewportHeight: props.height,
        insets,
        estimatedHeight: estimateFloatingChatMenuHeight(props.items.length),
        gap: FLOATING_CHAT_MENU_GAP,
      }),
    [insets, point, props.height, props.items.length, props.width],
  );

  const translateX = useSharedValue(point.x);
  const translateY = useSharedValue(point.y);
  const dragStartX = useSharedValue(point.x);
  const dragStartY = useSharedValue(point.y);
  const pressedScale = useSharedValue(1);
  const stretchX = useSharedValue(1);
  const stretchY = useSharedValue(1);
  const tilt = useSharedValue(0);
  const settleVersion = useSharedValue(0);
  const settledAxes = useSharedValue(0);
  const menuProgress = useSharedValue(0);

  useEffect(() => {
    translateX.value = withSpring(point.x, POSITION_SPRING);
    translateY.value = withSpring(point.y, POSITION_SPRING);
  }, [bounds, point, translateX, translateY]);

  const finishMenuClose = useCallback(() => {
    setMenuPresence((current) =>
      current === BubbleMenuPresence.Closing ? BubbleMenuPresence.Closed : current,
    );
  }, []);
  const closeMenu = useCallback(() => {
    setMenuPresence(closeBubbleMenu);
  }, []);
  const toggleMenu = useCallback(() => {
    Keyboard.dismiss();
    fireSelectionHaptic();
    setMenuPresence(toggleBubbleMenu);
  }, []);

  useEffect(() => {
    switch (menuPresence) {
      case BubbleMenuPresence.Closed:
        menuProgress.value = 0;
        break;
      case BubbleMenuPresence.Open:
        menuProgress.value = withSpring(1, SHAPE_SPRING);
        break;
      case BubbleMenuPresence.Closing:
        menuProgress.value = withTiming(0, MENU_CLOSE_TIMING, (finished) => {
          if (finished) scheduleOnRN(finishMenuClose);
        });
        break;
    }
  }, [finishMenuClose, menuPresence, menuProgress]);

  useEffect(() => {
    if (!menuOpen || Platform.OS !== "android") return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      closeMenu();
      return true;
    });
    return () => subscription.remove();
  }, [closeMenu, menuOpen]);
  const toggleMenuAtPosition = useCallback(
    (position: RecentThreadBubblePosition) => {
      props.onPositionChange(position);
      toggleMenu();
    },
    [props.onPositionChange, toggleMenu],
  );
  const commitSettledPosition = useCallback(
    (position: RecentThreadBubblePosition) => {
      fireSettleHaptic();
      props.onPositionChange(position);
    },
    [props.onPositionChange],
  );

  const gesture = useMemo(() => {
    const restoreShape = () => {
      "worklet";
      pressedScale.value = withSpring(1, SHAPE_SPRING);
      stretchX.value = withSpring(1, SHAPE_SPRING);
      stretchY.value = withSpring(1, SHAPE_SPRING);
      tilt.value = withSpring(0, SHAPE_SPRING);
    };

    const pan = Gesture.Pan()
      .minDistance(5)
      .onBegin(() => {
        settleVersion.value += 1;
        cancelAnimation(translateX);
        cancelAnimation(translateY);
        const visibleMaxY = Math.max(bounds.minY, bounds.maxY - Math.abs(keyboardHeight.value));
        translateX.value = clampFloatingChatValue(
          translateX.value,
          bounds.minPresentationX,
          bounds.maxPresentationX,
        );
        translateY.value = clampFloatingChatValue(translateY.value, bounds.minY, visibleMaxY);
        dragStartX.value = translateX.value;
        dragStartY.value = translateY.value;
        pressedScale.value = withTiming(0.96, PRESS_TIMING);
        scheduleOnRN(closeMenu);
      })
      .onUpdate((event) => {
        const visibleMaxY = Math.max(bounds.minY, bounds.maxY - Math.abs(keyboardHeight.value));
        translateX.value = clampFloatingChatValue(
          dragStartX.value + event.translationX,
          bounds.minPresentationX,
          bounds.maxPresentationX,
        );
        translateY.value = clampFloatingChatValue(
          dragStartY.value + event.translationY,
          bounds.minY,
          visibleMaxY,
        );
        const speed = Math.min(1_800, Math.hypot(event.velocityX, event.velocityY));
        stretchX.value = 1 + speed / 18_000;
        stretchY.value = 1 - speed / 28_000;
        tilt.value = clampFloatingChatValue(event.velocityX / 240, -6, 6);
      })
      .onEnd((event) => {
        const target = projectFloatingChatRelease({
          point: { x: translateX.value, y: translateY.value },
          velocityX: event.velocityX,
          velocityY: event.velocityY,
          bounds,
          keyboardHeight: keyboardHeight.value,
        });
        const normalized = normalizeFloatingChatPoint(target, bounds);
        settleVersion.value += 1;
        const version = settleVersion.value;
        settledAxes.value = 0;
        translateX.value = withSpring(
          target.x,
          {
            ...POSITION_SPRING,
            velocity: event.velocityX,
          },
          (finished) => {
            if (!finished || version !== settleVersion.value) return;
            settledAxes.value += 1;
            if (settledAxes.value === 2) {
              scheduleOnRN(commitSettledPosition, normalized);
            }
          },
        );
        translateY.value = withSpring(
          target.y,
          {
            ...POSITION_SPRING,
            velocity: event.velocityY,
          },
          (finished) => {
            if (!finished || version !== settleVersion.value) return;
            settledAxes.value += 1;
            if (settledAxes.value === 2) {
              scheduleOnRN(commitSettledPosition, normalized);
            }
          },
        );
      })
      .onFinalize(restoreShape);

    const tap = Gesture.Tap()
      .maxDistance(8)
      .maxDuration(300)
      .onBegin(() => {
        settleVersion.value += 1;
        cancelAnimation(translateX);
        cancelAnimation(translateY);
        pressedScale.value = withTiming(0.94, PRESS_TIMING);
        stretchX.value = withTiming(1.04, PRESS_TIMING);
        stretchY.value = withTiming(0.97, PRESS_TIMING);
      })
      .onEnd((_event, success) => {
        if (success) {
          const visibleMaxY = Math.max(bounds.minY, bounds.maxY - Math.abs(keyboardHeight.value));
          const target = projectFloatingChatRelease({
            point: {
              x: clampFloatingChatValue(
                translateX.value,
                bounds.minPresentationX,
                bounds.maxPresentationX,
              ),
              y: clampFloatingChatValue(translateY.value, bounds.minY, visibleMaxY),
            },
            velocityX: 0,
            velocityY: 0,
            bounds,
            keyboardHeight: keyboardHeight.value,
          });
          translateX.value = target.x;
          translateY.value = target.y;
          scheduleOnRN(toggleMenuAtPosition, normalizeFloatingChatPoint(target, bounds));
        }
      })
      .onFinalize(restoreShape);

    return Gesture.Race(pan, tap);
  }, [
    bounds,
    closeMenu,
    commitSettledPosition,
    dragStartX,
    dragStartY,
    keyboardHeight,
    pressedScale,
    settledAxes,
    settleVersion,
    stretchX,
    stretchY,
    tilt,
    toggleMenuAtPosition,
    translateX,
    translateY,
  ]);

  const bubbleStyle = useAnimatedStyle(() => {
    const visibleMaxY = Math.max(bounds.minY, bounds.maxY - Math.abs(keyboardHeight.value));
    const boundedMenuProgress = clampFloatingChatValue(menuProgress.value, 0, 1);
    const menuDeformation = 4 * boundedMenuProgress * (1 - boundedMenuProgress);
    const menuDirection = menuLayout.opensBelow ? 1 : -1;
    return {
      transform: [
        {
          translateX:
            clampFloatingChatValue(
              translateX.value,
              bounds.minPresentationX,
              bounds.maxPresentationX,
            ) - FLOATING_CHAT_BUBBLE_TOUCH_INSET,
        },
        {
          translateY:
            clampFloatingChatValue(translateY.value, bounds.minY, visibleMaxY) -
            FLOATING_CHAT_BUBBLE_TOUCH_INSET +
            menuDirection * MENU_BUBBLE_OFFSET * menuDeformation,
        },
        { rotateZ: `${tilt.value}deg` },
        {
          scaleX: stretchX.value * pressedScale.value * (1 - MENU_BUBBLE_SCALE_X * menuDeformation),
        },
        {
          scaleY: stretchY.value * pressedScale.value * (1 + MENU_BUBBLE_SCALE_Y * menuDeformation),
        },
      ],
    };
  }, [bounds, keyboardHeight, menuLayout.opensBelow]);

  const moveForAccessibility = useCallback(
    (horizontalDirection: -1 | 0 | 1, deltaY: number) => {
      const current = resolveFloatingChatPoint(props.position, bounds);
      const target = {
        x:
          horizontalDirection < 0 ? bounds.minX : horizontalDirection > 0 ? bounds.maxX : current.x,
        y: clampFloatingChatValue(current.y + deltaY, bounds.minY, bounds.maxY),
      };
      fireSelectionHaptic();
      props.onPositionChange(normalizeFloatingChatPoint(target, bounds));
    },
    [bounds, props.onPositionChange, props.position],
  );
  const handleAccessibilityAction = useCallback(
    (event: AccessibilityActionEvent) => {
      switch (event.nativeEvent.actionName) {
        case "moveLeft":
          moveForAccessibility(-1, 0);
          break;
        case "moveRight":
          moveForAccessibility(1, 0);
          break;
        case "moveUp":
          moveForAccessibility(0, -ACCESSIBILITY_NUDGE);
          break;
        case "moveDown":
          moveForAccessibility(0, ACCESSIBILITY_NUDGE);
          break;
      }
    },
    [moveForAccessibility],
  );

  const handleSelectThread = useCallback(
    (item: RecentThreadBubbleItem) => {
      closeMenu();
      fireSelectionHaptic();
      props.onSelectThread(item);
    },
    [closeMenu, props.onSelectThread],
  );

  return (
    <OverlayPortal>
      <View className="absolute inset-0" pointerEvents="box-none">
        {menuMounted ? (
          <Pressable
            accessibilityElementsHidden
            className="absolute inset-0"
            importantForAccessibility="no-hide-descendants"
            onPress={closeMenu}
          />
        ) : null}
        {menuMounted ? (
          <View
            accessibilityElementsHidden={!menuOpen}
            className="absolute inset-0"
            collapsable={false}
            importantForAccessibility={menuOpen ? "auto" : "no-hide-descendants"}
            pointerEvents={menuOpen ? "box-none" : "none"}
            style={{ alignItems: "flex-start" }}
          >
            <RecentThreadsBubbleMenu
              items={props.items}
              layout={menuLayout}
              progress={menuProgress}
              onClose={closeMenu}
              onSelectThread={handleSelectThread}
            />
          </View>
        ) : null}
        <View collapsable={false} className="absolute inset-0 z-[1]" pointerEvents="box-none">
          <GestureDetector gesture={gesture}>
            <Animated.View
              accessible
              accessibilityActions={[
                { name: "moveLeft", label: "Move left" },
                { name: "moveRight", label: "Move right" },
                { name: "moveUp", label: "Move up" },
                { name: "moveDown", label: "Move down" },
              ]}
              accessibilityHint="Double tap to show recent chats, or drag to move"
              accessibilityLabel={recentThreadsBubbleAccessibilityLabel(props.attentionCount)}
              accessibilityRole="button"
              accessibilityState={{ expanded: menuOpen }}
              className="absolute left-0 top-0 items-center justify-center"
              onAccessibilityAction={handleAccessibilityAction}
              onAccessibilityTap={toggleMenu}
              style={[BUBBLE_TOUCH_TARGET_STYLE, bubbleStyle]}
            >
              <View
                className="items-center justify-center rounded-full bg-primary shadow-lg"
                style={BUBBLE_CIRCLE_STYLE}
              >
                <SymbolView
                  name="text.bubble"
                  size={22}
                  tintColor={primaryForegroundColor}
                  type="monochrome"
                  weight="semibold"
                />
                {props.attentionCount > 0 ? (
                  <View
                    className="absolute -right-0.5 -top-[3px] h-[18px] min-w-[18px] items-center justify-center rounded-full border-2 border-primary bg-card px-0.5"
                    pointerEvents="none"
                  >
                    <Text className="text-[10px] font-t3-bold leading-3 text-foreground">
                      {props.attentionCount}
                    </Text>
                  </View>
                ) : null}
              </View>
            </Animated.View>
          </GestureDetector>
        </View>
      </View>
    </OverlayPortal>
  );
}, arePropsEqual);
