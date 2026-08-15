import { useEffect } from "react";
import { Pressable, View } from "react-native";
import Animated, {
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";

import { AppText as Text } from "../../components/AppText";

const SELECTION_SPRING = {
  dampingRatio: 1,
  duration: 280,
  reduceMotion: ReduceMotion.System,
} as const;

const LABEL_TRANSITION = {
  duration: 120,
  reduceMotion: ReduceMotion.System,
} as const;

export function UsageSegmentedControl<Value extends number | string>(props: {
  readonly options: readonly { readonly value: Value; readonly label: string }[];
  readonly selected: Value;
  readonly onSelect: (value: Value) => void;
}) {
  const selectedIndex = props.options.findIndex((option) => option.value === props.selected);
  const selectionProgress = useSharedValue(Math.max(0, selectedIndex));
  const containerWidth = useSharedValue(0);
  const optionCount = props.options.length;

  useEffect(() => {
    if (selectedIndex >= 0) {
      selectionProgress.value = withSpring(selectedIndex, SELECTION_SPRING);
    }
  }, [selectedIndex, selectionProgress]);

  const selectionStyle = useAnimatedStyle(() => {
    const segmentWidth = optionCount === 0 ? 0 : containerWidth.value / optionCount;
    return {
      opacity: selectedIndex >= 0 && segmentWidth > 0 ? 1 : 0,
      transform: [{ translateX: selectionProgress.value * segmentWidth }],
      width: segmentWidth,
    };
  }, [optionCount, selectedIndex]);

  return (
    <View
      className="flex-row overflow-hidden rounded-full border-continuous bg-card"
      onLayout={(event) => {
        containerWidth.value = event.nativeEvent.layout.width;
      }}
    >
      <Animated.View
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        className="absolute inset-y-0 left-0 rounded-full bg-subtle-strong"
        style={selectionStyle}
      />

      {props.options.map((option) => {
        const active = option.value === props.selected;
        return (
          <Pressable
            key={String(option.value)}
            accessibilityLabel={option.label}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => props.onSelect(option.value)}
            className="flex-1 items-center py-2"
          >
            <SegmentLabel active={active} label={option.label} />
          </Pressable>
        );
      })}
    </View>
  );
}

function SegmentLabel(props: { readonly active: boolean; readonly label: string }) {
  const emphasis = useSharedValue(props.active ? 1 : 0);

  useEffect(() => {
    emphasis.value = withTiming(props.active ? 1 : 0, LABEL_TRANSITION);
  }, [emphasis, props.active]);

  const mutedStyle = useAnimatedStyle(() => ({ opacity: 1 - emphasis.value }));
  const activeStyle = useAnimatedStyle(() => ({ opacity: emphasis.value }));

  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Animated.View style={mutedStyle}>
        <Text className="text-sm text-foreground-muted">{props.label}</Text>
      </Animated.View>
      <Animated.View className="absolute inset-0 items-center" style={activeStyle}>
        <Text className="text-sm font-t3-medium text-foreground">{props.label}</Text>
      </Animated.View>
    </View>
  );
}
