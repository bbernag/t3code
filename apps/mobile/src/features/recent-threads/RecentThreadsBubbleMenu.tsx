import { useCallback, useState } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  View,
  type LayoutChangeEvent,
  type ViewStyle,
} from "react-native";
import Animated, { type SharedValue, useAnimatedStyle } from "react-native-reanimated";

import { AppText as Text } from "../../components/AppText";
import { SymbolView } from "../../components/AppSymbol";
import { GlassSurface } from "../../components/GlassSurface";
import { cn } from "../../lib/cn";
import { useThemeColor } from "../../lib/useThemeColor";
import {
  clampFloatingChatValue,
  resolveFloatingChatMenuScaleOrigin,
  type FloatingChatMenuLayout,
} from "./floatingRecentThreadsLayout";
import type { RecentThreadBubbleItem, RecentThreadStatusKind } from "./recentThreadAttention";
import { recentThreadKey, recentThreadLabel, recentThreadProjectLabel } from "./recentThreads";

const MENU_MOTION = {
  collapsedScale: 0.05,
  contentOffset: 6,
  contentRevealRange: 0.58,
  contentRevealStart: 0.28,
  surfaceRevealRange: 0.15,
} as const;
const MENU_SURFACE_STYLE = { borderRadius: 20 } satisfies ViewStyle;

const STATUS_PRESENTATION = {
  approval: {
    label: "Approval",
    pillClassName: "bg-amber-500/12 dark:bg-amber-500/16",
    textClassName: "text-amber-700 dark:text-amber-300",
  },
  input: {
    label: "Input",
    pillClassName: "bg-indigo-500/12 dark:bg-indigo-500/16",
    textClassName: "text-indigo-700 dark:text-indigo-300",
  },
  completed: {
    label: "Done",
    pillClassName: "bg-emerald-500/12 dark:bg-emerald-500/16",
    textClassName: "text-emerald-700 dark:text-emerald-300",
  },
  working: {
    label: "Working",
    pillClassName: "bg-sky-500/12 dark:bg-sky-500/16",
    textClassName: "text-sky-700 dark:text-sky-300",
  },
  monitoring: {
    label: "Monitoring",
    pillClassName: "bg-sky-500/12 dark:bg-sky-500/16",
    textClassName: "text-sky-700 dark:text-sky-300",
  },
} as const satisfies Record<
  RecentThreadStatusKind,
  {
    readonly label: string;
    readonly pillClassName: string;
    readonly textClassName: string;
  }
>;

