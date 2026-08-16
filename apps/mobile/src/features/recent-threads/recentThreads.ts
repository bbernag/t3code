import type {
  RecentThreadBubbleEntry,
  RecentThreadBubblePosition,
  RecentThreadBubbleSnapshot,
} from "../../persistence/imperative";
import { RECENT_THREAD_BUBBLE_MAX_THREADS } from "../../persistence/recent-thread-bubble";

export type RecentThreadRef = Pick<RecentThreadBubbleEntry, "environmentId" | "threadId">;
export type RecentThreadHydrationChanges = {
  readonly position: boolean;
  readonly threads: "merge" | "replace" | "unchanged";
};

const BUBBLE_ROUTES = new Set([
  "Thread",
  "ThreadFile",
  "ThreadFiles",
  "ThreadReview",
  "ThreadTerminal",
]);

export function isSameRecentThread(
  left: RecentThreadRef | null,
  right: RecentThreadRef | null,
): boolean {
  return (
    left === right ||
    (left !== null &&
      right !== null &&
      left.environmentId === right.environmentId &&
      left.threadId === right.threadId)
  );
}

export function departedThreadFromTransition(
  previous: RecentThreadBubbleEntry | null | undefined,
  current: RecentThreadRef | null,
): RecentThreadBubbleEntry | null {
  if (previous === undefined || previous === null || isSameRecentThread(previous, current)) {
    return null;
  }
  return previous;
}

function preferMetadata(
  preferred: RecentThreadBubbleEntry,
  fallback: RecentThreadBubbleEntry | undefined,
): RecentThreadBubbleEntry {
  return {
    ...preferred,
    title: preferred.title.trim() || fallback?.title || "",
    projectTitle: preferred.projectTitle.trim() || fallback?.projectTitle || "",
  };
}

export function recordDepartedThread(
  threads: ReadonlyArray<RecentThreadBubbleEntry>,
  departed: RecentThreadBubbleEntry,
): ReadonlyArray<RecentThreadBubbleEntry> {
  const existing = threads.find((candidate) => isSameRecentThread(candidate, departed));
  const next = [
    preferMetadata(departed, existing),
    ...threads.filter((candidate) => !isSameRecentThread(candidate, departed)),
  ].slice(0, RECENT_THREAD_BUBBLE_MAX_THREADS);

  if (next.length !== threads.length) {
    return next;
  }
  return next.every(
    (entry, index) =>
      entry.environmentId === threads[index]?.environmentId &&
      entry.threadId === threads[index]?.threadId &&
      entry.title === threads[index]?.title &&
      entry.projectTitle === threads[index]?.projectTitle,
  )
    ? threads
    : next;
}

export function mergeRecentThreads(
  preferred: ReadonlyArray<RecentThreadBubbleEntry>,
  fallback: ReadonlyArray<RecentThreadBubbleEntry>,
): ReadonlyArray<RecentThreadBubbleEntry> {
  let merged: ReadonlyArray<RecentThreadBubbleEntry> = [];
  for (const entry of [...fallback].toReversed()) {
    merged = recordDepartedThread(merged, entry);
  }
  for (const entry of [...preferred].toReversed()) {
    merged = recordDepartedThread(merged, entry);
  }
  return merged;
}

export function hydrateRecentThreadSnapshot(input: {
  readonly current: RecentThreadBubbleSnapshot;
  readonly persisted: RecentThreadBubbleSnapshot;
  readonly changes: RecentThreadHydrationChanges;
}): RecentThreadBubbleSnapshot {
  const threads =
    input.changes.threads === "unchanged"
      ? input.persisted.threads
      : input.changes.threads === "replace"
        ? input.current.threads
        : mergeRecentThreads(input.current.threads, input.persisted.threads);
  return {
    threads,
    position: input.changes.position ? input.current.position : input.persisted.position,
  };
}

export function visibleRecentThreads(
  threads: ReadonlyArray<RecentThreadBubbleEntry>,
  activeThread: RecentThreadRef | null,
): ReadonlyArray<RecentThreadBubbleEntry> {
  if (
    activeThread === null ||
    !threads.some((thread) => isSameRecentThread(thread, activeThread))
  ) {
    return threads;
  }
  return threads.filter((thread) => !isSameRecentThread(thread, activeThread));
}

export function isRecentThreadsBubbleRoute(routeName: string | null): boolean {
  return routeName !== null && BUBBLE_ROUTES.has(routeName);
}

export function recentThreadLabel(thread: RecentThreadBubbleEntry): string {
  const title = thread.title.trim();
  return title || "Untitled thread";
}

export function recentThreadProjectLabel(thread: RecentThreadBubbleEntry): string | null {
  const title = thread.projectTitle.trim();
  return title || null;
}

export const DEFAULT_RECENT_THREAD_BUBBLE_POSITION: RecentThreadBubblePosition = {
  x: 1,
  y: 0.32,
};
