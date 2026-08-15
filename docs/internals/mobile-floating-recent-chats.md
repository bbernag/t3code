# Mobile floating recent chats

## Purpose

T3 Code users often move from one thread into Home or a new task and then need
to return to the previous thread quickly. Searching the complete thread list is
unnecessarily expensive for that short navigation loop.

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
- The bubble appears after the user leaves the first canonical server thread.
- Pressing it opens up to five recent threads in most-recently-left order.
- Selecting a row closes the menu and uses the existing adaptive thread
  navigation. It never interrupts, settles, or duplicates the running session.
- The active thread is excluded from the visible list.
- Unstarted new-task drafts are not recent threads. When a draft creates a real
  thread, that thread becomes eligible on its first departure.
- Recent entries and the normalized launcher position are device-local and
  survive app restarts. They are not synchronized through a T3 server.
- Clearing recents hides the launcher until another thread departure. Resetting
  its position returns it to the trailing edge without clearing history.
- Compact phone layouts show the launcher on Home, thread destinations, and the
  new-task flow. Split layouts hide it because the persistent thread sidebar
  already provides peer navigation.
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
- A root-stack leaf observes route changes and only subscribes to the currently
  active thread shell. This follows the established mobile performance pattern:
  shell changes must not rerender the root navigator and every screen.
- A portal-projected visual leaf owns the bubble, menu, and gesture state. The
  portal receives React updates only for route/menu/history changes, never for
  per-frame dragging.
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

Performance requirements:

- Gesture updates and transforms stay in Reanimated worklets on the UI thread.
- No React state, atom, storage, or portal writes occur on animation frames.
- JavaScript receives only discrete events: open/close, navigation selection,
  clear/reset, and one normalized-position commit after settling.
- Worklets perform only constant-time clamp and transform arithmetic.
- The menu renders at most five rows and is unmounted while closed.
- No idle pulse, bob, timer, continuous repaint, or simultaneously mounted chat
  view is introduced.
- The bubble respects safe areas, the keyboard, orientation, split screen, and
  a minimum 44-point touch target.

### Failure and stale-state behavior

- Malformed persisted data resets safely without preventing the in-memory
  launcher from working.
- A transient storage load failure must not overwrite previously valid data
  with an empty fallback.
- Temporarily disconnected threads remain navigable from their stored scoped
  reference. Existing thread loading/unavailable screens own the result.
- If a thread was deleted, archived, or its environment was removed after it
  entered recents, the existing route remains the final race-condition guard;
  selecting or clearing the stale row cannot affect another thread.

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
