import type {
  RecentThreadBubbleEntry,
  RecentThreadBubblePosition,
  RecentThreadBubbleSnapshot,
} from "../../persistence/imperative";
import { RECENT_THREAD_BUBBLE_MAX_THREADS } from "../../persistence/recent-thread-bubble";

export type RecentThreadRef = Pick<RecentThreadBubbleEntry, "environmentId" | "threadId">;
export type RecentThreadHydrationChanges = {
  readonly position: boolean;
  readonly threads: "merge" | "unchanged";
};
export type RecentThreadHydrationStatus = "failed" | "loaded" | "loading";
export type RecentThreadAcknowledgement = {
  readonly thread: RecentThreadRef;
  readonly acknowledgedAt: string;
};
/** A thread that is working right now, identified by the live run it is on. */
export type RecentThreadWorkingRun = {
  readonly activityId: string;
  readonly thread: RecentThreadBubbleEntry;
};
export type RecentThreadWorkingObservation = {
  readonly newlyWorkingThreads: ReadonlyArray<RecentThreadBubbleEntry>;
  readonly workingThreads: ReadonlyArray<RecentThreadBubbleEntry>;
  /** Thread key to the activity id observed working, for the next observation. */
  readonly workingActivities: ReadonlyMap<string, string>;
};

const BUBBLE_ROUTES = new Set([
  "Thread",
  "ThreadFile",
  "ThreadFiles",
  "ThreadReview",
  "ThreadTerminal",
]);

export function shouldPersistRecentThreadSnapshot(
  hydrationStatus: RecentThreadHydrationStatus,
): boolean {
  return hydrationStatus === "loaded";
}

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

// Matches surrogate pairs (kept) and lone surrogates (replaced); the latter
// make encodeURIComponent throw, and an id is never worth crashing the host.
const SURROGATE_PATTERN = /[\uD800-\uDBFF][\uDC00-\uDFFF]|[\uD800-\uDFFF]/g;

function encodeKeyPart(value: string): string {
  return encodeURIComponent(
    value.replace(SURROGATE_PATTERN, (match) => (match.length === 2 ? match : "\uFFFD")),
  );
}

export function recentThreadKey(thread: RecentThreadRef): string {
  return `${encodeKeyPart(thread.environmentId)}:${encodeKeyPart(thread.threadId)}`;
}

function timestampValue(value: string | null): number | null {
  if (value === null) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function latestTimestamp(
  preferred: string | null,
  fallback: string | null | undefined,
): string | null {
  const preferredValue = timestampValue(preferred);
  const fallbackValue = timestampValue(fallback ?? null);
  if (preferredValue === null) return fallbackValue === null ? null : (fallback ?? null);
  return fallbackValue !== null && fallbackValue > preferredValue ? (fallback ?? null) : preferred;
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
    lastAcknowledgedAt: latestTimestamp(preferred.lastAcknowledgedAt, fallback?.lastAcknowledgedAt),
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
      entry.projectTitle === threads[index]?.projectTitle &&
      entry.lastAcknowledgedAt === threads[index]?.lastAcknowledgedAt,
  )
    ? threads
    : next;
}

export function recordDepartedThreads(
  threads: ReadonlyArray<RecentThreadBubbleEntry>,
  departedThreads: ReadonlyArray<RecentThreadBubbleEntry>,
): ReadonlyArray<RecentThreadBubbleEntry> {
  let next = threads;
  for (const departed of departedThreads) {
    next = recordDepartedThread(next, departed);
  }
  return next;
}

export function refreshRecentThreadMetadata(
  threads: ReadonlyArray<RecentThreadBubbleEntry>,
  observedThreads: ReadonlyArray<RecentThreadBubbleEntry>,
): ReadonlyArray<RecentThreadBubbleEntry> {
  const observedByKey = new Map(observedThreads.map((thread) => [recentThreadKey(thread), thread]));
  let changed = false;
  const next = threads.map((thread) => {
    const observed = observedByKey.get(recentThreadKey(thread));
    if (observed === undefined) return thread;
    const title = observed.title.trim() || thread.title;
    const projectTitle = observed.projectTitle.trim() || thread.projectTitle;
    if (title === thread.title && projectTitle === thread.projectTitle) return thread;
    changed = true;
    return { ...thread, title, projectTitle };
  });
  return changed ? next : threads;
}

/**
 * A run is new when its activity id differs from the one last seen for that
 * thread, so a run that ended and restarted while the recorder was unmounted
 * is recorded again, while a continuing run is recorded once.
 */
export function observeWorkingRecentThreads(input: {
  readonly activeThread: RecentThreadRef | null;
  readonly previousWorkingActivities: ReadonlyMap<string, string>;
  readonly workingRuns: ReadonlyArray<RecentThreadWorkingRun>;
}): RecentThreadWorkingObservation {
  const workingActivities = new Map(
    input.workingRuns.map((run) => [recentThreadKey(run.thread), run.activityId]),
  );
  const newlyWorkingThreads = input.workingRuns
    .filter(
      (run) =>
        input.previousWorkingActivities.get(recentThreadKey(run.thread)) !== run.activityId &&
        !isSameRecentThread(run.thread, input.activeThread),
    )
    .map((run) => run.thread);
  return {
    newlyWorkingThreads,
    workingThreads: input.workingRuns.map((run) => run.thread),
    workingActivities,
  };
}

export function acknowledgeRecentThread(
  threads: ReadonlyArray<RecentThreadBubbleEntry>,
  ref: RecentThreadRef,
  acknowledgedAt: string,
): ReadonlyArray<RecentThreadBubbleEntry> {
  const nextValue = timestampValue(acknowledgedAt);
  if (nextValue === null) return threads;

  const index = threads.findIndex((thread) => isSameRecentThread(thread, ref));
  const current = threads[index];
  if (current === undefined) return threads;

  const currentValue = timestampValue(current.lastAcknowledgedAt);
  if (currentValue !== null && currentValue >= nextValue) return threads;

  const next = [...threads];
  next[index] = { ...current, lastAcknowledgedAt: acknowledgedAt };
  return next;
}

export function acknowledgeRecentThreads(
  threads: ReadonlyArray<RecentThreadBubbleEntry>,
  acknowledgements: ReadonlyArray<RecentThreadAcknowledgement>,
): ReadonlyArray<RecentThreadBubbleEntry> {
  let next = threads;
  for (const acknowledgement of acknowledgements) {
    next = acknowledgeRecentThread(next, acknowledgement.thread, acknowledgement.acknowledgedAt);
  }
  return next;
}

export function initializeRecentThreadAcknowledgements(
  threads: ReadonlyArray<RecentThreadBubbleEntry>,
  acknowledgements: ReadonlyArray<RecentThreadAcknowledgement>,
): ReadonlyArray<RecentThreadBubbleEntry> {
  if (acknowledgements.length === 0) return threads;

  const baselines = new Map<string, string>();
  for (const acknowledgement of acknowledgements) {
    const candidateValue = timestampValue(acknowledgement.acknowledgedAt);
    if (candidateValue === null) continue;
    const key = recentThreadKey(acknowledgement.thread);
    const existing = baselines.get(key);
    if (existing === undefined || candidateValue > Date.parse(existing)) {
      baselines.set(key, acknowledgement.acknowledgedAt);
    }
  }

  let changed = false;
  const next = threads.map((thread) => {
    if (thread.lastAcknowledgedAt !== null) return thread;
    const baseline = baselines.get(recentThreadKey(thread));
    if (baseline === undefined) return thread;
    changed = true;
    return { ...thread, lastAcknowledgedAt: baseline };
  });
  return changed ? next : threads;
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
