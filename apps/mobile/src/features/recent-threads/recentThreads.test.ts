import { describe, expect, it } from "vite-plus/test";

import type { RecentThreadBubbleEntry } from "../../persistence/imperative";
import {
  acknowledgeRecentThread,
  departedThreadFromTransition,
  hydrateRecentThreadSnapshot,
  initializeRecentThreadAcknowledgements,
  isRecentThreadsBubbleRoute,
  mergeRecentThreads,
  recordDepartedThread,
  visibleRecentThreads,
} from "./recentThreads";

function thread(
  threadId: string,
  environmentId = "environment-1",
  title = `Thread ${threadId}`,
  lastAcknowledgedAt: string | null = null,
): RecentThreadBubbleEntry {
  return { environmentId, threadId, title, projectTitle: "T3 Code", lastAcknowledgedAt };
}

describe("recent thread history", () => {
  it("records only real departures, not initial or nested-route observations", () => {
    const a = thread("a");

    expect(departedThreadFromTransition(undefined, a)).toBeNull();
    expect(departedThreadFromTransition(null, a)).toBeNull();
    expect(departedThreadFromTransition(a, a)).toBeNull();
    expect(departedThreadFromTransition(a, null)).toBe(a);
    expect(departedThreadFromTransition(a, thread("b"))).toBe(a);
  });

  it("prepends a departed thread, deduplicates it, and preserves useful metadata", () => {
    const current = [thread("b"), thread("a", "environment-1", "A useful title")];

    expect(recordDepartedThread(current, thread("a", "environment-1", ""))).toEqual([
      thread("a", "environment-1", "A useful title"),
      thread("b"),
    ]);
  });

  it("preserves the newest acknowledgement when metadata is refreshed", () => {
    const acknowledgedAt = "2026-08-16T12:00:00.000Z";
    const existing = thread("a", "environment-1", "Useful title", acknowledgedAt);

    expect(
      recordDepartedThread(
        [existing],
        thread("a", "environment-1", "Updated title", "2026-08-16T11:00:00.000Z"),
      ),
    ).toEqual([thread("a", "environment-1", "Updated title", acknowledgedAt)]);
  });

  it("acknowledges one chat monotonically without changing recent order", () => {
    const threads = [thread("a"), thread("b")];
    const acknowledged = acknowledgeRecentThread(
      threads,
      { environmentId: "environment-1", threadId: "b" },
      "2026-08-16T12:00:00.000Z",
    );

    expect(acknowledged).toEqual([
      thread("a"),
      thread("b", "environment-1", "Thread b", "2026-08-16T12:00:00.000Z"),
    ]);
    expect(
      acknowledgeRecentThread(
        acknowledged,
        { environmentId: "environment-1", threadId: "b" },
        "2026-08-16T11:00:00.000Z",
      ),
    ).toBe(acknowledged);
  });

  it("initializes only missing acknowledgement cursors", () => {
    const alreadyReadAt = "2026-08-16T10:00:00.000Z";
    const threads = [
      thread("a", "environment-1", "Thread a", alreadyReadAt),
      thread("b"),
      thread("c"),
    ];

    expect(
      initializeRecentThreadAcknowledgements(threads, [
        {
          thread: { environmentId: "environment-1", threadId: "a" },
          acknowledgedAt: "2026-08-16T13:00:00.000Z",
        },
        {
          thread: { environmentId: "environment-1", threadId: "b" },
          acknowledgedAt: "2026-08-16T12:00:00.000Z",
        },
      ]),
    ).toEqual([
      thread("a", "environment-1", "Thread a", alreadyReadAt),
      thread("b", "environment-1", "Thread b", "2026-08-16T12:00:00.000Z"),
      thread("c"),
    ]);
  });

  it("keeps at most five scoped thread identities", () => {
    const current = [thread("a"), thread("b"), thread("c"), thread("d"), thread("e")];

    expect(recordDepartedThread(current, thread("f"))).toEqual([
      thread("f"),
      thread("a"),
      thread("b"),
      thread("c"),
      thread("d"),
    ]);
    expect(recordDepartedThread([thread("same", "one")], thread("same", "two"))).toHaveLength(2);
  });

  it("merges departures that happened while persisted history was loading", () => {
    expect(mergeRecentThreads([thread("new")], [thread("old"), thread("new")])).toEqual([
      thread("new"),
      thread("old"),
    ]);
    expect(
      hydrateRecentThreadSnapshot({
        current: { threads: [thread("new")], position: null },
        persisted: {
          threads: [thread("old"), thread("new")],
          position: { x: 0.2, y: 0.3 },
        },
        changes: { position: false, threads: "merge" },
      }),
    ).toEqual({
      threads: [thread("new"), thread("old")],
      position: { x: 0.2, y: 0.3 },
    });
  });

  it("preserves a pre-hydration position change", () => {
    expect(
      hydrateRecentThreadSnapshot({
        current: { threads: [], position: null },
        persisted: { threads: [], position: { x: 0.2, y: 0.3 } },
        changes: { position: true, threads: "unchanged" },
      }),
    ).toEqual({ threads: [], position: null });
  });

  it("excludes the active scoped thread without deleting it", () => {
    const threads = [thread("a", "one"), thread("a", "two"), thread("b", "one")];

    expect(visibleRecentThreads(threads, { environmentId: "one", threadId: "a" })).toEqual([
      thread("a", "two"),
      thread("b", "one"),
    ]);
    expect(threads).toHaveLength(3);
    expect(visibleRecentThreads(threads, { environmentId: "one", threadId: "missing" })).toBe(
      threads,
    );
  });

  it("shows only on open thread destinations", () => {
    for (const route of ["Thread", "ThreadFile", "ThreadFiles", "ThreadReview", "ThreadTerminal"]) {
      expect(isRecentThreadsBubbleRoute(route)).toBe(true);
    }
    for (const route of [
      "Home",
      "NewTaskSheet",
      "SettingsSheet",
      "GitOverview",
      "Connections",
      "ThreadReviewComment",
      null,
    ]) {
      expect(isRecentThreadsBubbleRoute(route)).toBe(false);
    }
  });
});
