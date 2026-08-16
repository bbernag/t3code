import type { OrchestrationLatestTurn, OrchestrationSession } from "@t3tools/contracts";

import type { RecentThreadBubbleEntry } from "../../persistence/imperative";

export type RecentThreadAttentionKind = "approval" | "input" | "completed";
export type RecentThreadOperationalStatusKind = "working" | "monitoring";
export type RecentThreadStatusKind = RecentThreadAttentionKind | RecentThreadOperationalStatusKind;

export type RecentThreadAttentionSignal = {
  readonly kind: RecentThreadAttentionKind;
  readonly occurredAt: string;
};

export type RecentThreadBubbleItem = {
  readonly attentionOccurredAt: string | null;
  readonly thread: RecentThreadBubbleEntry;
  readonly status: RecentThreadStatusKind | null;
};

export type RecentThreadStatusShell = {
  readonly backgroundLiveness?: "working" | "monitoring" | null;
  readonly hasPendingApprovals: boolean;
  readonly hasPendingUserInput: boolean;
  readonly latestTurn: Pick<OrchestrationLatestTurn, "completedAt" | "state"> | null;
  readonly session: Pick<OrchestrationSession, "status"> | null;
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

export function resolveRecentThreadStatus(
  shell: RecentThreadStatusShell | null,
  lastAcknowledgedAt: string | null,
): RecentThreadStatusKind | null {
  if (shell === null) return null;

  const attention = resolveRecentThreadAttentionSignal(shell);
  if (attention?.kind === "approval" || attention?.kind === "input") {
    return isRecentThreadSignalUnseen(attention, lastAcknowledgedAt) ? attention.kind : null;
  }

  if (
    shell.session?.status === "starting" ||
    shell.session?.status === "running" ||
    shell.latestTurn?.state === "running" ||
    shell.backgroundLiveness === "working"
  ) {
    return "working";
  }
  if (shell.backgroundLiveness === "monitoring") return "monitoring";
  return attention !== null && isRecentThreadSignalUnseen(attention, lastAcknowledgedAt)
    ? "completed"
    : null;
}

export function isRecentThreadAttentionStatus(
  status: RecentThreadStatusKind | null,
): status is RecentThreadAttentionKind {
  return status === "approval" || status === "input" || status === "completed";
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

export function recentThreadsBubbleAccessibilityLabel(attentionCount: number): string {
  if (attentionCount <= 0) return "Recent chats";
  return `Recent chats, ${attentionCount} ${attentionCount === 1 ? "needs" : "need"} attention`;
}
