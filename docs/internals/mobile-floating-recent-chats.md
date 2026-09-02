# Mobile floating recent chats

## Purpose

T3 Code users often keep several agents working at once and need to notice when
an off-screen thread starts, finishes, or needs a response. Searching the
complete thread list is unnecessarily expensive for that attention loop.

The feature is split into two phases:

1. An in-app floating recent-chat launcher shared by the iOS and Android apps.
2. Optional operating-system surfaces: Android notification bubbles and richer
   iOS Live Activity / Dynamic Island navigation.

This document records the platform findings and the phase-one design. Phase two
is deliberately not part of the first implementation.

## Platform findings

### Android

Android supports system-level notification bubbles that can float above other
apps. They are backed by conversation notifications, long-lived shortcuts, and
an embedded, resizable activity. The user controls whether an app or
conversation may bubble, and the system can fall back to a normal notification.

This is a viable future enhancement, but it is native Android work rather than
an ordinary React Native overlay. T3 would need an Android bubble activity,
conversation notification metadata, user-facing bubble controls, and Android
push delivery for updates while the app process is absent. The existing Expo
notification API does not expose the complete bubble contract, so an Expo
module and config plugin are likely required.

`SYSTEM_ALERT_WINDOW` could produce a fully app-controlled overlay, but it is
not recommended. It is a sensitive special permission, adds foreground-service
and store-policy risk, and is unnecessary when Android provides notification
bubbles.

References:

- <https://developer.android.com/develop/ui/compose/notifications/bubbles>
- <https://developer.android.com/reference/android/Manifest.permission#SYSTEM_ALERT_WINDOW>

### iOS

iOS does not expose a supported API for an arbitrary draggable app window over
other apps. When T3 leaves the foreground, UIKit can suspend its process; the
supported system surfaces are notifications, widgets, Live Activities, and the
Dynamic Island. Picture in Picture is reserved for real media playback or video
calls and is not an appropriate chat-launcher mechanism.

T3 already has an Agent Activity Live Activity with thread deep links. Phase two
can extend that existing surface with clearer thread navigation and status, but
it cannot reproduce an Android-style movable overlay.

References:

- <https://developer.apple.com/documentation/uikit/preparing-your-ui-to-run-in-the-background>
- <https://developer.apple.com/documentation/activitykit/displaying-live-data-with-live-activities>
- <https://developer.apple.com/documentation/avkit/avpictureinpicturecontroller>

## Phase one: in-app launcher

### Product behavior

- One floating bubble represents a bounded list of recent threads; the app does
  not render one bubble per thread.
- The bubble appears only while an off-screen recent thread is actively working
  or carries unseen approval, input, or completed-turn attention. Passive
  monitoring and quiet history do not summon it.
- Pressing it opens up to five recent threads that currently have activity.
  Quiet entries remain in the bounded history but do not render menu rows.
- While the user is on a supported compact thread route, a route-gated recorder
  observes lightweight shells and imports threads that enter active work in any
  connected environment, including work started from desktop or web.
- Its numeric badge counts recent off-screen threads with unseen approval,
  input, or completed-turn signals rather than the number of menu rows.
- A green arc orbits the bubble while a listed thread is `Working` and its run
  has not been drag-dismissed, the same test that summons the bubble for work.
  It is the glanceable counterpart to the badge: the badge says "needs you",
  the ring says "still running". Monitoring does not show the ring, and a muted
  run keeps the ring off even when other attention brings the bubble back.
- Menu rows also project `Working` and `Monitoring` from the lightweight shell.
  Those operational statuses do not increment the attention count.
- Opening a thread acknowledges its current attention signal on that device;
  merely opening the menu does not.
- Dragging the bubble into its dismiss target acknowledges the attention
  currently shown and mutes each exact live run in memory. Route suppression
  preserves the mute; settlement, a different turn, or fresh attention allows
  the bubble to return.
- Selecting a row closes the menu and uses the existing adaptive thread
  navigation. It never interrupts, settles, or duplicates the running session.
- The active thread is excluded from the visible list.
- Unstarted new-task drafts are not recent threads. When a draft creates a real
  thread, that thread becomes eligible on its first departure.
- Recent entries and the normalized launcher position are device-local and
  survive app restarts. They are not synchronized through a T3 server.
- The menu contains no clear or reset actions. Recent history rotates through
  its five-entry bound, and the launcher position changes only through dragging.
- Compact phone layouts show the launcher only on thread destinations. Home,
  the new-task flow, and split layouts hide it because their thread lists
  already provide peer navigation.
- Settings, connection, legal, Git confirmation, and other unrelated modal
  flows suppress the launcher.

### Navigation semantics

