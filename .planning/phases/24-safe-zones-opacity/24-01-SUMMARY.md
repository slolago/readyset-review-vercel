---
phase: 24
plan: "01"
subsystem: video-player
tags: [safe-zones, opacity, ui, controls]
dependency_graph:
  requires: [SafeZonesOverlay, VideoPlayer, SafeZoneSelector]
  provides: [safe-zone-opacity-control]
  affects: [VideoPlayer.tsx, SafeZonesOverlay.tsx]
tech_stack:
  added: []
  patterns: [conditional-render, controlled-range-input, state-reset-on-selection]
key_files:
  created: []
  modified:
    - src/components/viewer/SafeZonesOverlay.tsx
    - src/components/viewer/VideoPlayer.tsx
decisions:
  - Opacity slider placed immediately after SafeZoneSelector in controls row for spatial proximity
  - Reset opacity to 1 on every setActiveSafeZone call (both select and deselect) for predictable UX
  - Slider styled identically to volume slider (purple fill, w-16, h-1) for visual consistency
  - slider only rendered when activeSafeZone is not null — no hidden state needed
metrics:
  duration: "2 min"
  completed: "2026-04-07"
  tasks: 2
  files_modified: 2
---

# Phase 24 Plan 01: Safe Zones Opacity Slider Summary

**One-liner:** Opacity slider on SafeZonesOverlay via `opacity` prop + conditional range input in VideoPlayer controls that resets to 100% on zone switch.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Add opacity prop to SafeZonesOverlay | f9806ec7 | SafeZonesOverlay.tsx |
| 2 | Add safeZoneOpacity state and slider to VideoPlayer | 9e435160 | VideoPlayer.tsx |

## What Was Built

### SafeZonesOverlay
- Added `opacity?: number` prop (default 1) to `SafeZonesOverlayProps`
- Applied `opacity` via `style={{ opacity }}` on the `<img>` element

### VideoPlayer
- Added `safeZoneOpacity` state (default `1`)
- Wrapped `SafeZoneSelector`'s `onSelect` callback to also call `setSafeZoneOpacity(1)` on every zone change
- Added conditional opacity `<input type="range">` rendered only when `activeSafeZone !== null`, placed immediately after `<SafeZoneSelector>` in the controls row
- Threaded `opacity={safeZoneOpacity}` into the `<SafeZonesOverlay>` render

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None.

## Self-Check: PASSED

Files exist:
- FOUND: src/components/viewer/SafeZonesOverlay.tsx
- FOUND: src/components/viewer/VideoPlayer.tsx

Commits exist:
- FOUND: f9806ec7 (feat(24-01): add opacity prop to SafeZonesOverlay)
- FOUND: 9e435160 (feat(24-01): add safe zone opacity slider to VideoPlayer controls)
