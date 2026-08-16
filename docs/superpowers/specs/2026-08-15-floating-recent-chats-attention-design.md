# Floating Recent Chat Attention Badges

## Status

Design agreed on 2026-08-15. Implementation is intentionally deferred.

## Purpose

The floating recent-chats bubble currently shows the number of chats in its
bounded recent list. That number describes history, but it does not tell the
user whether another agent needs them. Five recent chats can display a badge of
`5` even when none has new work to review.

The badge should instead answer one question: **how many off-screen recent
chats currently have unseen work that needs the user’s attention?** The menu
should identify those chats individually, and opening one should acknowledge
only that chat.

This is an in-app iOS and Android refinement. It does not add Android system
bubbles, iOS Live Activity behavior, cross-device read receipts, or full
message previews.

## Agreed behavior

### Bubble count

- Count recent off-screen chats that have an unacknowledged attention signal,
  not the total number of recent chats.
- A chat needs attention when any of these events becomes visible after its
  last acknowledgement:
  - the latest agent turn completes;
  - the agent requests an approval;
  - the agent requests explicit user input.
- Count chats, not messages or individual pending requests. A chat contributes
  at most one to the bubble count.
- Exclude the currently open chat.
- Keep the bubble available for quick switching when the count is zero, but do
  not render its numeric badge.
- The existing maximum of five recent chats also bounds the attention count to
  five.

### Menu badges

- Opening the bubble menu does not acknowledge any chat.
- Add one compact contextual badge to each menu row that currently needs
  attention:
  - `Approval` for a pending approval;
  - `Input` for a pending user-input request;
  - `Done` for an unseen completed turn.
- Use the established mobile status priority when more than one condition is
  present: approval, then input, then completion.
- Reuse the status colors already used by the mobile thread list and Agent
  Activity surfaces rather than introducing a second status palette.
- Rows without unacknowledged attention keep the current title, project label,
  and chevron presentation without an empty badge placeholder.

### Acknowledgement

- Opening a specific chat acknowledges that chat. This applies whether the
  user opens it from the bubble menu or reaches it through another in-app
  navigation path.
- Acknowledgement removes the row badge and decrements the bubble count
  immediately.
- Acknowledgement does not resolve an approval, submit requested input, settle
  a thread, interrupt an agent, or otherwise mutate server state.
- A pending approval or input request remains functionally pending after its
  badge is acknowledged. The badge stays cleared because the user has seen it.
- A later completion or a later approval/input signal raises attention again.
- Switching between thread-owned subroutes for the same chat does not create a
  new acknowledgement or a new recent entry.

## Repository findings

### The shared shell already carries the required signals

[`packages/contracts/src/orchestration.ts`](../../../packages/contracts/src/orchestration.ts)
defines the lightweight thread shell used by web and mobile. It already
includes:

- `latestTurn.completedAt` for a completed agent turn;
- `hasPendingApprovals`;
- `hasPendingUserInput`;
- `updatedAt`, which advances when thread activity is projected.

The mobile bubble therefore does not need to load full message history or add a
new server contract to know that a recent chat needs attention.

### Web already has completion-read semantics

[`apps/web/src/components/Sidebar.logic.ts`](../../../apps/web/src/components/Sidebar.logic.ts)
implements `hasUnseenCompletion` by comparing the latest completion timestamp
with a client-local last-visited timestamp. Missing visit state is treated as
read so that enabling the behavior does not mark every historical thread as
unread.

[`apps/web/src/uiStateStore.ts`](../../../apps/web/src/uiStateStore.ts) persists
those visit markers locally. Reading a finished thread records the completion
timestamp being viewed rather than an arbitrary device-clock time. A future
completion can therefore still become unread.

The mobile design should preserve those semantics while extending the set of
attention signals to approvals and explicit input requests.

### Mobile already has a shared attention vocabulary

