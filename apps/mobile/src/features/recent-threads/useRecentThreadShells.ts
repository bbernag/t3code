import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/shell";
import { EnvironmentId, ThreadId, type ScopedThreadRef } from "@t3tools/contracts";
import { useMemo } from "react";

import type { RecentThreadBubbleEntry } from "../../persistence/imperative";
import { useThreadShell } from "../../state/entities";
import { recentThreadKey } from "./recentThreads";

function toScopedThreadRef(thread: RecentThreadBubbleEntry | undefined): ScopedThreadRef | null {
  return thread === undefined
    ? null
    : {
        environmentId: EnvironmentId.make(thread.environmentId),
        threadId: ThreadId.make(thread.threadId),
      };
}

/** Subscribes to the fixed, persisted maximum of five recent thread shells. */
export function useRecentThreadShells(
  threads: ReadonlyArray<RecentThreadBubbleEntry>,
): ReadonlyMap<string, EnvironmentThreadShell> {
  const refs = useMemo(
    () => [0, 1, 2, 3, 4].map((index) => toScopedThreadRef(threads[index])),
    [threads],
  );
  const first = useThreadShell(refs[0] ?? null);
  const second = useThreadShell(refs[1] ?? null);
  const third = useThreadShell(refs[2] ?? null);
  const fourth = useThreadShell(refs[3] ?? null);
  const fifth = useThreadShell(refs[4] ?? null);

  return useMemo(() => {
    const shells = new Map<string, EnvironmentThreadShell>();
    for (const shell of [first, second, third, fourth, fifth]) {
      if (shell !== null) {
        shells.set(
          recentThreadKey({ environmentId: shell.environmentId, threadId: shell.id }),
          shell,
        );
      }
    }
    return shells;
  }, [fifth, first, fourth, second, third]);
}
