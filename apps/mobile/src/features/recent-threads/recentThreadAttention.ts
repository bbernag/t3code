import type { OrchestrationLatestTurn, OrchestrationSession } from "@t3tools/contracts";

import type { RecentThreadBubbleEntry } from "../../persistence/imperative";
import { recentThreadKey } from "./recentThreads";

export type RecentThreadAttentionKind = "approval" | "input" | "completed";
export type RecentThreadOperationalStatusKind = "working" | "monitoring";
export type RecentThreadStatusKind = RecentThreadAttentionKind | RecentThreadOperationalStatusKind;

export type RecentThreadAttentionSignal = {
  readonly kind: RecentThreadAttentionKind;
  readonly occurredAt: string;
};
export type RecentThreadLiveActivity = {
  readonly id: string;
  readonly status: RecentThreadOperationalStatusKind;
};

export type RecentThreadBubbleItem = {
  readonly attentionOccurredAt: string | null;
  /** Undefined while the route intentionally does not observe this shell. */
  readonly liveActivity: RecentThreadLiveActivity | null | undefined;
  readonly thread: RecentThreadBubbleEntry;
  readonly status: RecentThreadStatusKind | null;
};

export type RecentThreadStatusShell = {
  readonly backgroundLiveness?: "working" | "monitoring" | null;
  readonly hasPendingApprovals: boolean;
  readonly hasPendingUserInput: boolean;
  readonly latestTurn:
    | (Pick<OrchestrationLatestTurn, "completedAt" | "state"> &
        Partial<Pick<OrchestrationLatestTurn, "turnId">>)
    | null;
  readonly session:
    | (Pick<OrchestrationSession, "status"> &
        Partial<Pick<OrchestrationSession, "activeTurnId" | "updatedAt">>)
    | null;
  readonly updatedAt: string;
};

