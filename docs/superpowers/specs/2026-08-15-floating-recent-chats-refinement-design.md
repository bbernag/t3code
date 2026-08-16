# Floating Recent Chats Bubble Refinement

## Status

Approved for implementation on 2026-08-15.

## Context

The first mobile implementation keeps a floating recent-chats bubble inside the T3 Code app. It can be dragged freely, opens a compact recent-thread menu, and persists its position. Manual testing confirmed that the core interaction works, but exposed three refinements:

1. The bubble must never remain in the middle of the screen after release.
2. Its release motion should feel like Expo's floating developer-tools button: momentum-aware, edge-docked, and mildly bouncy.
3. It should be smaller and should appear only while a thread is open, not on the chat list.

This refinement applies to the shared React Native implementation on iOS and Android. It does not add an operating-system-level overlay.

## Goals

- Allow free dragging while making the left and right sides the only resting edges.
- Preserve release velocity so a push can influence both the chosen side and final vertical position.
- Add a brief, interruptible spring settle with restrained bounce.
- Reduce the visible circle from 56dp to 48dp while keeping a 56dp interaction target.
- Show the bubble only on an open thread and thread-owned subroutes.
- Preserve the existing recent-thread history, menu, position persistence, accessibility, keyboard avoidance, and compact-layout behavior.
- Keep all continuous gesture and animation work off the JavaScript thread.

## Non-goals

- Resting on the top or bottom edge.
- Displaying the bubble on Home, the chat list, the new-task sheet, Settings, or unrelated routes.
- Adding Android system overlays, Android notification bubbles, iOS Live Activities, or Dynamic Island integration.
- Introducing a new dependency, native module, persistence schema, or continuous idle animation.
- Redesigning the recent-thread dropdown.

## Chosen approach

Use a single projected spring, modeled after Expo's floating developer-tools button.

On release, the bubble projects 100ms of the current velocity. The projected horizontal center selects the left or right docking edge, and the projected vertical coordinate is clamped to the currently visible safe bounds. A physics spring with `mass: 1`, `stiffness: 200`, and `damping: 18` then carries the bubble directly to that target using the release velocity.

This is preferred over a decay-then-spring sequence because it is deterministic, uses one interruptible animation per axis, and has less boundary and completion state to manage. It is preferred over an immediate nearest-edge spring because it preserves the feeling that the bubble was pushed.

## Interaction and motion contract

### Direct manipulation

- A drag begins after the existing 5dp movement threshold so taps still open the menu.
- While dragging, the interaction target follows the finger one-to-one.
- Horizontal and vertical drag coordinates stay within the current safe viewport, including keyboard avoidance.
- A new touch cancels any in-flight settle and starts from the bubble's current presentation position.
- Keep the existing velocity-driven stretch, compression, and maximum 6-degree tilt mappings unchanged; restore them to their neutral values with the existing shape spring after interaction.

### Release and docking

- Project the current point by a 100ms velocity horizon.
- Choose the left edge when the projected horizontal center is left of the viewport midpoint; choose the right edge for the midpoint tie and everything to its right.
- Clamp the projected vertical coordinate between the safe top and the keyboard-adjusted safe bottom.
- Animate both axes with a physics spring configured with `mass: 1`, `stiffness: 200`, and `damping: 18`, plus their corresponding release velocities.
- Keep the 12dp docking margin. During horizontal spring overshoot, clamp presentation at the horizontal safe-area boundary, allowing at most those 12dp of margin to be consumed. Do not permit vertical overshoot beyond the keyboard-adjusted safe bounds.
- Fire the existing light settle haptic and persist the position only after both axes finish.
- Reduced Motion keeps direct dragging but removes the animated bounce and resolves immediately to the same docked target.

### Size and touch target

- The visible circular bubble is 48dp.
- A transparent 56dp square remains the gesture and accessibility target on both platforms.
- Reduce the chat symbol from 25dp to 22dp and the badge from 20dp to 18dp while retaining its 10dp bold count text.
- Layout calculations distinguish the 56dp interaction bounds from the 48dp visual circle. Menu anchoring uses the visible bubble geometry and remains inside the safe viewport.

