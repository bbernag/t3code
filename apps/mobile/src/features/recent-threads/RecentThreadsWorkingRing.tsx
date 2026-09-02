import { useEffect, useState } from "react";
import { AppState } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import Svg, { Circle } from "react-native-svg";
import { withUniwind } from "uniwind";

import { FLOATING_CHAT_BUBBLE_SIZE } from "./floatingRecentThreadsLayout";

const RING_STROKE_WIDTH = 2;
// The stroke hugs the bubble edge: its inner boundary is the bubble radius.
const RING_SIZE = FLOATING_CHAT_BUBBLE_SIZE + 2 * RING_STROKE_WIDTH;
const RING_RADIUS = (RING_SIZE - RING_STROKE_WIDTH) / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;
const RING_ARC_FRACTION = 0.5;
const RING_ARC_LENGTH = RING_CIRCUMFERENCE * RING_ARC_FRACTION;
const RING_REVOLUTION_MS = 1600;
const RING_OFFSET = -RING_STROKE_WIDTH;
const RING_STYLE = {
  height: RING_SIZE,
  left: RING_OFFSET,
  top: RING_OFFSET,
  width: RING_SIZE,
} as const;
const RING_ORBIT_STYLE = {
  height: RING_SIZE,
  width: RING_SIZE,
} as const;
// Entry grows from just inside the bubble on the same spring as the bubble's
// press bounce; exit shrinks back quickly without a bounce.
const RING_ENTER_SCALE = 0.8;
const RING_ENTER_SPRING = {
  damping: 24,
  mass: 0.7,
  reduceMotion: ReduceMotion.System,
  stiffness: 360,
} as const;
const RING_ENTER_FADE = {
  duration: 250,
  easing: Easing.out(Easing.cubic),
  reduceMotion: ReduceMotion.System,
} as const;
const RING_EXIT_TIMING = {
  duration: 150,
  easing: Easing.out(Easing.cubic),
  reduceMotion: ReduceMotion.System,
} as const;
const RING_ENTERING = () => {
  "worklet";
  return {
    initialValues: { opacity: 0, transform: [{ scale: RING_ENTER_SCALE }] },
    animations: {
      opacity: withTiming(1, RING_ENTER_FADE),
      transform: [{ scale: withSpring(1, RING_ENTER_SPRING) }],
    },
  };
};
const RING_EXITING = () => {
  "worklet";
  return {
    initialValues: { opacity: 1, transform: [{ scale: 1 }] },
    animations: {
      opacity: withTiming(0, RING_EXIT_TIMING),
      transform: [{ scale: withTiming(RING_ENTER_SCALE, RING_EXIT_TIMING) }],
    },
  };
};

const ThemedSvg = withUniwind(Svg);

/**
 * Green arc orbiting the bubble while an agent works in another chat. The only
 * per-frame work is a rotation transform on the wrapper, composited natively;
 * the SVG itself never re-renders. Reduce Motion swaps the orbit for a still,
 * full ring so the signal survives without movement.
 */
export function RecentThreadsWorkingRing() {
  const reducedMotion = useReducedMotion();
  const rotation = useSharedValue(0);
  const [appIsActive, setAppIsActive] = useState(AppState.currentState === "active");

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      setAppIsActive(state === "active");
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (reducedMotion) return;
    if (!appIsActive) return;
    rotation.value = 0;
    rotation.value = withRepeat(
      withTiming(360, { duration: RING_REVOLUTION_MS, easing: Easing.linear }),
      -1,
      false,
    );
    return () => {
      cancelAnimation(rotation);
    };
  }, [appIsActive, reducedMotion, rotation]);

  const ringStyle = useAnimatedStyle(() => ({
    transform: [{ rotateZ: `${rotation.value}deg` }],
  }));

  return (
    <Animated.View
      accessibilityElementsHidden
      className="absolute"
      entering={RING_ENTERING}
      exiting={RING_EXITING}
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={RING_STYLE}
    >
      <Animated.View style={[RING_ORBIT_STYLE, ringStyle]}>
        <ThemedSvg
          colorClassName="accent-adaptive-emerald-600-400"
          height={RING_SIZE}
          viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}
          width={RING_SIZE}
        >
          <Circle
            cx={RING_SIZE / 2}
            cy={RING_SIZE / 2}
            fill="none"
            r={RING_RADIUS}
            stroke="currentColor"
            strokeDasharray={
              reducedMotion
                ? undefined
                : `${RING_ARC_LENGTH} ${RING_CIRCUMFERENCE - RING_ARC_LENGTH}`
            }
            strokeLinecap="round"
            strokeWidth={RING_STROKE_WIDTH}
          />
        </ThemedSvg>
      </Animated.View>
    </Animated.View>
  );
}
