import { useEffect } from "react";

import type { RecentThreadBubbleEntry } from "../../persistence/imperative";
import { useProjects, useThreadShells } from "../../state/entities";
import { resolveRecentThreadLiveActivity } from "./recentThreadAttention";
import {
  observeWorkingRecentThreads,
  type RecentThreadRef,
  type RecentThreadWorkingObservation,
  type RecentThreadWorkingRun,
} from "./recentThreads";

// Mounted only on bubble routes so the app-wide shell subscription it needs
// never runs elsewhere. Chats actively working anywhere — including ones
// started from desktop or web — enter the recent list so the bubble can
// surface them now and flag their completions later through the normal
// acknowledgement pipeline. Passive monitoring threads are not imported.
export function LiveThreadRecorder(props: {
  readonly activeThread: RecentThreadRef | null;
  readonly onObserveWorkingThreads: (observation: RecentThreadWorkingObservation) => void;
  readonly previousWorkingActivitiesRef: { current: ReadonlyMap<string, string> };
}) {
  const projects = useProjects();
  const threadShells = useThreadShells();

  useEffect(() => {
    const projectTitles = new Map(
      projects.map((project) => [`${project.environmentId}:${project.id}`, project.title]),
    );
    const workingRuns: RecentThreadWorkingRun[] = [];
    for (const shell of threadShells) {
      if (shell.archivedAt !== null) continue;
      const liveActivity = resolveRecentThreadLiveActivity(shell);
      if (liveActivity?.status !== "working") continue;
      const thread: RecentThreadBubbleEntry = {
        environmentId: String(shell.environmentId),
        threadId: String(shell.id),
        title: shell.title,
        projectTitle: projectTitles.get(`${shell.environmentId}:${shell.projectId}`) ?? "",
        lastAcknowledgedAt: null,
      };
      workingRuns.push({ activityId: liveActivity.id, thread });
    }
    const observation = observeWorkingRecentThreads({
      activeThread: props.activeThread,
      previousWorkingActivities: props.previousWorkingActivitiesRef.current,
      workingRuns,
    });
    props.previousWorkingActivitiesRef.current = observation.workingActivities;
    props.onObserveWorkingThreads(observation);
  }, [
    projects,
    props.activeThread,
    props.onObserveWorkingThreads,
    props.previousWorkingActivitiesRef,
    threadShells,
  ]);

  return null;
}
