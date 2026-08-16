import { describe, expect, it } from "vite-plus/test";

import type { RecentThreadBubbleEntry } from "../../persistence/imperative";
import {
  departedThreadFromTransition,
  hydrateRecentThreadSnapshot,
  isRecentThreadsBubbleRoute,
  mergeRecentThreads,
  recordDepartedThread,
  visibleRecentThreads,
} from "./recentThreads";

function thread(
  threadId: string,
  environmentId = "environment-1",
  title = `Thread ${threadId}`,
): RecentThreadBubbleEntry {
  return { environmentId, threadId, title, projectTitle: "T3 Code" };
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
  });

  it("does not restore persisted history after an explicit pre-hydration clear", () => {
    expect(
      hydrateRecentThreadSnapshot({
        current: { threads: [], position: null },
        persisted: { threads: [thread("old")], position: { x: 0.2, y: 0.3 } },
        changes: { position: false, threads: "replace" },
      }),
    ).toEqual({ threads: [], position: { x: 0.2, y: 0.3 } });

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