"Back" is not one callback on mobile. It can be a native header action, Android
system Back, iOS edge swipe, a route replacement, a Home selection, or adaptive
split-view navigation. The feature therefore observes the semantic active
thread derived from navigation state:

- initial `null -> A`: observe A and record nothing;
- same thread or `A -> A/files`: record nothing;
- `A -> B`: prepend A;
- `A -> Home` or an unstarted draft: prepend A;
- `null -> B`: record nothing.

Identity always includes both `environmentId` and `threadId` so local, remote,
relay, and tunnel environments cannot collide.

### Component boundaries

- A small feature-local pure module owns transition, deduplication, capacity,
  persistence sanitization, visibility, and layout math.
- A root-stack leaf observes route changes, the current thread shell, and at
  most the five scoped shells in visible recent history. A child mounted only
  on supported bubble routes subscribes to the global lightweight shell array
  to record transitions into active work; it never hydrates background
  messages.
- A portal-projected visual leaf owns the bubble, menu, and gesture state. The
  portal receives route, menu, history, and presentation-changing status
  updates, never per-frame dragging. Memoization filters shell updates whose
  projected row status did not change.
- Existing scoped IDs, shell atoms, deep-link navigation, safe-area provider,
  Gesture Handler, Reanimated, keyboard controller, and theme tokens are reused.
  No production dependency or wire contract is added.

### Motion and performance contract

The motion is calm and tactile rather than decorative:

| Interaction     | Purpose                      | Response                                                                        | Interruption                                          | Reduced Motion             |
| --------------- | ---------------------------- | ------------------------------------------------------------------------------- | ----------------------------------------------------- | -------------------------- |
| Finger drag     | Direct manipulation          | Translation follows the finger on the UI thread                                 | A new gesture cancels the current settle              | Direct tracking remains    |
| Release         | Preserve physical continuity | Release velocity projects a bounded target and settles with a restrained spring | A new drag starts from the current presentation value | Snap to the bounded target |
| Press           | Immediate feedback           | Small compression and release                                                   | Pan activation cancels the tap                        | No spatial flourish        |
| Menu open/close | Reveal hierarchy             | Short opacity/scale transition                                                  | Selection or backdrop closes immediately              | Opacity-only or instant    |
| Working ring    | Show an agent is still busy  | Green arc springs in and orbits the bubble on a linear loop while work runs     | Shrinks and fades out once no undismissed work runs   | Still, full green ring     |

Performance requirements:

- Gesture updates and transforms stay in Reanimated worklets on the UI thread.
- No React state, atom, storage, or portal writes occur on animation frames.
- JavaScript receives only discrete gesture events: open/close, navigation
  selection, and one normalized-position commit after settling.
  Scoped shell updates only recompute the bounded row statuses and read
  cursors. The route-gated global recorder batches newly working threads into
  one bounded history mutation and ignores repeat observations of the same run.
- Worklets perform only constant-time clamp and transform arithmetic.
- The menu renders at most five rows and is unmounted while closed.
- The working ring is the one continuous animation, and it runs only while a
  listed thread has undismissed work and the app is in the foreground: a single
  rotation transform on a wrapper view, composited natively, with the SVG arc
  drawn once. Backgrounding cancels the loop and returning restarts it. Reduce
  Motion, tracked live, replaces the loop with a static ring. No idle pulse,
  bob, timer, or simultaneously mounted chat view is introduced.
- The bubble respects safe areas, the keyboard, orientation, split screen, and
  a minimum 44-point touch target.

### Failure and stale-state behavior

- Malformed persisted data resets safely without preventing the in-memory
  launcher from working.
- A transient storage load failure must not overwrite previously valid data
  with an empty fallback. Persistence stays disabled for that host lifetime
  when hydration fails.
- Temporarily disconnected threads remain navigable from their stored scoped
  reference. Existing thread loading/unavailable screens own the result.
- If a thread was deleted, archived, or its environment was removed after it
  entered recents, the existing route remains the final race-condition guard;
  selecting the stale row cannot affect another thread.

## Phase two candidates

### Android system bubble

Prefer Android notification bubbles over `SYSTEM_ALERT_WINDOW`. A user-opted-in
thread bubble can expand into a compact T3 activity, and that activity can offer
the same bounded recent-thread switcher. The system owns global positioning,
stacking, dismissal, and fallback notification behavior.

### iOS Live Activity and Dynamic Island

Extend the existing Agent Activity surface rather than attempting an overlay.
Potential work includes clearer per-thread status, attention-first ordering,
interactive actions where supported, and reliable thread deep links from Lock
Screen and Dynamic Island presentations.

Phase two requires its own product and lifecycle design before implementation.
