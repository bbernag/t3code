import { useEffect } from "react";

import type { RecentThreadBubbleEntry } from "../../persistence/imperative";
import { useProjects, useThreadShells } from "../../state/entities";
import { resolveRecentThreadLiveStatus } from "./recentThreadAttention";
import {
  observeWorkingRecentThreads,
  type RecentThreadRef,
  type RecentThreadWorkingObservation,
} from "./recentThreads";

// Mounted only on bubble routes so the app-wide shell subscription it needs
// never runs elsewhere. Chats actively working anywhere — including ones
// started from desktop or web — enter the recent list so the bubble can
// surface them now and flag their completions later through the normal
// acknowledgement pipeline. Passive monitoring threads are not imported.
export function LiveThreadRecorder(props: {
  readonly activeThread: RecentThreadRef | null;
  readonly onObserveWorkingThreads: (observation: RecentThreadWorkingObservation) => void;
  readonly previousWorkingThreadKeysRef: { current: ReadonlySet<string> };
}) {
  const projects = useProjects();
  const threadShells = useThreadShells();

  useEffect(() => {
    const projectTitles = new Map(
      projects.map((project) => [`${project.environmentId}:${project.id}`, project.title]),
    );
    const workingThreads: RecentThreadBubbleEntry[] = [];
    for (const shell of threadShells) {
      if (shell.archivedAt !== null || resolveRecentThreadLiveStatus(shell) !== "working") continue;
      workingThreads.push({
        environmentId: String(shell.environmentId),
        threadId: String(shell.id),
        title: shell.title,
        projectTitle: projectTitles.get(`${shell.environmentId}:${shell.projectId}`) ?? "",
        lastAcknowledgedAt: null,
      });
    }
    const observation = observeWorkingRecentThreads({
      activeThread: props.activeThread,
      previousWorkingThreadKeys: props.previousWorkingThreadKeysRef.current,
      workingThreads,
    });
    props.previousWorkingThreadKeysRef.current = observation.workingThreadKeys;
    props.onObserveWorkingThreads(observation);
  }, [
    projects,
    props.activeThread,
    props.onObserveWorkingThreads,
    props.previousWorkingThreadKeysRef,
    threadShells,
  ]);

  return null;
}
