---
phase: 23-timecode-frame-fix
plan: 01
subsystem: ui
tags: [video-player, timecode, smpte, react]

# Dependency graph
requires:
  - phase: 18-safe-zones-and-vumeter
    provides: VideoPlayer.tsx with rAF-based timecode display and VU meter
provides:
  - VideoPlayer with immediate SMPTE frame digit updates on frame-step buttons and Shift+Arrow keys
affects: [video-player, timecode, frame-step]

# Tech tracking
tech-stack:
  added: []
  patterns: [Bypass rAF threshold with direct setCurrentTime + onTimeUpdate calls for discrete seeks]

key-files:
  created: []
  modified:
    - src/components/viewer/VideoPlayer.tsx

key-decisions:
  - "Add setCurrentTime + onTimeUpdate directly after v.currentTime assignment in stepFrame and arrow key handlers — bypasses 0.25s rAF threshold without altering it"
  - "TIME_THRESHOLD unchanged — normal playback throttling unaffected, fix is purely additive"

patterns-established:
  - "Discrete seeks (frame-step, keyboard shortcuts) require explicit state sync outside the rAF loop"

requirements-completed: [P23-01, P23-02, P23-03, P23-04]

# Metrics
duration: 3min
completed: 2026-04-08
---

# Phase 23 Plan 01: Timecode Frame Fix Summary

**Additive fix to VideoPlayer: direct setCurrentTime + onTimeUpdate calls after each frame-step bypass the 0.25s rAF threshold so SMPTE frame digit updates immediately**

## Performance

- **Duration:** 3 min
- **Started:** 2026-04-08T00:06:58Z
- **Completed:** 2026-04-08T00:09:00Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- stepFrame() button clicks now immediately update the SMPTE timecode display
- Shift+ArrowLeft and Shift+ArrowRight keyboard shortcuts now immediately update the SMPTE frame digit
- The rAF TIME_THRESHOLD (0.25s) is unchanged — normal playback throttling is unaffected

## Task Commits

Each task was committed atomically:

1. **Task 1: Add setCurrentTime and onTimeUpdate calls to stepFrame and keyboard handler** - `c3839950` (fix)

**Plan metadata:** (see final commit)

## Files Created/Modified
- `src/components/viewer/VideoPlayer.tsx` - Added 6 lines: setCurrentTime + onTimeUpdate pairs in stepFrame, ArrowLeft case, ArrowRight case

## Decisions Made
- Fix is purely additive — three pairs of setCurrentTime + onTimeUpdate calls, no structural changes
- TIME_THRESHOLD constant deliberately left unchanged; normal playback throttling must stay intact (P23-03)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- SMPTE timecode display is accurate during frame-by-frame stepping
- Both button-based (stepFrame) and keyboard-based (Shift+Arrow) frame stepping are fixed

---
*Phase: 23-timecode-frame-fix*
*Completed: 2026-04-08*
