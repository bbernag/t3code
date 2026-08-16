import { describe, expect, it } from "vite-plus/test";

import {
  decodeRecentThreadBubbleSnapshot,
  EMPTY_RECENT_THREAD_BUBBLE_SNAPSHOT,
  encodeRecentThreadBubbleSnapshot,
} from "./recent-thread-bubble";

describe("recent thread bubble persistence", () => {
  it("round-trips a versioned snapshot", () => {
    const snapshot = {
      threads: [
        {
          environmentId: "environment-1",
          threadId: "thread-1",
          title: "Fix the build",
          projectTitle: "T3 Code",
          lastAcknowledgedAt: "2026-08-16T12:00:00.000Z",
        },
      ],
      position: { x: 0.8, y: 0.25 },
    } as const;

    expect(decodeRecentThreadBubbleSnapshot(encodeRecentThreadBubbleSnapshot(snapshot))).toEqual(
      snapshot,
    );
  });

  it("filters malformed thread entries and clamps normalized coordinates", () => {
    expect(
      decodeRecentThreadBubbleSnapshot({
        version: 1,
        threads: [
          {
            environmentId: "environment-1",
            threadId: "thread-1",
            title: "Valid",
            projectTitle: "Project",
          },
          { environmentId: "", threadId: "thread-2", title: "Invalid", projectTitle: "Project" },
          null,
        ],
        position: { x: 2, y: -1 },
      }),
    ).toEqual({
      threads: [
        {
          environmentId: "environment-1",
          threadId: "thread-1",
          title: "Valid",
          projectTitle: "Project",
          lastAcknowledgedAt: null,
        },
      ],
      position: { x: 1, y: 0 },
    });
  });

  it("migrates version-one entries without surfacing historical attention", () => {
    expect(
      decodeRecentThreadBubbleSnapshot({
        version: 1,
        threads: [
          {
            environmentId: "environment-1",
            threadId: "thread-1",
            title: "Legacy",
            projectTitle: "Project",
          },
        ],
        position: null,
      }).threads,
    ).toEqual([
      {
        environmentId: "environment-1",
        threadId: "thread-1",
        title: "Legacy",
        projectTitle: "Project",
        lastAcknowledgedAt: null,
      },
    ]);
  });

  it("drops malformed acknowledgement timestamps", () => {
    expect(
      decodeRecentThreadBubbleSnapshot({
        version: 2,
        threads: [
          {
            environmentId: "environment-1",
            threadId: "thread-1",
            title: "Thread",
            projectTitle: "Project",
            lastAcknowledgedAt: "not-a-date",
          },
        ],
        position: null,
      }).threads[0]?.lastAcknowledgedAt,
    ).toBeNull();
  });

  it("deduplicates and bounds persisted history", () => {
    const threads = Array.from({ length: 8 }, (_, index) => ({
      environmentId: "environment-1",
      threadId: index === 1 ? "thread-0" : `thread-${index}`,
      title: `Thread ${index}`,
      projectTitle: "Project",
      lastAcknowledgedAt: null,
    }));

    expect(decodeRecentThreadBubbleSnapshot({ version: 2, threads }).threads).toEqual([
      threads[0],
      threads[2],
      threads[3],
      threads[4],
      threads[5],
    ]);
  });

  it("bounds persisted display metadata", () => {
    const encoded = encodeRecentThreadBubbleSnapshot({
      threads: [
        {
          environmentId: "environment-1",
          threadId: "thread-1",
          title: "t".repeat(500),
          projectTitle: "p".repeat(500),
          lastAcknowledgedAt: null,
        },
      ],
      position: null,
    });

    expect(encoded.threads[0]?.title).toHaveLength(240);
    expect(encoded.threads[0]?.projectTitle).toHaveLength(120);
  });

  it("returns an empty snapshot for unknown versions", () => {
    expect(decodeRecentThreadBubbleSnapshot({ version: 3, threads: [] })).toBe(
      EMPTY_RECENT_THREAD_BUBBLE_SNAPSHOT,
    );
  });
});