function timestampValue(value: string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function resolveRecentThreadAttentionSignal(
  shell: RecentThreadStatusShell,
): RecentThreadAttentionSignal | null {
  const updatedAt = timestampValue(shell.updatedAt);
  if (shell.hasPendingApprovals && updatedAt !== null) {
    return { kind: "approval", occurredAt: shell.updatedAt };
  }
  if (shell.hasPendingUserInput && updatedAt !== null) {
    return { kind: "input", occurredAt: shell.updatedAt };
  }

  const completedAt = shell.latestTurn?.completedAt ?? null;
  if (
    (shell.latestTurn?.state === "completed" || shell.latestTurn?.state === "interrupted") &&
    completedAt !== null &&
    timestampValue(completedAt) !== null
  ) {
    return { kind: "completed", occurredAt: completedAt };
  }
  return null;
}

export function isRecentThreadSignalUnseen(
  signal: RecentThreadAttentionSignal,
  lastAcknowledgedAt: string | null,
): boolean {
  const signalValue = timestampValue(signal.occurredAt);
  const acknowledgedValue = timestampValue(lastAcknowledgedAt);
  return signalValue !== null && acknowledgedValue !== null && signalValue > acknowledgedValue;
}

export function resolveRecentThreadAcknowledgementBaseline(
  shell: RecentThreadStatusShell,
): string | null {
  const signal = resolveRecentThreadAttentionSignal(shell);
  if (signal !== null) return signal.occurredAt;
  return timestampValue(shell.updatedAt) === null ? null : shell.updatedAt;
}

/** Live right now: the agent is working or monitoring, regardless of acknowledgements. */
export function resolveRecentThreadLiveStatus(
  shell: RecentThreadStatusShell,
): RecentThreadOperationalStatusKind | null {
  if (
    shell.session?.status === "starting" ||
    shell.session?.status === "running" ||
    shell.latestTurn?.state === "running" ||
    shell.backgroundLiveness === "working"
  ) {
    return "working";
  }
  return shell.backgroundLiveness === "monitoring" ? "monitoring" : null;
}

export function resolveRecentThreadLiveActivity(
  shell: RecentThreadStatusShell,
): RecentThreadLiveActivity | null {
  const status = resolveRecentThreadLiveStatus(shell);
  if (status === null) return null;

  const activeTurnId = shell.session?.activeTurnId;
  if (activeTurnId !== null && activeTurnId !== undefined) {
    return { id: `turn:${String(activeTurnId)}`, status };
  }
  if (shell.latestTurn?.state === "running" && shell.latestTurn.turnId !== undefined) {
    return { id: `turn:${String(shell.latestTurn.turnId)}`, status };
  }
  if (shell.session?.status === "starting" || shell.session?.status === "running") {
    return { id: `session:${shell.session.updatedAt ?? shell.updatedAt}`, status };
  }
  if (shell.latestTurn?.turnId !== undefined) {
    return { id: `background:${String(shell.latestTurn.turnId)}`, status };
  }
  return { id: `background:${status}:${shell.updatedAt}`, status };
}

export function resolveRecentThreadStatus(
  shell: RecentThreadStatusShell | null,
  lastAcknowledgedAt: string | null,
): RecentThreadStatusKind | null {
  if (shell === null) return null;

  const attention = resolveRecentThreadAttentionSignal(shell);
  if (attention?.kind === "approval" || attention?.kind === "input") {
    return isRecentThreadSignalUnseen(attention, lastAcknowledgedAt) ? attention.kind : null;
  }

  const live = resolveRecentThreadLiveStatus(shell);
  if (live !== null) return live;
  return attention !== null && isRecentThreadSignalUnseen(attention, lastAcknowledgedAt)
    ? "completed"
    : null;
}

export function isRecentThreadAttentionStatus(
  status: RecentThreadStatusKind | null,
): status is RecentThreadAttentionKind {
  return status === "approval" || status === "input" || status === "completed";
}

/**
 * The bubble summons for attention, or for active work the user has not
 * dismissed away; passive monitoring alone stays quiet. Muted keys come from
 * drag-to-dismiss and clear once the muted chat settles.
 */
export function shouldSummonRecentThreadsBubble(
  items: ReadonlyArray<RecentThreadBubbleItem>,
  mutedLiveActivities: ReadonlyMap<string, string>,
): boolean {
  return items.some(
    (item) =>
      isRecentThreadAttentionStatus(item.status) ||
      (item.status === "working" &&
        (item.liveActivity === null ||
          item.liveActivity === undefined ||
          mutedLiveActivities.get(recentThreadKey(item.thread)) !== item.liveActivity.id)),
  );
}

/** Live activity identities a dismissal should mute until they settle or change. */
export function recentThreadLiveActivityMutes(
  items: ReadonlyArray<RecentThreadBubbleItem>,
): Map<string, string> {
  const mutes = new Map<string, string>();
  for (const item of items) {
    if (item.liveActivity !== null && item.liveActivity !== undefined) {
      mutes.set(recentThreadKey(item.thread), item.liveActivity.id);
    }
  }
  return mutes;
}

export function pruneRecentThreadLiveActivityMutes(input: {
  readonly items: ReadonlyArray<RecentThreadBubbleItem>;
  readonly knownThreadKeys: ReadonlySet<string>;
  readonly mutes: ReadonlyMap<string, string>;
}): ReadonlyMap<string, string> {
  if (input.mutes.size === 0) return input.mutes;

  const itemsByKey = new Map(input.items.map((item) => [recentThreadKey(item.thread), item]));
  let next: Map<string, string> | null = null;
  for (const [key, mutedActivityId] of input.mutes) {
    const item = itemsByKey.get(key);
    const shouldRemove =
      !input.knownThreadKeys.has(key) ||
      (item !== undefined &&
        item.liveActivity !== undefined &&
        (item.liveActivity === null || item.liveActivity.id !== mutedActivityId));
    if (!shouldRemove) continue;
    next ??= new Map(input.mutes);
    next.delete(key);
  }
  return next ?? input.mutes;
}

/** Menu rows: only chats with a live status; quiet history stays stored but hidden. */
export function recentThreadItemsWithActivity(
  items: ReadonlyArray<RecentThreadBubbleItem>,
): ReadonlyArray<RecentThreadBubbleItem> {
  return items.filter((item) => item.status !== null);
}

/** True while any off-screen chat has an agent actively working. */
export function hasRecentThreadWorking(items: ReadonlyArray<RecentThreadBubbleItem>): boolean {
  return items.some((item) => item.status === "working");
}

export function countRecentThreadsNeedingAttention(
  items: ReadonlyArray<RecentThreadBubbleItem>,
): number {
  let count = 0;
  for (const item of items) {
    if (isRecentThreadAttentionStatus(item.status)) count += 1;
  }
  return count;
}

export function recentThreadsBubbleAccessibilityLabel(input: {
  readonly attentionCount: number;
  readonly working: boolean;
}): string {
  const parts = ["Recent activity"];
  if (input.attentionCount > 0) {
    parts.push(
      `${input.attentionCount} ${input.attentionCount === 1 ? "needs" : "need"} attention`,
    );
  }
  if (input.working) parts.push("agent working");
  return parts.join(", ");
}
