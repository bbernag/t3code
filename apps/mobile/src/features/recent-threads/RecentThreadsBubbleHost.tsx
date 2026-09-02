import { useNavigation } from "@react-navigation/native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useWindowDimensions } from "react-native";

import { deriveLayout } from "../../lib/layout";
import type { RecentThreadBubbleEntry } from "../../persistence/imperative";
import { useProject, useThreadShell } from "../../state/entities";
import { parseActiveThreadPath } from "../keyboard/hardwareKeyboardCommands";
import { FloatingRecentThreadsBubble } from "./FloatingRecentThreadsBubble";
import { LiveThreadRecorder } from "./LiveThreadRecorder";
import {
  countRecentThreadsNeedingAttention,
  hasRecentThreadWorking,
  isRecentThreadAttentionStatus,
  pruneRecentThreadLiveActivityMutes,
  recentThreadItemsWithActivity,
  recentThreadLiveActivityMutes,
  resolveRecentThreadAcknowledgementBaseline,
  resolveRecentThreadAttentionSignal,
  resolveRecentThreadLiveActivity,
  resolveRecentThreadStatus,
  shouldSummonRecentThreadsBubble,
  type RecentThreadBubbleItem,
} from "./recentThreadAttention";
import {
  departedThreadFromTransition,
  isRecentThreadsBubbleRoute,
  isSameRecentThread,
  recentThreadKey,
  type RecentThreadAcknowledgement,
  visibleRecentThreads,
} from "./recentThreads";
import { useRecentThreadBubbleSnapshot } from "./useRecentThreadBubbleSnapshot";
import { useRecentThreadShells } from "./useRecentThreadShells";

const EMPTY_RECENT_THREADS: ReadonlyArray<RecentThreadBubbleEntry> = [];
const EMPTY_THREAD_KEYS: ReadonlySet<string> = new Set();
const EMPTY_MUTED_ACTIVITIES: ReadonlyMap<string, string> = new Map();