export function RecentThreadsBubbleMenu(props: {
  readonly items: ReadonlyArray<RecentThreadBubbleItem>;
  readonly layout: FloatingChatMenuLayout;
  readonly progress: SharedValue<number>;
  readonly onClose: () => void;
  readonly onSelectThread: (item: RecentThreadBubbleItem) => void;
}) {
  const cardColor = useThemeColor("--color-card");
  const foregroundColor = useThemeColor("--color-foreground");
  const mutedColor = useThemeColor("--color-foreground-muted");
  const subtleColor = useThemeColor("--color-subtle");

  const menuWidth = props.layout.width;
  const [surfaceHeight, setSurfaceHeight] = useState(props.layout.maxHeight);
  const scaleOrigin = resolveFloatingChatMenuScaleOrigin({
    anchorX: props.layout.anchorX,
    height: surfaceHeight,
    opensBelow: props.layout.opensBelow,
    width: menuWidth,
  });
  const handleSurfaceLayout = useCallback((event: LayoutChangeEvent) => {
    const nextHeight = event.nativeEvent.layout.height;
    setSurfaceHeight((current) => (current === nextHeight ? current : nextHeight));
  }, []);

  const surfaceAnimatedStyle = useAnimatedStyle(() => {
    // Progress is clamped so the surface can never render beyond its open size,
    // and the pivot translation is folded into a single translate per axis:
    // translate((1 - scale) * origin) then scale fixes the point at
    // center + origin without duplicate transform entries.
    const progress = clampFloatingChatValue(props.progress.value, 0, 1);
    const scale = MENU_MOTION.collapsedScale + (1 - MENU_MOTION.collapsedScale) * progress;
    return {
      opacity: clampFloatingChatValue(progress / MENU_MOTION.surfaceRevealRange, 0, 1),
      transform: [
        { translateX: (1 - scale) * scaleOrigin.x },
        { translateY: (1 - scale) * scaleOrigin.y },
        { scale },
      ],
    };
  }, [scaleOrigin.x, scaleOrigin.y]);

  const contentAnimatedStyle = useAnimatedStyle(() => {
    const progress = clampFloatingChatValue(props.progress.value, 0, 1);
    const contentProgress = clampFloatingChatValue(
      (progress - MENU_MOTION.contentRevealStart) / MENU_MOTION.contentRevealRange,
      0,
      1,
    );
    return {
      opacity: contentProgress,
      transform: [
        {
          translateY:
            (1 - contentProgress) *
            (props.layout.opensBelow ? -MENU_MOTION.contentOffset : MENU_MOTION.contentOffset),
        },
      ],
    };
  }, [props.layout.opensBelow]);

  return (
    <View
      accessibilityViewIsModal
      collapsable={false}
      onAccessibilityEscape={props.onClose}
      onLayout={handleSurfaceLayout}
      style={{
        ...(props.layout.opensBelow ? { top: props.layout.top } : { bottom: props.layout.bottom }),
        alignSelf: "flex-start",
        flexGrow: 0,
        flexShrink: 0,
        left: props.layout.left,
        maxHeight: props.layout.maxHeight,
        maxWidth: menuWidth,
        position: "absolute",
        width: menuWidth,
      }}
    >
      <Animated.View
        collapsable={false}
        style={[
          { maxHeight: props.layout.maxHeight, maxWidth: menuWidth, width: menuWidth },
          surfaceAnimatedStyle,
        ]}
      >
        <GlassSurface
          forceFallback
          fallbackStyle={{ backgroundColor: cardColor }}
          style={[
            MENU_SURFACE_STYLE,
            {
              maxHeight: props.layout.maxHeight,
              maxWidth: menuWidth,
              width: menuWidth,
            },
            Platform.OS === "android" ? { elevation: 0 } : null,
          ]}
        >
          <Animated.View style={contentAnimatedStyle}>
            <ScrollView
              bounces={false}
              contentContainerClassName="overflow-hidden"
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <View className="min-h-12 flex-row items-center justify-between px-4 py-2.5">
                <Text className="text-sm font-t3-bold text-foreground">Recent chats</Text>
                <Text className="text-xs text-foreground-muted">{props.items.length}</Text>
              </View>
              {props.items.map((item, index) => {
                const thread = item.thread;
                const projectLabel = recentThreadProjectLabel(thread);
                const status = item.status === null ? null : STATUS_PRESENTATION[item.status];
                return (
                  <Pressable
                    key={recentThreadKey(thread)}
                    accessibilityHint="Opens this chat"
                    accessibilityLabel={`${recentThreadLabel(thread)}${status === null ? "" : `, ${status.label}`}`}
                    accessibilityRole="button"
                    android_ripple={{ color: subtleColor }}
                    className={cn(
                      "min-h-16 flex-row items-center gap-3 px-3 py-2.5 active:bg-subtle",
                      index > 0 && "border-t border-border",
                    )}
                    onPress={() => props.onSelectThread(item)}
                  >
                    <View className="size-9 items-center justify-center rounded-full bg-subtle">
                      <SymbolView
                        name="text.bubble"
                        size={18}
                        tintColor={foregroundColor}
                        type="monochrome"
                        weight="medium"
                      />
                    </View>
                    <View className="min-w-0 flex-1">
                      <Text
                        className="text-[15px] font-t3-medium text-foreground"
                        numberOfLines={1}
                      >
                        {recentThreadLabel(thread)}
                      </Text>
                      {projectLabel === null ? null : (
                        <Text className="text-xs text-foreground-muted" numberOfLines={1}>
                          {projectLabel}
                        </Text>
                      )}
                    </View>
                    <View className="flex-row items-center gap-2">
                      {status === null ? null : (
                        <View className={`${status.pillClassName} rounded-full px-1.5 py-0.5`}>
                          <Text
                            className={`text-3xs font-t3-bold ${status.textClassName}`}
                            numberOfLines={1}
                          >
                            {status.label}
                          </Text>
                        </View>
                      )}
                      <SymbolView
                        name="chevron.right"
                        size={14}
                        tintColor={mutedColor}
                        type="monochrome"
                        weight="semibold"
                      />
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
          </Animated.View>
        </GlassSurface>
      </Animated.View>
    </View>
  );
}
