# Recent Activity Bubble Visibility

## Status

Approved on 2026-08-18.

## Problem

The floating recent-chats bubble appears on every thread screen whenever any
navigation history exists, permanently overlaying the conversation for users
who never need it. Its durable value is surfacing background threads that are
live or need the user — not duplicating the thread list a tap away. It also
only knows about threads departed on this phone, so a chat started from the
desktop or web app never surfaces at all.

## Chosen behavior

- The bubble renders while at least one listed thread is actively working or
  carries an unseen attention signal (approval, input, or completed). Passive
  monitoring and quiet history alone keep it hidden; monitoring rows still
  render while the bubble is up for another reason, so a persistent watch
  never pins the overlay by itself.
- Threads actively working in any connected environment — regardless of which
  device started them — are recorded into the device-local recent list while
  running, so they surface immediately and their later completions flag as
  Done through the normal acknowledgement pipeline. The recorder mounts only
  on bubble routes, keeping the app-wide shell subscription off every other
  screen.
- Threads first observed while paused (for example already waiting on an
  approval when the app connects) are not imported; they enter the list the
  next time they run. This keeps historical attention from flooding in on
  first connect.
- The recent list keeps its five-entry cap. A newly recorded running thread
  can evict the oldest entry even if that entry still shows attention — an
  accepted tradeoff: user navigation already evicts unconditionally, and more
  than five simultaneous active-or-attention chats is beyond what the menu is
  sized for.
- The open menu lists only recent threads with a live status — attention or
  working/monitoring. Quiet history stays stored but does not render a row.
- The surface is titled "Recent activity" (menu header, accessibility label,
  and bubble hint), replacing "Recent chats".
- Route, split-view, and per-device persistence rules are unchanged.
- Acknowledgement semantics are unchanged: opening the menu acknowledges
  nothing; opening a thread acknowledges that thread.
- Drag-to-dismiss: while the bubble is dragged, an X target appears at the
  bottom-center (above the safe area and keyboard). Within the capture radius
  the bubble magnetically snaps to the target; releasing there dismisses it.
  Dismissal acknowledges every shown attention signal and mutes the currently
  live chats. The mute is in-memory (resets on app relaunch) and clears per
  chat when it settles, so its completion or next run — or any other new
  signal — summons the bubble again. A "Dismiss until new activity"
  accessibility action mirrors the gesture.

## Alternatives considered

### Settings toggle

A "show recent chats bubble" preference keeps the always-on behavior available
but adds a setting for something the attention rule can decide automatically.
Revisit if users ask for the always-on quick switcher back.

### Attention-sorted but always visible

Keeping the bubble permanent and only reordering menu rows preserves the
overlay clutter that motivated the change.

## Implementation

A route-gated `LiveThreadRecorder` child of `RecentThreadsBubbleHost` observes
connected-environment thread shells and records actively working ones into the
recent list (`resolveRecentThreadLiveStatus`). The host gates `visible` with
`shouldSummonRecentThreadsBubble` — which also consults the session-local
dismissal mute set — and passes only status-carrying items to the menu via
`recentThreadItemsWithActivity`. Dismissal lives in the host
(`handleDismiss`: acknowledge shown attention, mute live keys via
`recentThreadLiveKeys`, prune mutes as chats settle) and in the bubble's pan
gesture (`resolveFloatingChatDismissTarget` / `isFloatingChatDismissCaptured`
drive the magnetic X target on the UI thread). No persistence-format or
contract changes.

## Verification

- Mobile TypeScript check and targeted lint on the host.
- Simulator pass: bubble present with one unseen completion, gone after the
  thread is opened and acknowledged, absent with empty attention.