## Position model and compatibility

Continue using the existing normalized `{ x, y }` snapshot.

- A docked left position persists as `x: 0`.
- A docked right position persists as `x: 1`.
- The vertical value remains normalized within the current safe docking bounds.
- When resolving an older saved position whose `x` is between the edges, map values below `0.5` to the left and values at or above `0.5` to the right.
- Rotation, resizing, safe-area changes, and keyboard changes re-resolve the normalized position within current bounds without changing the storage version.
- Failed persistence remains best-effort and follows the existing warning behavior; it must not block interaction.

## Visibility

The host renders the bubble only when all existing eligibility conditions are met and the top route is thread-owned.

Eligible thread-owned routes are:

- `Thread`
- `ThreadFile`
- `ThreadFiles`
- `ThreadReview`
- `ThreadTerminal`

`Home` and `NewTaskSheet` are removed from the route allowlist. Existing compact-layout and non-empty recent-history requirements remain unchanged. The active thread continues to be excluded from the dropdown without being removed from stored history.

## Component boundaries

### `floatingRecentThreadsLayout.ts`

Owns pure, worklet-safe geometry:

- visual and interaction sizes;
- safe docking bounds;
- conversion between normalized and screen coordinates;
- migration-by-resolution of older middle-screen positions;
- velocity projection and left/right target selection;
- menu placement using the smaller visible geometry.

The projection and docking rules remain unit-testable without rendering React Native UI.

### `FloatingRecentThreadsBubble.tsx`

Owns gestures, shared animation values, haptics, accessibility actions, and rendering. Drag frames and spring frames stay in Reanimated worklets. It calls React Native code only for discrete menu, haptic, selection, and final persistence events.

Accessibility move-left and move-right actions dock directly to the requested side. Move-up and move-down adjust the vertical position while preserving the current side. Reset position returns to the existing default right-side location.

### `recentThreads.ts` and `RecentThreadsBubbleHost.tsx`

The route predicate owns thread-only visibility. The host keeps its existing responsibility for history, active-thread exclusion, navigation, hydration, and compact-layout eligibility.

## Performance constraints

- Use Reanimated shared values and transform-only animated styles for every continuous frame.
- Do not set React state, persist data, calculate menu layout, or cross to the JavaScript thread during drag or settle frames.
- Use one projected spring per position axis rather than chaining decay and spring animations.
- Keep animation interruption explicit with `cancelAnimation`.
- Do not add timers, polling, continuously repainting effects, or a new dependency.
- Preserve memoization at the portal boundary so unrelated shell updates do not restart gesture work.

## Edge cases

- The keyboard may appear during a drag. The visible maximum Y is recalculated on the UI thread before each drag update and release.
- Tiny viewports collapse invalid ranges to a single reachable point.
- Orientation or window-size changes retain the side and proportional vertical placement.
- An older position in the middle snaps to its nearest side as soon as it is resolved, without requiring the user to drag it again.
- Opening the menu during or after a settle uses the bubble's current docked position and never places the menu off-screen.
- If the host becomes ineligible, unmounting cancels the visible interaction; the persisted docked position is reused the next time an eligible thread route appears.

## Testing and validation

Add or update focused unit tests for:

- left/right docking from position and horizontal velocity;
- the midpoint tie selecting the right side;
- vertical momentum projection and safe-area/keyboard clamping;
- older arbitrary normalized X values resolving to an edge;
- normalized docked-position round trips;
- tiny viewports and menu placement with separate visual/interaction sizes;
- visibility on every eligible thread-owned route;
- hidden behavior on Home, NewTaskSheet, Settings, and null/unknown routes;
- accessibility movement helpers if they are extracted as pure geometry.

Run the recent-thread and persistence tests, targeted mobile typechecking, targeted linting/format checks, and a final rules review of only this task's changes. Simulator or emulator automation is outside this implementation unless separately authorized.

## Documentation

Update the existing mobile user documentation so it states that the bubble appears only inside an open thread, docks to either side after dragging, and remains an in-app feature on iOS and Android.
