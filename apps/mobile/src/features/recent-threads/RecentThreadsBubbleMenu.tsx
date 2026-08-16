import { useEffect } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, View, type ColorValue } from "react-native";
import Animated, {
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { AppText as Text } from "../../components/AppText";
import { SymbolView } from "../../components/AppSymbol";
import { useThemeColor } from "../../lib/useThemeColor";
import type { RecentThreadBubbleEntry } from "../../persistence/imperative";
import type { FloatingChatMenuLayout } from "./floatingRecentThreadsLayout";
import { recentThreadLabel, recentThreadProjectLabel } from "./recentThreads";

const MENU_TIMING = {
  duration: 140,
  reduceMotion: ReduceMotion.System,
} as const;

export function RecentThreadsBubbleMenu(props: {
  readonly layout: FloatingChatMenuLayout;
  readonly threads: ReadonlyArray<RecentThreadBubbleEntry>;
  readonly onClear: () => void;
  readonly onClose: () => void;
  readonly onResetPosition: () => void;
  readonly onSelectThread: (thread: RecentThreadBubbleEntry) => void;
}) {
  const cardColor = useThemeColor("--color-card");
  const borderColor = useThemeColor("--color-border");
  const foregroundColor = useThemeColor("--color-foreground");
  const mutedColor = useThemeColor("--color-foreground-muted");
  const subtleColor = useThemeColor("--color-subtle");
  const dangerColor = useThemeColor("--color-danger-foreground");
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withTiming(1, MENU_TIMING);
  }, [progress]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [
      { translateY: (1 - progress.value) * (props.layout.opensBelow ? -6 : 6) },
      { scale: 0.97 + progress.value * 0.03 },
    ],
  }));

  return (
    <Animated.View
      accessibilityViewIsModal
      onAccessibilityEscape={props.onClose}
      style={[
        styles.menuShadow,
        {
          backgroundColor: cardColor,
          borderColor,
          left: props.layout.left,
          maxHeight: props.layout.maxHeight,
          top: props.layout.top,
          width: props.layout.width,
        },
        animatedStyle,
      ]}
    >
      <ScrollView
        bounces={false}
        contentContainerStyle={styles.menuContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.menuHeader}>
          <Text className="text-sm font-t3-bold text-foreground">Recent chats</Text>
          <Text className="text-xs text-foreground-muted">{props.threads.length}</Text>
        </View>
        {props.threads.map((thread, index) => {
          const projectLabel = recentThreadProjectLabel(thread);
          return (
            <Pressable
              key={threadKey(thread)}
              accessibilityHint="Opens this chat"
              accessibilityLabel={recentThreadLabel(thread)}
              accessibilityRole="button"
              android_ripple={{ color: String(subtleColor) }}
              onPress={() => props.onSelectThread(thread)}
              style={({ pressed }) => [
                styles.threadRow,
                index > 0 ? { borderTopColor: borderColor, borderTopWidth: 1 } : null,
                pressed && Platform.OS !== "android" ? { backgroundColor: subtleColor } : null,
              ]}
            >
              <View style={[styles.threadIcon, { backgroundColor: subtleColor }]}>
                <SymbolView
                  name="text.bubble"
                  size={18}
                  tintColor={foregroundColor}
                  type="monochrome"
                  weight="medium"
                />
              </View>
              <View style={styles.threadLabels}>
                <Text className="text-[15px] font-t3-medium text-foreground" numberOfLines={1}>
                  {recentThreadLabel(thread)}
                </Text>
                {projectLabel === null ? null : (
                  <Text className="text-xs text-foreground-muted" numberOfLines={1}>
                    {projectLabel}
                  </Text>
                )}
              </View>
              <SymbolView
                name="chevron.right"
                size={14}
                tintColor={mutedColor}
                type="monochrome"
                weight="semibold"
              />
            </Pressable>
          );
        })}
        <View style={[styles.actions, { borderTopColor: borderColor }]}>
          <MenuAction
            color={mutedColor}
            icon="arrow.clockwise"
            label="Reset position"
            pressedColor={subtleColor}
            onPress={props.onResetPosition}
          />
          <View style={[styles.actionDivider, { backgroundColor: borderColor }]} />
          <MenuAction
            color={dangerColor}
            icon="trash"
            label="Clear"
            pressedColor={subtleColor}
            onPress={props.onClear}
          />
        </View>
      </ScrollView>
    </Animated.View>
  );
}

function MenuAction(props: {
  readonly color: ColorValue;
  readonly icon: "arrow.clockwise" | "trash";
  readonly label: string;
  readonly pressedColor: ColorValue;
  readonly onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityLabel={props.label}
      accessibilityRole="button"
      android_ripple={{ color: String(props.pressedColor) }}
      onPress={props.onPress}
      style={({ pressed }) => [
        styles.action,
        pressed && Platform.OS !== "android" ? { backgroundColor: props.pressedColor } : null,
      ]}
    >
      <SymbolView
        name={props.icon}
        size={15}
        tintColor={props.color}
        type="monochrome"
        weight="medium"
      />
      <Text numberOfLines={2} style={[styles.actionLabel, { color: props.color }]}>
        {props.label}
      </Text>
    </Pressable>
  );
}

function threadKey(thread: RecentThreadBubbleEntry): string {
  return `${encodeURIComponent(thread.environmentId)}:${encodeURIComponent(thread.threadId)}`;
}

const styles = StyleSheet.create({
  menuShadow: {
    borderRadius: 20,
    borderWidth: 1,
    elevation: 14,
    overflow: "hidden",
    position: "absolute",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    zIndex: 2,
  },
  menuContent: {
    overflow: "hidden",
  },
  menuHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 48,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  threadRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    minHeight: 64,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  threadIcon: {
    alignItems: "center",
    borderRadius: 18,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  threadLabels: {
    flex: 1,
    minWidth: 0,
  },
  actions: {
    borderTopWidth: 1,
    flexDirection: "row",
    minHeight: 52,
  },
  action: {
    alignItems: "center",
    flex: 1,
    flexDirection: "row",
    gap: 7,
    justifyContent: "center",
    minHeight: 52,
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  actionDivider: {
    width: StyleSheet.hairlineWidth,
  },
  actionLabel: {
    flexShrink: 1,
    fontFamily: "DMSans_500Medium",
    fontSize: 12,
    textAlign: "center",
  },
});
