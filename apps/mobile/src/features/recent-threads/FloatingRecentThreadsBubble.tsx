import * as Haptics from "expo-haptics";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import {
  BackHandler,
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  View,
  type AccessibilityActionEvent,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { useKeyboardContext } from "react-native-keyboard-controller";
import Animated, {
  cancelAnimation,
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
import type {
  RecentThreadBubbleEntry,
  RecentThreadBubblePosition,
} from "../../persistence/imperative";
import {
  FLOATING_CHAT_BUBBLE_SIZE,
  FLOATING_CHAT_BUBBLE_TOUCH_INSET,
  FLOATING_CHAT_BUBBLE_TOUCH_SIZE,
  clampFloatingChatValue,
  estimateFloatingChatMenuHeight,
  normalizeFloatingChatPoint,
  projectFloatingChatRelease,
  resolveFloatingChatBounds,
  resolveFloatingChatMenuLayout,
  resolveFloatingChatPoint,
} from "./floatingRecentThreadsLayout";
import { RecentThreadsBubbleMenu } from "./RecentThreadsBubbleMenu";

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
const ACCESSIBILITY_NUDGE = 52;

type Props = {
  readonly height: number;
  readonly position: RecentThreadBubblePosition | null;
  readonly threads: ReadonlyArray<RecentThreadBubbleEntry>;
  readonly width: number;
  readonly onClear: () => void;
  readonly onPositionChange: (position: RecentThreadBubblePosition) => void;
  readonly onResetPosition: () => void;
  readonly onSelectThread: (thread: RecentThreadBubbleEntry) => void;
};

function fireSelectionHaptic() {
  void Haptics.selectionAsync().catch(() => undefined);
}

function fireSettleHaptic() {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
}

// The host observes active-shell metadata. Memoization keeps unrelated shell updates from
// re-projecting this portal; Reanimated owns all drag-frame updates independently.
export const FloatingRecentThreadsBubble = memo(function FloatingRecentThreadsBubble(props: Props) {
  const insets = useSafeAreaInsets();
  const { height: keyboardHeight } = useKeyboardContext().reanimated;
  const primaryColor = useThemeColor("--color-primary");
  const primaryForegroundColor = useThemeColor("--color-primary-foreground");
  const primaryShadowColor = useThemeColor("--color-primary-shadow");
  const cardColor = useThemeColor("--color-card");
  const foregroundColor = useThemeColor("--color-foreground");
  const [menuOpen, setMenuOpen] = useState(false);

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
        estimatedHeight: estimateFloatingChatMenuHeight(props.threads.length),
      }),
    [insets, point, props.height, props.threads.length, props.width],
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

  useEffect(() => {
    translateX.value = withSpring(point.x, POSITION_SPRING);
    translateY.value = withSpring(point.y, POSITION_SPRING);
  }, [bounds, point, translateX, translateY]);

  useEffect(() => {
    if (!menuOpen || Platform.OS !== "android") return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      setMenuOpen(false);
      return true;
    });
    return () => subscription.remove();
  }, [menuOpen]);

  const closeMenu = useCallback(() => setMenuOpen(false), []);
  const toggleMenu = useCallback(() => {
    Keyboard.dismiss();
    fireSelectionHaptic();
    setMenuOpen((open) => !open);
  }, []);
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
            FLOATING_CHAT_BUBBLE_TOUCH_INSET,
        },
        { rotateZ: `${tilt.value}deg` },
        { scaleX: stretchX.value * pressedScale.value },
        { scaleY: stretchY.value * pressedScale.value },
      ],
    };
  }, [bounds, keyboardHeight]);

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
        case "resetPosition":
          props.onResetPosition();
          break;
      }
    },
    [moveForAccessibility, props.onResetPosition],
  );

  const handleSelectThread = useCallback(
    (thread: RecentThreadBubbleEntry) => {
      setMenuOpen(false);
      fireSelectionHaptic();
      props.onSelectThread(thread);
    },
    [props.onSelectThread],
  );
  const handleResetPosition = useCallback(() => {
    setMenuOpen(false);
    fireSelectionHaptic();
    props.onResetPosition();
  }, [props.onResetPosition]);
  const handleClear = useCallback(() => {
    setMenuOpen(false);
    fireSelectionHaptic();
    props.onClear();
  }, [props.onClear]);

  return (
    <OverlayPortal>
      <View pointerEvents="box-none" style={styles.portalRoot}>
        {menuOpen ? (
          <Pressable
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            onPress={closeMenu}
            style={styles.backdrop}
          />
        ) : null}
        {menuOpen ? (
          <RecentThreadsBubbleMenu
            layout={menuLayout}
            threads={props.threads}
            onClear={handleClear}
            onClose={closeMenu}
            onResetPosition={handleResetPosition}
            onSelectThread={handleSelectThread}
          />
        ) : null}
        <GestureDetector gesture={gesture}>
          <Animated.View
            accessible
            accessibilityActions={[
              { name: "moveLeft", label: "Move left" },
              { name: "moveRight", label: "Move right" },
              { name: "moveUp", label: "Move up" },
              { name: "moveDown", label: "Move down" },
              { name: "resetPosition", label: "Reset position" },
            ]}
            accessibilityHint="Double tap to show recent chats, or drag to move"
            accessibilityLabel={`${props.threads.length} recent chat${props.threads.length === 1 ? "" : "s"}`}
            accessibilityRole="button"
            accessibilityState={{ expanded: menuOpen }}
            onAccessibilityAction={handleAccessibilityAction}
            onAccessibilityTap={toggleMenu}
            style={[styles.touchTarget, bubbleStyle]}
          >
            <View
              style={[
                styles.bubble,
                {
                  backgroundColor: primaryColor,
                  shadowColor: primaryShadowColor,
                },
              ]}
            >
              <SymbolView
                name="text.bubble"
                size={22}
                tintColor={primaryForegroundColor}
                type="monochrome"
                weight="semibold"
              />
              <View
                pointerEvents="none"
                style={[
                  styles.badge,
                  {
                    backgroundColor: cardColor,
                    borderColor: primaryColor,
                  },
                ]}
              >
                <Text style={[styles.badgeText, { color: foregroundColor }]}>
                  {props.threads.length}
                </Text>
              </View>
            </View>
          </Animated.View>
        </GestureDetector>
      </View>
    </OverlayPortal>
  );
});

const styles = StyleSheet.create({
  portalRoot: {
    ...StyleSheet.absoluteFill,
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    zIndex: 1,
  },
  touchTarget: {
    alignItems: "center",
    height: FLOATING_CHAT_BUBBLE_TOUCH_SIZE,
    justifyContent: "center",
    left: 0,
    position: "absolute",
    top: 0,
    width: FLOATING_CHAT_BUBBLE_TOUCH_SIZE,
    zIndex: 3,
  },
  bubble: {
    alignItems: "center",
    borderRadius: FLOATING_CHAT_BUBBLE_SIZE / 2,
    elevation: 10,
    height: FLOATING_CHAT_BUBBLE_SIZE,
    justifyContent: "center",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.24,
    shadowRadius: 14,
    width: FLOATING_CHAT_BUBBLE_SIZE,
  },
  badge: {
    alignItems: "center",
    borderRadius: 9,
    borderWidth: 2,
    height: 18,
    justifyContent: "center",
    minWidth: 18,
    paddingHorizontal: 2,
    position: "absolute",
    right: -2,
    top: -3,
  },
  badgeText: {
    fontFamily: "DMSans_700Bold",
    fontSize: 10,
    lineHeight: 12,
  },
});
