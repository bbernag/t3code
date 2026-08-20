import { describe, expect, it } from "vite-plus/test";

import {
  countRecentThreadsNeedingAttention,
  isRecentThreadSignalUnseen,
  recentThreadItemsWithActivity,
  recentThreadLiveKeys,
  recentThreadsBubbleAccessibilityLabel,
  resolveRecentThreadAcknowledgementBaseline,
  resolveRecentThreadAttentionSignal,
  resolveRecentThreadLiveStatus,
  resolveRecentThreadStatus,
  shouldSummonRecentThreadsBubble,
  type RecentThreadBubbleItem,
  type RecentThreadStatusShell,
} from "./recentThreadAttention";

const UPDATED_AT = "2026-08-16T12:00:00.000Z";
const COMPLETED_AT = "2026-08-16T11:00:00.000Z";

function shell(overrides: Partial<RecentThreadStatusShell> = {}): RecentThreadStatusShell {
  return {
    backgroundLiveness: null,
    hasPendingApprovals: false,
    hasPendingUserInput: false,
    latestTurn: null,
    session: null,
    updatedAt: UPDATED_AT,
    ...overrides,
  };
}

function item(threadId: string, status: RecentThreadBubbleItem["status"]): RecentThreadBubbleItem {
  return {
    attentionOccurredAt: null,
    thread: {
      environmentId: "environment-1",
      threadId,
      title: `Thread ${threadId}`,
      projectTitle: "T3 Code",
      lastAcknowledgedAt: null,
    },
    status,
  };
}