export function RecentThreadsBubbleHost(props: {
  readonly topRouteName: string | null;
  readonly workspacePathname: string;
}) {
  const navigation = useNavigation();
  const { width, height } = useWindowDimensions();
  const {
    snapshot,
    acknowledgeThread,
    acknowledgeThreads,
    initializeAcknowledgements,
    recordThread,
    recordWorkingThreads,
    setPosition,
  } = useRecentThreadBubbleSnapshot();
  const activeThreadRef = useMemo(
    () =>
      props.topRouteName === "NewTaskSheet" ? null : parseActiveThreadPath(props.workspacePathname),
    [props.topRouteName, props.workspacePathname],
  );
  const previousWorkingThreadKeysRef = useRef<ReadonlySet<string>>(EMPTY_THREAD_KEYS);
  const resolvedThreadShell = useThreadShell(activeThreadRef);
  const activeThreadShell =
    activeThreadRef !== null &&
    resolvedThreadShell?.environmentId === activeThreadRef.environmentId &&
    resolvedThreadShell.id === activeThreadRef.threadId
      ? resolvedThreadShell
      : null;
  const activeEnvironmentId = activeThreadShell?.environmentId ?? null;
  const activeProjectId = activeThreadShell?.projectId ?? null;
  const activeProjectRef = useMemo(
    () =>
      activeEnvironmentId === null || activeProjectId === null
        ? null
        : { environmentId: activeEnvironmentId, projectId: activeProjectId },
    [activeEnvironmentId, activeProjectId],
  );
  const activeProject = useProject(activeProjectRef);
  const activeEntry = useMemo<RecentThreadBubbleEntry | null>(
    () =>
      activeThreadRef === null
        ? null
        : {
            environmentId: String(activeThreadRef.environmentId),
            threadId: String(activeThreadRef.threadId),
            title: activeThreadShell?.title ?? "",
            projectTitle: activeProject?.title ?? "",
            lastAcknowledgedAt:
              activeThreadShell === null
                ? null
                : resolveRecentThreadAcknowledgementBaseline(activeThreadShell),
          },
    [activeProject?.title, activeThreadRef, activeThreadShell],
  );
  const previousEntryRef = useRef<RecentThreadBubbleEntry | null | undefined>(undefined);

  useEffect(() => {
    const previous = previousEntryRef.current;
    const departed = departedThreadFromTransition(previous, activeEntry);
    if (departed !== null) {
      recordThread(departed);
    }
    // Keep the latest title/project snapshot while the same thread remains active.
    previousEntryRef.current = activeEntry;
  }, [activeEntry, recordThread]);

  const visibleThreads = useMemo(
    () => visibleRecentThreads(snapshot.threads, activeEntry),
    [activeEntry, snapshot.threads],
  );
  const usesSplitView = deriveLayout({ width, height }).usesSplitView;
  const routeSupportsBubble = !usesSplitView && isRecentThreadsBubbleRoute(props.topRouteName);
  const observedThreads = routeSupportsBubble ? visibleThreads : EMPTY_RECENT_THREADS;
  const recentShells = useRecentThreadShells(observedThreads);
  const items = useMemo<ReadonlyArray<RecentThreadBubbleItem>>(
    () =>
      visibleThreads.map((thread) => {
        const shell = recentShells.get(recentThreadKey(thread)) ?? null;
        return {
          attentionOccurredAt:
            shell === null ? null : (resolveRecentThreadAttentionSignal(shell)?.occurredAt ?? null),
          liveActivity: routeSupportsBubble
            ? shell === null
              ? null
              : resolveRecentThreadLiveActivity(shell)
            : undefined,
          thread,
          status: resolveRecentThreadStatus(shell, thread.lastAcknowledgedAt),
        };
      }),
    [recentShells, routeSupportsBubble, visibleThreads],
  );
  const menuItems = useMemo(() => recentThreadItemsWithActivity(items), [items]);
  const attentionCount = useMemo(() => countRecentThreadsNeedingAttention(items), [items]);

  // Drag-to-dismiss mutes the chats that were live at dismissal; the mute is
  // session-local and clears per chat once it settles, so its next run or its
  // completion summons the bubble again.
  const knownThreadKeys = useMemo(
    () => new Set(snapshot.threads.map(recentThreadKey)),
    [snapshot.threads],
  );
  const [mutedLiveActivities, setMutedLiveActivities] =
    useState<ReadonlyMap<string, string>>(EMPTY_MUTED_ACTIVITIES);
  const working = useMemo(
    () => hasRecentThreadWorking(items, mutedLiveActivities),
    [items, mutedLiveActivities],
  );
  useEffect(() => {
    setMutedLiveActivities((current) =>
      pruneRecentThreadLiveActivityMutes({ items, knownThreadKeys, mutes: current }),
    );
  }, [items, knownThreadKeys]);
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const handleDismiss = useCallback(() => {
    const currentItems = itemsRef.current;
    const acknowledgements: RecentThreadAcknowledgement[] = [];
    for (const item of currentItems) {
      if (isRecentThreadAttentionStatus(item.status) && item.attentionOccurredAt !== null) {
        acknowledgements.push({ thread: item.thread, acknowledgedAt: item.attentionOccurredAt });
      }
    }
    acknowledgeThreads(acknowledgements);
    setMutedLiveActivities(recentThreadLiveActivityMutes(currentItems));
  }, [acknowledgeThreads]);
  const activeAttentionSignal = useMemo(
    () =>
      activeThreadShell === null ? null : resolveRecentThreadAttentionSignal(activeThreadShell),
    [activeThreadShell],
  );

  useEffect(() => {
    const isStoredRecentThread =
      activeThreadRef !== null &&
      snapshot.threads.some((thread) => isSameRecentThread(thread, activeThreadRef));
    if (isStoredRecentThread && activeThreadRef !== null && activeAttentionSignal !== null) {
      acknowledgeThread(activeThreadRef, activeAttentionSignal.occurredAt);
    }
  }, [acknowledgeThread, activeAttentionSignal, activeThreadRef, snapshot.threads]);

  useEffect(() => {
    const acknowledgements: RecentThreadAcknowledgement[] = [];
    for (const thread of observedThreads) {
      if (thread.lastAcknowledgedAt !== null) continue;
      const shell = recentShells.get(recentThreadKey(thread));
      if (shell === undefined) continue;
      const baseline = resolveRecentThreadAcknowledgementBaseline(shell);
      if (baseline !== null) {
        acknowledgements.push({ thread, acknowledgedAt: baseline });
      }
    }
    if (acknowledgements.length > 0) {
      initializeAcknowledgements(acknowledgements);
    }
  }, [initializeAcknowledgements, observedThreads, recentShells]);

  // The bubble surfaces while any chat is actively working or needs the user
  // (approval, input, or an unseen completion). Passive monitoring, quiet
  // history, and dismissed live chats keep it hidden.
  const visible =
    routeSupportsBubble && shouldSummonRecentThreadsBubble(menuItems, mutedLiveActivities);

  const handleSelectThread = useCallback(
    (item: RecentThreadBubbleItem) => {
      if (item.attentionOccurredAt !== null) {
        acknowledgeThread(item.thread, item.attentionOccurredAt);
      }
      const params = {
        environmentId: item.thread.environmentId,
        threadId: item.thread.threadId,
      };
      navigation.navigate("Thread", params);
    },
    [acknowledgeThread, navigation],
  );

  return (
    <>
      {routeSupportsBubble ? (
        <LiveThreadRecorder
          activeThread={activeThreadRef}
          previousWorkingThreadKeysRef={previousWorkingThreadKeysRef}
          onObserveWorkingThreads={recordWorkingThreads}
        />
      ) : null}
      {visible ? (
        <FloatingRecentThreadsBubble
          height={height}
          attentionCount={attentionCount}
          items={menuItems}
          position={snapshot.position}
          width={width}
          working={working}
          onDismiss={handleDismiss}
          onPositionChange={setPosition}
          onSelectThread={handleSelectThread}
        />
      ) : null}
    </>
  );
}
