export const RECENT_THREAD_BUBBLE_SNAPSHOT_VERSION = 2;
export const RECENT_THREAD_BUBBLE_MAX_THREADS = 5;
const RECENT_THREAD_BUBBLE_MAX_TITLE_LENGTH = 240;
const RECENT_THREAD_BUBBLE_MAX_PROJECT_TITLE_LENGTH = 120;
const RECENT_THREAD_BUBBLE_MAX_TIMESTAMP_LENGTH = 64;

export type RecentThreadBubbleEntry = {
  readonly environmentId: string;
  readonly threadId: string;
  readonly title: string;
  readonly projectTitle: string;
  readonly lastAcknowledgedAt: string | null;
};

export type RecentThreadBubblePosition = {
  readonly x: number;
  readonly y: number;
};

export type RecentThreadBubbleSnapshot = {
  readonly threads: ReadonlyArray<RecentThreadBubbleEntry>;
  readonly position: RecentThreadBubblePosition | null;
};

export const EMPTY_RECENT_THREAD_BUBBLE_SNAPSHOT: RecentThreadBubbleSnapshot = {
  threads: [],
  position: null,
};

type PersistedRecentThreadBubbleSnapshot = RecentThreadBubbleSnapshot & {
  readonly version: typeof RECENT_THREAD_BUBBLE_SNAPSHOT_VERSION;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function decodeTimestamp(value: unknown): string | null {
  if (
    typeof value !== "string" ||
    value.length > RECENT_THREAD_BUBBLE_MAX_TIMESTAMP_LENGTH ||
    !Number.isFinite(Date.parse(value))
  ) {
    return null;
  }
  return value;
}

function decodeEntry(value: unknown, version: 1 | 2): RecentThreadBubbleEntry | null {
  if (!isRecord(value)) {
    return null;
  }

  const environmentId = value.environmentId;
  const threadId = value.threadId;
  const title = value.title;
  const projectTitle = value.projectTitle;
  if (
    typeof environmentId !== "string" ||
    environmentId.trim().length === 0 ||
    typeof threadId !== "string" ||
    threadId.trim().length === 0 ||
    typeof title !== "string" ||
    typeof projectTitle !== "string"
  ) {
    return null;
  }

  return {
    environmentId,
    threadId,
    title: title.slice(0, RECENT_THREAD_BUBBLE_MAX_TITLE_LENGTH),
    projectTitle: projectTitle.slice(0, RECENT_THREAD_BUBBLE_MAX_PROJECT_TITLE_LENGTH),
    lastAcknowledgedAt: version === 1 ? null : decodeTimestamp(value.lastAcknowledgedAt),
  };
}

function decodePosition(value: unknown): RecentThreadBubblePosition | null {
  if (!isRecord(value)) {
    return null;
  }
  const x = value.x;
  const y = value.y;
  if (
    typeof x !== "number" ||
    !Number.isFinite(x) ||
    typeof y !== "number" ||
    !Number.isFinite(y)
  ) {
    return null;
  }
  return {
    x: Math.min(1, Math.max(0, x)),
    y: Math.min(1, Math.max(0, y)),
  };
}

export function decodeRecentThreadBubbleSnapshot(input: unknown): RecentThreadBubbleSnapshot {
  if (!isRecord(input) || (input.version !== 1 && input.version !== 2)) {
    return EMPTY_RECENT_THREAD_BUBBLE_SNAPSHOT;
  }

  const threads: RecentThreadBubbleEntry[] = [];
  if (Array.isArray(input.threads)) {
    for (const value of input.threads) {
      const entry = decodeEntry(value, input.version);
      if (
        entry !== null &&
        !threads.some(
          (candidate) =>
            candidate.environmentId === entry.environmentId &&
            candidate.threadId === entry.threadId,
        )
      ) {
        threads.push(entry);
      }
      if (threads.length === RECENT_THREAD_BUBBLE_MAX_THREADS) {
        break;
      }
    }
  }

  return {
    threads,
    position: decodePosition(input.position),
  };
}

export function encodeRecentThreadBubbleSnapshot(
  snapshot: RecentThreadBubbleSnapshot,
): PersistedRecentThreadBubbleSnapshot {
  return {
    version: RECENT_THREAD_BUBBLE_SNAPSHOT_VERSION,
    threads: snapshot.threads.slice(0, RECENT_THREAD_BUBBLE_MAX_THREADS).map((thread) => ({
      ...thread,
      title: thread.title.slice(0, RECENT_THREAD_BUBBLE_MAX_TITLE_LENGTH),
      projectTitle: thread.projectTitle.slice(0, RECENT_THREAD_BUBBLE_MAX_PROJECT_TITLE_LENGTH),
      lastAcknowledgedAt: decodeTimestamp(thread.lastAcknowledgedAt),
    })),
    position: snapshot.position,
  };
}
