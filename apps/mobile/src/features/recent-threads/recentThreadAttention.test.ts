import { TurnId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  countRecentThreadsNeedingAttention,
  hasRecentThreadWorking,
  isRecentThreadSignalUnseen,
  recentThreadItemsWithActivity,
  recentThreadLiveActivityMutes,
  recentThreadsBubbleAccessibilityLabel,
  pruneRecentThreadLiveActivityMutes,
  resolveRecentThreadAcknowledgementBaseline,
  resolveRecentThreadAttentionSignal,
  resolveRecentThreadImportBaseline,
  resolveRecentThreadLiveActivity,
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
    liveActivity:
      status === "working" || status === "monitoring" ? { id: `turn:${threadId}`, status } : null,
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

  it("imports recorder threads with a baseline before the current run", () => {
    const requestedAt = "2026-08-16T11:30:00.000Z";
    const running = shell({
      hasPendingApprovals: true,
      latestTurn: { state: "running", completedAt: null, requestedAt },
    });
    const baseline = resolveRecentThreadImportBaseline(running);

    expect(baseline).toBe("2026-08-16T11:29:59.999Z");
    expect(isRecentThreadSignalUnseen({ kind: "approval", occurredAt: UPDATED_AT }, baseline)).toBe(
      true,
    );
    expect(
      isRecentThreadSignalUnseen(
        { kind: "completed", occurredAt: "2026-08-16T12:05:00.000Z" },
        baseline,
      ),
    ).toBe(true);
    expect(
      isRecentThreadSignalUnseen({ kind: "completed", occurredAt: COMPLETED_AT }, baseline),
    ).toBe(false);
  });

  it("keeps a background-work completion unseen on import", () => {
    const imported = shell({
      backgroundLiveness: "working",
      latestTurn: {
        state: "completed",
        completedAt: COMPLETED_AT,
        requestedAt: "2026-08-16T10:30:00.000Z",
      },
    });
    const baseline = resolveRecentThreadImportBaseline(imported);

    expect(baseline).toBe("2026-08-16T10:29:59.999Z");
    expect(
      isRecentThreadSignalUnseen({ kind: "completed", occurredAt: COMPLETED_AT }, baseline),
    ).toBe(true);
  });

  it("falls back to the acknowledgement baseline when an import has no turn", () => {
    expect(resolveRecentThreadImportBaseline(shell())).toBe(
      resolveRecentThreadAcknowledgementBaseline(shell()),
    );
    expect(
      resolveRecentThreadImportBaseline(
        shell({ latestTurn: { state: "running", completedAt: null } }),
      ),
    ).toBe(resolveRecentThreadAcknowledgementBaseline(shell()));
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

  it("identifies live work by turn while keeping background work on its originating turn", () => {
    expect(
      resolveRecentThreadLiveActivity(
        shell({
          session: {
            status: "running",
            activeTurnId: TurnId.make("turn-1"),
            updatedAt: "2026-08-16T11:59:00.000Z",
          },
        }),
      ),
    ).toEqual({ id: "turn:turn-1", status: "working" });
    expect(
      resolveRecentThreadLiveActivity(
        shell({
          backgroundLiveness: "working",
          latestTurn: {
            turnId: TurnId.make("turn-1"),
            state: "completed",
            completedAt: COMPLETED_AT,
          },
        }),
      ),
    ).toEqual({ id: "background:turn-1", status: "working" });
    expect(resolveRecentThreadLiveActivity(shell({ backgroundLiveness: "working" }))).toEqual({
      id: "background:working",
      status: "working",
    });
  });

  it("summons the bubble for work and attention but not passive monitoring", () => {
    const noMutes = new Map<string, string>();

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
    const approvalWhileWorking = {
      ...item("approval", "approval"),
      liveActivity: { id: "turn:approval", status: "working" as const },
    };
    const mutes = recentThreadLiveActivityMutes([
      working,
      item("monitoring", "monitoring"),
      approvalWhileWorking,
    ]);

    expect(mutes.size).toBe(3);
    expect(shouldSummonRecentThreadsBubble([working], mutes)).toBe(false);
    expect(shouldSummonRecentThreadsBubble([approvalWhileWorking], mutes)).toBe(true);
    expect(shouldSummonRecentThreadsBubble([working, item("fresh", "working")], mutes)).toBe(true);
    expect(shouldSummonRecentThreadsBubble([item("working", "completed")], mutes)).toBe(true);
  });

  it("preserves mutes while shells are hidden and clears them on settle or a new run", () => {
    const working = item("working", "working");
    const key = "environment-1:working";
    const mutes = recentThreadLiveActivityMutes([working]);
    const hidden = { ...working, liveActivity: undefined, status: null };

    expect(
      pruneRecentThreadLiveActivityMutes({
        items: [hidden],
        knownThreadKeys: new Set([key]),
        mutes,
      }),
    ).toBe(mutes);
    expect(
      pruneRecentThreadLiveActivityMutes({
        items: [{ ...working, liveActivity: null, status: null }],
        knownThreadKeys: new Set([key]),
        mutes,
      }),
    ).toEqual(new Map());
    expect(
      pruneRecentThreadLiveActivityMutes({
        items: [{ ...working, liveActivity: { id: "turn:new", status: "working" } }],
        knownThreadKeys: new Set([key]),
        mutes,
      }),
    ).toEqual(new Map());
    expect(
      shouldSummonRecentThreadsBubble(
        [{ ...working, liveActivity: { id: "turn:new", status: "working" } }],
        mutes,
      ),
    ).toBe(true);
  });

  it("keeps a dismiss mute while a bubble-route shell is missing", () => {
    const working = item("working", "working");
    const key = "environment-1:working";
    const mutes = recentThreadLiveActivityMutes([working]);
    const unknown = { ...working, liveActivity: undefined, status: null };

    expect(
      pruneRecentThreadLiveActivityMutes({
        items: [unknown],
        knownThreadKeys: new Set([key]),
        mutes,
      }),
    ).toBe(mutes);
  });

  it("flags active work for the ring only while a chat is working", () => {
    const noMutes = new Map<string, string>();
    const working = item("working", "working");

    expect(hasRecentThreadWorking([working, item("idle", null)], noMutes)).toBe(true);
    expect(hasRecentThreadWorking([working], recentThreadLiveActivityMutes([working]))).toBe(false);
    expect(
      hasRecentThreadWorking(
        [working],
        recentThreadLiveActivityMutes([
          { ...working, liveActivity: { id: "turn:stale", status: "working" } },
        ]),
      ),
    ).toBe(true);
    expect(hasRecentThreadWorking([{ ...working, liveActivity: null }], noMutes)).toBe(true);
    expect(
      hasRecentThreadWorking(
        [
          item("approval", "approval"),
          item("done", "completed"),
          item("monitoring", "monitoring"),
          item("idle", null),
        ],
        noMutes,
      ),
    ).toBe(false);
    expect(hasRecentThreadWorking([], noMutes)).toBe(false);
  });

  it("describes attention counts and active work accessibly", () => {
    expect(recentThreadsBubbleAccessibilityLabel({ attentionCount: 0, working: false })).toBe(
      "Recent activity",
    );
    expect(recentThreadsBubbleAccessibilityLabel({ attentionCount: 1, working: false })).toBe(
      "Recent activity, 1 needs attention",
    );
    expect(recentThreadsBubbleAccessibilityLabel({ attentionCount: 2, working: false })).toBe(
      "Recent activity, 2 need attention",
    );
    expect(recentThreadsBubbleAccessibilityLabel({ attentionCount: 0, working: true })).toBe(
      "Recent activity, agent working",
    );
    expect(recentThreadsBubbleAccessibilityLabel({ attentionCount: 2, working: true })).toBe(
      "Recent activity, 2 need attention, agent working",
    );
  });
});
