import { useNavigation } from "@react-navigation/native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useWindowDimensions } from "react-native";

import { deriveLayout } from "../../lib/layout";
import {
  loadRecentThreadBubbleSnapshot,
  saveRecentThreadBubbleSnapshot,
  type RecentThreadBubbleEntry,
  type RecentThreadBubblePosition,
  type RecentThreadBubbleSnapshot,
} from "../../persistence/imperative";
import { EMPTY_RECENT_THREAD_BUBBLE_SNAPSHOT } from "../../persistence/recent-thread-bubble";
import { useProject, useThreadShell } from "../../state/entities";
import { parseActiveThreadPath } from "../keyboard/hardwareKeyboardCommands";
import { FloatingRecentThreadsBubble } from "./FloatingRecentThreadsBubble";
import {
  countRecentThreadsNeedingAttention,
  resolveRecentThreadAcknowledgementBaseline,
  resolveRecentThreadAttentionSignal,
  resolveRecentThreadStatus,
  type RecentThreadBubbleItem,
} from "./recentThreadAttention";
import {
  acknowledgeRecentThread,
  departedThreadFromTransition,
  hydrateRecentThreadSnapshot,
  initializeRecentThreadAcknowledgements,
  isRecentThreadsBubbleRoute,
  isSameRecentThread,
  recentThreadKey,
  recordDepartedThread,
  type RecentThreadAcknowledgement,
  type RecentThreadHydrationChanges,
  type RecentThreadRef,
  visibleRecentThreads,
} from "./recentThreads";
import { useRecentThreadShells } from "./useRecentThreadShells";

type SnapshotMutation = "position" | "threadsMerge" | "threadsReplace";
type HydrationStatus = "failed" | "loaded" | "loading";
const POSITION_EQUALITY_EPSILON = 0.0001;
const EMPTY_RECENT_THREADS: ReadonlyArray<RecentThreadBubbleEntry> = [];

function samePosition(
  left: RecentThreadBubblePosition | null,
  right: RecentThreadBubblePosition | null,
): boolean {
  return (
    left === right ||
    (left !== null &&
      right !== null &&
      Math.abs(left.x - right.x) < POSITION_EQUALITY_EPSILON &&
      Math.abs(left.y - right.y) < POSITION_EQUALITY_EPSILON)
  );
}

