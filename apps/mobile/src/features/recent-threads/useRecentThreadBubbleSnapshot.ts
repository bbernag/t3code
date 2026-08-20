import { useCallback, useEffect, useRef, useState } from "react";

import {
  loadRecentThreadBubbleSnapshot,
  saveRecentThreadBubbleSnapshot,
  type RecentThreadBubbleEntry,
  type RecentThreadBubblePosition,
  type RecentThreadBubbleSnapshot,
} from "../../persistence/imperative";
import { EMPTY_RECENT_THREAD_BUBBLE_SNAPSHOT } from "../../persistence/recent-thread-bubble";
import {
  acknowledgeRecentThread,
  acknowledgeRecentThreads,
  hydrateRecentThreadSnapshot,
  initializeRecentThreadAcknowledgements,
  recordDepartedThread,
  recordDepartedThreads,
  refreshRecentThreadMetadata,
  shouldPersistRecentThreadSnapshot,
  type RecentThreadAcknowledgement,
  type RecentThreadHydrationChanges,
  type RecentThreadHydrationStatus,
  type RecentThreadRef,
  type RecentThreadWorkingObservation,
} from "./recentThreads";

type SnapshotMutation = "position" | "threadsMerge";
const POSITION_EQUALITY_EPSILON = 0.0001;

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

export function useRecentThreadBubbleSnapshot() {
  const [snapshot, setSnapshot] = useState<RecentThreadBubbleSnapshot>(
    EMPTY_RECENT_THREAD_BUBBLE_SNAPSHOT,
  );
  const snapshotRef = useRef(snapshot);
  const hydrationStatusRef = useRef<RecentThreadHydrationStatus>("loading");
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

      if (shouldPersistRecentThreadSnapshot(status)) {
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
  const recordWorkingThreads = useCallback(
    (observation: RecentThreadWorkingObservation) => {
      commit("threadsMerge", (current) => {
        const recorded = recordDepartedThreads(current.threads, observation.newlyWorkingThreads);
        const threads = refreshRecentThreadMetadata(recorded, observation.workingThreads);
        return threads === current.threads ? current : { ...current, threads };
      });
    },
    [commit],
  );
  const acknowledgeThread = useCallback(
    (thread: RecentThreadRef, acknowledgedAt: string) => {
      commit("threadsMerge", (current) => {
        const threads = acknowledgeRecentThread(current.threads, thread, acknowledgedAt);
        return threads === current.threads ? current : { ...current, threads };
      });
    },
    [commit],
  );
  const acknowledgeThreads = useCallback(
    (acknowledgements: ReadonlyArray<RecentThreadAcknowledgement>) => {
      if (acknowledgements.length === 0) return;
      commit("threadsMerge", (current) => {
        const threads = acknowledgeRecentThreads(current.threads, acknowledgements);
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

  return {
    snapshot,
    acknowledgeThread,
    acknowledgeThreads,
    initializeAcknowledgements,
    recordThread,
    recordWorkingThreads,
    setPosition,
  };
}
