# Floating Recent Chat Menu Close Animation

## Status

Design approved on 2026-08-16.

## Problem

The recent-chat menu currently closes by translating its nearest edge into the
center of the floating launcher while scaling down. That geometry makes the
menu cross the launcher's painted bounds. Smaller terminal scales and different
easing reduce the visible artifact but cannot guarantee that the list stays
clear of the button.

## Chosen behavior

- The open menu remains separated from the floating launcher by the existing
  layout gap.
- On close, the menu scales toward the edge nearest the launcher without
  translating that edge into the launcher.
- Row content fades before the surface finishes collapsing so text and icons do
  not compete with the launcher.
- The surface then fades and unmounts through the existing menu-presence state.
- Opening behavior uses the same geometry in reverse, preserving a clear
  relationship between the launcher and menu.
- The launcher lives on a stable foreground layer so transformed menu content
  and native shadows cannot cover it during either transition.
- The launcher remains interactive and visually unchanged. Dragging, docking,
  attention badges, menu layout, and thread selection are outside this fix.
- Existing system reduced-motion handling remains authoritative.

This creates a geometric invariant: throughout the transition, the menu stays
on its own side of the launcher-to-menu gap. A stable launcher layer provides a
second compositing guarantee without applying z-index to either transformed
surface.

## Alternatives considered

### Force the launcher above the menu

Platform-specific z-index and elevation could hide the overlap. Native glass,
transformed views, and Android elevation do not share one reliable compositing
model, so this would conceal rather than remove the invalid path.

### Fade before entering the launcher

An earlier full fade would prevent a visible collision, but the invisible menu
would still move through the launcher's bounds and the close would lose spatial
continuity.

### Collapse at the menu edge — chosen

Keeping the transform origin at the nearest menu edge removes the overlap at
its source, works in both opening directions, and requires only a focused
animation change.

## Implementation

`RecentThreadsBubbleMenu` owns the surface transform. Its animated style will
retain the existing edge-based transform origin, scale, staged content opacity,
and staged surface opacity, while removing the vertical translation into the
launcher. `FloatingRecentThreadsBubble` will keep the launcher in an
always-mounted, non-transformed foreground layer. Constants and imports that
only supported the old translation will be removed.

No contract, persistence, navigation, layout, or shared component changes are
required.

## Verification

- Run the focused recent-thread layout and menu-state tests.
- Run the mobile TypeScript check and targeted formatting/lint checks supported
  by the repository.
- Review the animation math for menus opening above and below the launcher and
  confirm both preserve the configured gap.
- Review rapid close triggers and reduced-motion configuration for regressions.
- Device or simulator visual verification is deferred unless separately
  authorized, per the repository's computer-use policy.