[`apps/mobile/src/features/threads/threadListV2.ts`](../../../apps/mobile/src/features/threads/threadListV2.ts)
classifies shell state as approval, input, working, failed, or ready.
[`apps/mobile/src/widgets/AgentActivity.tsx`](../../../apps/mobile/src/widgets/AgentActivity.tsx)
also prioritizes approval and input as states that need attention. The bubble
can reuse this product language and visual hierarchy.

### Recent-chat state is already bounded and device-local

[`apps/mobile/src/persistence/recent-thread-bubble.ts`](../../../apps/mobile/src/persistence/recent-thread-bubble.ts)
stores at most five scoped chat references and the normalized bubble position.
It validates persisted data before use. Adding an acknowledgement cursor to
each bounded entry fits this owner and does not require global application
state.

[`apps/mobile/src/features/recent-threads/RecentThreadsBubbleHost.tsx`](../../../apps/mobile/src/features/recent-threads/RecentThreadsBubbleHost.tsx)
already owns recent-chat hydration, active-chat observation, navigation, and
active-chat exclusion. It is the appropriate integration boundary for
attention acknowledgement.

## Approaches considered

### 1. Persisted device-local attention cursor — chosen

Store an acknowledgement timestamp with each recent-chat entry and derive the
current attention presentation from that chat’s lightweight shell.

Benefits:

- survives app restarts;
- works without a network round trip once shell state is available;
- reuses existing completion and pending-request signals;
- changes only the bounded mobile feature and its persistence format;
- matches the web client’s per-device unread model.

Trade-off: acknowledgement does not synchronize across devices. Reading a chat
on the web or another phone does not clear this phone’s bubble badge.

### 2. In-memory transition flags

Set a local boolean when an observed chat changes from working to completed or
from no request to a pending request, then clear it on navigation.

This is smaller in memory and storage, but it loses acknowledgements on restart
and can miss events that occur while the app is not running. It does not meet
the requested behavior reliably.

### 3. Server-backed read receipts

Persist read state in the T3 server and synchronize it through the contracts
and shell stream.

This would provide cross-device consistency, but it requires a new durable
server model, commands/events, authorization decisions, schema compatibility,
and updates across web, desktop, and mobile. That scope is not justified for
this in-app refinement.

## Chosen data model

Extend each persisted recent-chat entry with an optional
`lastAcknowledgedAt` ISO timestamp. The timestamp is a cursor over server-backed
thread activity, not a user-visible date.

For a shell, derive the latest eligible attention signal as follows:

1. If approval is pending, classify the row as `approval` and use the relevant
   shell `updatedAt` timestamp.
2. Otherwise, if user input is pending, classify it as `input` and use the
   shell `updatedAt` timestamp.
3. Otherwise, if the latest turn has a valid `completedAt`, classify it as
   `completed` and use that timestamp.
4. Otherwise, there is no attention signal.

The signal is unseen when its timestamp is newer than `lastAcknowledgedAt`.
Invalid timestamps do not produce a badge.

Using `updatedAt` for a pending request is deliberately conservative. The
lightweight shell exposes pending booleans but not request IDs or request
timestamps. If additional thread activity arrives while that request remains
pending and the chat is off-screen, the chat may raise attention again. This
prefers a repeat alert over silently missing a newer request. Identifying the
exact pending request would require expanding the shared shell contract and is
not part of this refinement.

When a chat becomes active, acknowledge the newest signal currently visible in
that chat. When the user leaves the chat, retain a server-timestamp baseline so
later shell activity can raise attention without comparing against the phone’s
clock. Selecting a badged menu row also commits the acknowledgement before
navigation so the count responds immediately.

The persistence decoder should accept the existing version-one snapshot and
migrate entries without acknowledgement data. Existing entries are initially
treated as read, matching web behavior and preventing a one-time flood of
historical badges. Newly observed signals after that baseline can raise
attention normally.

## Component responsibilities

### Pure attention logic

Add feature-local pure helpers that:

- classify an attention kind from a lightweight thread shell;
- compare signal and acknowledgement timestamps safely;
- count attention across visible recent entries;
- merge updated acknowledgement metadata without disturbing recent ordering;
- preserve acknowledgement metadata when a chat’s title or project title is
  refreshed.

