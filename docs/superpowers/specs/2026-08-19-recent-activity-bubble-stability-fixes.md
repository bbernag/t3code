# Recent Activity Bubble Stability Fixes

## Status

Approved on 2026-08-19.

## Problem

The first implementation can repeatedly rotate and persist its five-entry
snapshot when more than five threads are working, can overwrite valid storage
after a transient read failure, and derives dismissal state from route-filtered
presentation data. The latter makes a dismissed bubble reappear after visiting
Settings and cannot distinguish a dismissed run from a genuinely new run. A
render callback also changes with every item projection and defeats the visual
leaf's memoization.

## Chosen behavior

- Record the transition into working once per thread. Batch all newly observed
  working threads into one bounded snapshot update so overflow is stable.
- Treat storage hydration failure as read-only in-memory mode for the rest of
  the host lifetime. Never save a fallback snapshot when the persisted value
  could not be read.
- Represent live activity separately from the row's display status. A
  dismissal mutes the exact live run, survives route suppression, and clears
  when the thread settles or starts a different run. Attention always cuts
  through a live mute.
- Batch dismissal acknowledgements into one snapshot update and keep the
  dismiss callback stable through a latest-items ref.
- Keep the five-entry storage contract and all wire contracts unchanged.

## Implementation boundaries

Pure helpers own batched history updates, persistence eligibility, live run
identity, and mute pruning so each regression can be tested without mounting
the navigation tree. `RecentThreadsBubbleHost` remains the effect boundary for
shell observation and secure storage.

The existing implementation is preserved in a baseline commit. Each finding
lands in a focused follow-up commit so it can be reviewed or reverted
independently.

## Verification

- Focused recent-thread unit tests for overflow stability, failed-hydration
  persistence, exact-run dismissal, and batched acknowledgements.
- Targeted mobile TypeScript, lint, formatting, and diff checks.
- Required rules review of the final task change set.