function useRecentThreadBubbleSnapshot() {
  const [snapshot, setSnapshot] = useState<RecentThreadBubbleSnapshot>(
    EMPTY_RECENT_THREAD_BUBBLE_SNAPSHOT,
  );
  const snapshotRef = useRef(snapshot);
  const hydrationStatusRef = useRef<HydrationStatus>("loading");
  const changedBeforeHydrationRef = useRef<RecentThreadHydrationChanges>({
    position: false,
    threads: "unchanged",
  });
  const saveQueueRef = useRef<Promise<unknown>>(Promise.resolve());

  const enqueueSave = useCallback((next: RecentThreadBubbleSnapshot) => {
    saveQueueRef.current = saveQueueRef.current
      .catch(() => undefined)
      .then(() => saveRecentThreadBubbleSnapshot(next))
      .catch((error) => {
        console.warn("[recent-threads-bubble] failed to save state", error);
      });
  }, []);

  useEffect(() => {
    let cancelled = false;
    void loadRecentThreadBubbleSnapshot()
      .then((persisted) => {
        if (cancelled) return;
        hydrationStatusRef.current = "loaded";
        const changed = changedBeforeHydrationRef.current;
        const current = snapshotRef.current;
        const hydrated = hydrateRecentThreadSnapshot({ current, persisted, changes: changed });
        snapshotRef.current = hydrated;
        setSnapshot(hydrated);
        if (changed.threads !== "unchanged" || changed.position) {
          enqueueSave(hydrated);
        }
      })
      .catch((error) => {
        if (cancelled) return;
        console.warn("[recent-threads-bubble] failed to load state", error);
        hydrationStatusRef.current = "failed";
        const changed = changedBeforeHydrationRef.current;
        if (changed.threads !== "unchanged" || changed.position) {
          enqueueSave(snapshotRef.current);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [enqueueSave]);

  const commit = useCallback(
    (
      mutation: SnapshotMutation,
      transform: (current: RecentThreadBubbleSnapshot) => RecentThreadBubbleSnapshot,
    ) => {
      const current = snapshotRef.current;
      const next = transform(current);
      const status = hydrationStatusRef.current;
      if (status === "loading") {
        if (mutation === "position") {
          changedBeforeHydrationRef.current = {
            ...changedBeforeHydrationRef.current,
            position: true,
          };
        } else if (mutation === "threadsReplace") {
          changedBeforeHydrationRef.current = {
            ...changedBeforeHydrationRef.current,
            threads: "replace",
          };
        } else if (changedBeforeHydrationRef.current.threads === "unchanged") {
          changedBeforeHydrationRef.current = {
            ...changedBeforeHydrationRef.current,
            threads: "merge",
          };
        }
      }
      if (next === current) return;
      snapshotRef.current = next;
      setSnapshot(next);

      if (status !== "loading") {
        enqueueSave(next);
      }
    },
    [enqueueSave],
  );

  const recordThread = useCallback(
    (thread: RecentThreadBubbleEntry) => {
      commit("threadsMerge", (current) => {
        const threads = recordDepartedThread(current.threads, thread);
        return threads === current.threads ? current : { ...current, threads };
      });
    },
    [commit],
  );
  const clearThreads = useCallback(() => {
    commit("threadsReplace", (current) =>
      current.threads.length === 0 ? current : { ...current, threads: [] },
    );
  }, [commit]);
  const acknowledgeThread = useCallback(
    (thread: RecentThreadRef, acknowledgedAt: string) => {
      commit("threadsMerge", (current) => {
        const threads = acknowledgeRecentThread(current.threads, thread, acknowledgedAt);
        return threads === current.threads ? current : { ...current, threads };
      });
    },
    [commit],
  );
  const initializeAcknowledgements = useCallback(
    (acknowledgements: ReadonlyArray<RecentThreadAcknowledgement>) => {
      commit("threadsMerge", (current) => {
        const threads = initializeRecentThreadAcknowledgements(current.threads, acknowledgements);
        return threads === current.threads ? current : { ...current, threads };
      });
    },
    [commit],
  );
  const setPosition = useCallback(
    (position: RecentThreadBubblePosition) => {
      commit("position", (current) =>
        samePosition(current.position, position) ? current : { ...current, position },
      );
    },
    [commit],
  );
  const resetPosition = useCallback(() => {
    commit("position", (current) =>
      current.position === null ? current : { ...current, position: null },
    );
  }, [commit]);

  return {
    snapshot,
    acknowledgeThread,
    clearThreads,
    initializeAcknowledgements,
    recordThread,
    resetPosition,
    setPosition,
  };
}

export function RecentThreadsBubbleHost(props: {
  readonly topRouteName: string | null;
  readonly workspacePathname: string;
}) {
  const navigation = useNavigation();
  const { width, height } = useWindowDimensions();
  const {
    snapshot,
    acknowledgeThread,
    clearThreads,
    initializeAcknowledgements,
    recordThread,
    resetPosition,
    setPosition,
  } = useRecentThreadBubbleSnapshot();
  const activeThreadRef = useMemo(
    () =>
      props.topRouteName === "NewTaskSheet" ? null : parseActiveThreadPath(props.workspacePathname),
    [props.topRouteName, props.workspacePathname],
  );
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
          thread,
          status: resolveRecentThreadStatus(shell, thread.lastAcknowledgedAt),
        };
      }),
    [recentShells, visibleThreads],
  );
  const attentionCount = useMemo(() => countRecentThreadsNeedingAttention(items), [items]);
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

  const visible = visibleThreads.length > 0 && routeSupportsBubble;

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

  if (!visible) {
    return null;
  }

  return (
    <FloatingRecentThreadsBubble
      height={height}
      attentionCount={attentionCount}
      items={items}
      position={snapshot.position}
      width={width}
      onClear={clearThreads}
      onPositionChange={setPosition}
      onResetPosition={resetPosition}
      onSelectThread={handleSelectThread}
    />
  );
}