These helpers should not import React Native, navigation, storage, or animation
APIs.

### `RecentThreadsBubbleHost`

The host should:

- observe only the recent chat references and the active chat;
- derive row attention data;
- acknowledge a chat on activation or selection;
- pass the attention count and row classifications into the visual leaf;
- persist acknowledgement changes through the existing serialized save queue;
- continue to own route eligibility, active-chat exclusion, and compact-layout
  visibility.

Opening or closing the dropdown remains visual state and must not call the
acknowledgement path.

### `FloatingRecentThreadsBubble`

The bubble should receive a precomputed `attentionCount` rather than infer it
from `threads.length`. It should render the numeric badge only when that count
is greater than zero.

Gesture work, edge docking, spring configuration, haptics, safe-area behavior,
and accessibility movement remain unchanged.

Its accessibility label should describe both capabilities without equating
recent-chat count with attention. For example, it can announce “Recent chats,
2 need attention.”

### `RecentThreadsBubbleMenu`

The menu should receive precomputed row attention kinds and render the matching
compact badge. It should not subscribe to shell state or decide whether a chat
is read. Selection continues to close the menu and navigate through the host.

## Performance constraints

- Observe at most the five scoped shells represented by the recent list. Do
  not subscribe the root bubble host to the complete thread-shell array.
- Use the existing per-thread shell atoms so unrelated thread activity cannot
  rerender the portal or restart gesture work.
- Keep attention derivation constant-time per recent entry.
- Do not load full thread details, messages, activities, or Markdown merely to
  calculate attention.
- Do not add polling, timers, idle animation, or a production dependency.
- Persist only discrete history, acknowledgement, clear/reset, and final
  position changes. Never persist during gesture or animation frames.
- Preserve the memoized visual boundary so a shell update that does not change
  a row’s attention presentation does not rerender the animated bubble.

## Failure and edge behavior

- A temporarily unavailable shell produces no new badge. Its stored recent-chat
  entry remains navigable through the existing unavailable/loading flow.
- A deleted thread cannot contribute attention once its shell disappears.
- Malformed persisted acknowledgement timestamps are treated as absent and
  migrated to a safe read baseline when current shell state becomes available.
- Malformed server timestamps do not create false attention.
- Clearing recent chats also clears their acknowledgement metadata.
- Deduplication remains scoped by both `environmentId` and `threadId`, so
  identically named or numbered chats from different environments cannot share
  read state.
- If a pending request remains unresolved after the user opens the chat, its
  badge stays acknowledged. A genuinely later signal can raise it again.
- The active chat is never included in the count, even if its server-side
  request remains pending.

## Testing plan for the deferred implementation

Add focused pure and persistence tests covering:

- an unseen completion after the acknowledgement cursor;
- a completion at or before the cursor remaining read;
- approval and input priority over completion;
- one chat with several conditions contributing only one count;
- the active chat being excluded;
- opening the menu not changing acknowledgement state;
- selecting one row acknowledging only that chat;
- navigating to a chat outside the bubble acknowledging it;
- a later completion or pending request reappearing after acknowledgement;
- zero attention hiding only the numeric badge, not the launcher;
- version-one snapshot migration without historical badge flooding;
- hydration and deduplication preserving acknowledgement metadata;
- malformed timestamps and missing/deleted shell state;
- accessibility copy for zero, one, and multiple attention chats.

Run the recent-thread and bubble persistence tests, targeted mobile typecheck,
targeted formatting and lint checks, and the required rules review when
implementation resumes. Device or simulator validation should be requested
separately because it requires computer-use authorization.

## Deferred work

- Actual latest-message text previews. Lightweight shells intentionally do not
  contain message bodies, and loading full chat details for five background
  chats would add avoidable memory and update pressure.
- Cross-device acknowledgement synchronization.
- Android notification bubbles outside the app.
- iOS Live Activity or Dynamic Island changes.
- Push-notification badge integration.
