# Floating recent-chat menu action removal

## Goal

Remove the **Reset position** and **Clear** capabilities from the mobile floating
recent-chat bubble. The menu should focus only on quick thread switching and
status visibility.

## Product behavior

- The recent-chat menu ends after its final thread row. It has no footer or
  management actions.
- Users can continue dragging the bubble to either side of the screen. Its most
  recently settled position remains device-local and persists across restarts.
- There is no action to restore the default position after the bubble has been
  moved.
- Recent chats continue rotating through the bounded five-thread history. There
  is no action to clear that history or hide the bubble manually.
- The bubble remains hidden on routes and layouts that already expose peer
  thread navigation, as before.

## Accessibility

The bubble retains the **Move left**, **Move right**, **Move up**, and **Move
down** accessibility actions. The **Reset position** accessibility action is
removed so assistive-technology behavior matches the visible feature set.

Thread rows retain their accessible labels, status descriptions, and selection
behavior.

## Implementation boundaries

- Remove the action footer and its private action component from the recent-chat
  menu.
- Remove clear/reset props, callbacks, handlers, and memo-comparator fields from
  the menu, floating bubble, and host.
- Keep the position-write path used after dragging. Remove only the reset path.
- Remove the explicit thread-history replacement mutation used solely by the
  clear action. Hydration still merges pre-hydration thread departures with
  persisted history.
- Remove the menu action-height allowance. The estimated height becomes the
  48-point header plus 64 points for each visible row, for a maximum of 368
  points with five rows.
- Preserve all attention badges, working statuses, navigation, persistence,
  gestures, safe-area behavior, and Reanimated worklets.

## Validation

- Update the focused layout-height expectation from 420 to 368 points.
- Remove the obsolete pre-hydration-clear scenario and keep merge/hydration
  coverage for reachable state transitions.
- Run the recent-thread and persistence tests, mobile type checking, targeted
  linting, and formatting checks.
- Run the required rules review over only this removal and resolve confirmed
  findings before completion.

## Out of scope

- Adding replacement actions in Settings, gestures, or another menu.
- Changing recent-thread capacity, ordering, acknowledgement, or sync behavior.
- Changing the bubble's styling, motion, docking, or visibility rules.