describe("recent thread attention", () => {
  it("prioritizes approval, then input, then a completed turn", () => {
    const completedTurn = { state: "completed", completedAt: COMPLETED_AT } as const;

    expect(
      resolveRecentThreadAttentionSignal(
        shell({
          hasPendingApprovals: true,
          hasPendingUserInput: true,
          latestTurn: completedTurn,
        }),
      ),
    ).toEqual({ kind: "approval", occurredAt: UPDATED_AT });
    expect(
      resolveRecentThreadAttentionSignal(
        shell({ hasPendingUserInput: true, latestTurn: completedTurn }),
      ),
    ).toEqual({ kind: "input", occurredAt: UPDATED_AT });
    expect(resolveRecentThreadAttentionSignal(shell({ latestTurn: completedTurn }))).toEqual({
      kind: "completed",
      occurredAt: COMPLETED_AT,
    });
  });

  it("recognizes teardown-raced completions but rejects errors and malformed timestamps", () => {
    expect(
      resolveRecentThreadAttentionSignal(
        shell({ latestTurn: { state: "interrupted", completedAt: COMPLETED_AT } }),
      ),
    ).toEqual({ kind: "completed", occurredAt: COMPLETED_AT });
    expect(
      resolveRecentThreadAttentionSignal(
        shell({ latestTurn: { state: "error", completedAt: COMPLETED_AT } }),
      ),
    ).toBeNull();
    expect(
      resolveRecentThreadAttentionSignal(
        shell({ latestTurn: { state: "completed", completedAt: "not-a-date" } }),
      ),
    ).toBeNull();
  });

  it("treats missing legacy cursors as read and only newer signals as unseen", () => {
    const signal = { kind: "completed", occurredAt: COMPLETED_AT } as const;

    expect(isRecentThreadSignalUnseen(signal, null)).toBe(false);
    expect(isRecentThreadSignalUnseen(signal, COMPLETED_AT)).toBe(false);
    expect(isRecentThreadSignalUnseen(signal, "2026-08-16T10:00:00.000Z")).toBe(true);
    expect(isRecentThreadSignalUnseen(signal, "not-a-date")).toBe(false);
  });

  it("uses the current signal or shell update as a migration baseline", () => {
    expect(
      resolveRecentThreadAcknowledgementBaseline(
        shell({ latestTurn: { state: "completed", completedAt: COMPLETED_AT } }),
      ),
    ).toBe(COMPLETED_AT);
    expect(resolveRecentThreadAcknowledgementBaseline(shell())).toBe(UPDATED_AT);
    expect(resolveRecentThreadAcknowledgementBaseline(shell({ updatedAt: "invalid" }))).toBeNull();
  });

  it("shows unseen attention and clears an acknowledged pending status", () => {
    const approval = shell({ hasPendingApprovals: true });
    const completed = shell({ latestTurn: { state: "completed", completedAt: COMPLETED_AT } });

    expect(resolveRecentThreadStatus(approval, "2026-08-16T10:00:00.000Z")).toBe("approval");
    expect(resolveRecentThreadStatus(approval, UPDATED_AT)).toBeNull();
    expect(resolveRecentThreadStatus(completed, "2026-08-16T10:00:00.000Z")).toBe("completed");
    expect(resolveRecentThreadStatus(completed, COMPLETED_AT)).toBeNull();
  });

  it("shows working and monitoring chats without counting them as attention", () => {
    expect(resolveRecentThreadStatus(shell({ session: { status: "running" } }), UPDATED_AT)).toBe(
      "working",
    );
    expect(
      resolveRecentThreadStatus(
        shell({ latestTurn: { state: "running", completedAt: null } }),
        UPDATED_AT,
      ),
    ).toBe("working");
    expect(resolveRecentThreadStatus(shell({ backgroundLiveness: "working" }), UPDATED_AT)).toBe(
      "working",
    );
    expect(resolveRecentThreadStatus(shell({ backgroundLiveness: "monitoring" }), UPDATED_AT)).toBe(
      "monitoring",
    );
    expect(
      resolveRecentThreadStatus(
        shell({
          backgroundLiveness: "working",
          latestTurn: { state: "completed", completedAt: COMPLETED_AT },
        }),
        "2026-08-16T10:00:00.000Z",
      ),
    ).toBe("working");

    expect(
      countRecentThreadsNeedingAttention([
        item("approval", "approval"),
        item("done", "completed"),
        item("working", "working"),
        item("monitoring", "monitoring"),
        item("idle", null),
      ]),
    ).toBe(2);
  });

  it("lists only chats with a live status in the menu", () => {
    const active = [
      item("approval", "approval"),
      item("done", "completed"),
      item("working", "working"),
    ];

    expect(
      recentThreadItemsWithActivity([...active, item("idle", null), item("quiet", null)]),
    ).toEqual(active);
    expect(recentThreadItemsWithActivity([item("idle", null)])).toEqual([]);
  });

  it("resolves a live status for running and monitoring chats regardless of acknowledgements", () => {
    expect(resolveRecentThreadLiveStatus(shell({ session: { status: "running" } }))).toBe(
      "working",
    );
    expect(resolveRecentThreadLiveStatus(shell({ session: { status: "starting" } }))).toBe(
      "working",
    );
    expect(
      resolveRecentThreadLiveStatus(shell({ latestTurn: { state: "running", completedAt: null } })),
    ).toBe("working");
    expect(resolveRecentThreadLiveStatus(shell({ backgroundLiveness: "working" }))).toBe("working");
    expect(resolveRecentThreadLiveStatus(shell({ backgroundLiveness: "monitoring" }))).toBe(
      "monitoring",
    );
    expect(
      resolveRecentThreadLiveStatus(
        shell({ hasPendingApprovals: true, session: { status: "running" } }),
      ),
    ).toBe("working");
    expect(resolveRecentThreadLiveStatus(shell())).toBeNull();
    expect(
      resolveRecentThreadLiveStatus(
        shell({ latestTurn: { state: "completed", completedAt: COMPLETED_AT } }),
      ),
    ).toBeNull();
  });

  it("summons the bubble for work and attention but not passive monitoring", () => {
    const noMutes = new Set<string>();

    expect(shouldSummonRecentThreadsBubble([item("working", "working")], noMutes)).toBe(true);
    expect(shouldSummonRecentThreadsBubble([item("done", "completed")], noMutes)).toBe(true);
    expect(shouldSummonRecentThreadsBubble([item("approval", "approval")], noMutes)).toBe(true);
    expect(
      shouldSummonRecentThreadsBubble(
        [item("monitoring", "monitoring"), item("idle", null)],
        noMutes,
      ),
    ).toBe(false);
    expect(shouldSummonRecentThreadsBubble([], noMutes)).toBe(false);
  });

  it("keeps dismissed live chats quiet but lets attention cut through the mute", () => {
    const working = item("working", "working");
    const mutes = recentThreadLiveKeys([working, item("monitoring", "monitoring")]);

    expect(mutes.size).toBe(2);
    expect(shouldSummonRecentThreadsBubble([working], mutes)).toBe(false);
    expect(shouldSummonRecentThreadsBubble([working, item("fresh", "working")], mutes)).toBe(true);
    expect(shouldSummonRecentThreadsBubble([item("working", "completed")], mutes)).toBe(true);
  });

  it("describes zero, one, and multiple attention chats accessibly", () => {
    expect(recentThreadsBubbleAccessibilityLabel(0)).toBe("Recent activity");
    expect(recentThreadsBubbleAccessibilityLabel(1)).toBe("Recent activity, 1 needs attention");
    expect(recentThreadsBubbleAccessibilityLabel(2)).toBe("Recent activity, 2 need attention");
  });
});
