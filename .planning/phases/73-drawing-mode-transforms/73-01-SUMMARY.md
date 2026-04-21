---
phase: 73-drawing-mode-transforms
plan: 01
subsystem: viewer/annotations
tags: [fabric, canvas, drawing, bugfix, one-line]
requires: []
provides: [single-object-transforms-in-drawing-mode]
affects: [viewer/AnnotationCanvas]
tech-stack:
  added: []
  patterns:
    - "Fabric.js control-handle hit-testing requires both selectable=true AND evented=true on the underlying object"
key-files:
  created:
    - .planning/phases/73-drawing-mode-transforms/73-01-SUMMARY.md
  modified:
    - src/components/viewer/AnnotationCanvas.tsx
decisions:
  - "One-line fix: add obj.evented = true alongside obj.selectable = true in the 'select' branch of the tool-switch effect. No other code changed."
requirements-completed: [DRAW-01]
metrics:
  duration: "~2 min"
  tasks: 1
  files-modified: 1
  lines-changed: 1
  tests: "171/171 passing"
completed: 2026-04-21
---

# Phase 73 Plan 01: Drawing-mode single-object transforms Summary

One-line fix restoring `obj.evented = true` alongside `obj.selectable = true` in the `'select'` branch of `AnnotationCanvas.tsx`'s tool-switch effect, so Fabric.js's control-handle hit-testing no longer short-circuits single-object selections into move-only mode.

## Root Cause

The tool-switching `useEffect` (`src/components/viewer/AnnotationCanvas.tsx` lines 137-255) pre-emptively forces `evented = false` on every canvas object (line 156) before entering the tool `switch`. The `'select'` case then restored `selectable = true` but never restored `evented = true`. With `evented = false`, Fabric's `__onMouseDown` hit-test for the object's corner/rotation control points fails, so the drag falls through to the canvas-level move handler — the object moves, never scales, never rotates.

Multi-object rubberband selections were unaffected because `canvas.selection = true` creates an `ActiveSelection` (a fresh Group instance wrapping the picked objects). The `ActiveSelection` wrapper is evented by default, so its handles worked even though the inner objects were not evented.

## Fix

`src/components/viewer/AnnotationCanvas.tsx` line 163:

```diff
       case 'select':
         canvas.selection = true;
-        canvas.forEachObject((obj: any) => { obj.selectable = true; });
+        canvas.forEachObject((obj: any) => { obj.selectable = true; obj.evented = true; });
         break;
```

One character change (`; }` → `; obj.evented = true; }`). No other files touched.

## Why Alternatives Were Ruled Out

Scouting during the plan phase checked the obvious candidates and found nothing:

- `lockScalingX` / `lockScalingY` / `lockRotation` / `lockUniScaling` — **zero** matches across the entire codebase
- `setControlsVisibility` / `hasControls` — **zero** matches
- Parent wrappers in `VideoPlayer.tsx` and `ImageViewer.tsx` — plain positioned `div`s with no pointer-event interceptors

Fabric v5.3.0 (per `package.json` line 30) defaults controls to visible and active. The only behavior suppressing handle-drag transforms was the object-level `evented = false` leaking into select mode.

## Scope Preserved

Per the plan, the following were explicitly NOT touched:

- `!isActive` branch (line 150) — objects correctly un-evented when drawing mode is off
- Pre-tool reset (line 156) — forcing `evented = false` before each tool switch is required so freehand/rect/circle/arrow/text `mouse:down` handlers fire on the canvas, not on existing objects
- Other tool cases (`freehand`, `rectangle`, `circle`, `arrow`, `text`) — unchanged
- Shape factory defaults (lines 179, 199, 220, 245) — `selectable: false` on creation is correct
- Read-only paths — still un-evented, display remains non-interactive outside annotation mode

## Verification Results

Automated:
- `npx tsc --noEmit` — clean (no TypeScript errors)
- `npm test` — 171/171 tests passing (7 files)
- `grep "obj\.selectable = true; obj\.evented = true"` on `AnnotationCanvas.tsx` — one match on line 163
- `grep "lockScaling|lockRotation|hasControls|setControlsVisibility"` on `AnnotationCanvas.tsx` — no matches (no unintended guards introduced)

Human verification (pending user session per plan's `<human>` block):
1. Single freehand / arrow / text selection: corner handle drag should now scale
2. Single freehand / arrow / text selection: rotation handle drag should now rotate
3. Multi-object rubberband: transforms still work (regression)
4. Drawing tools still create new shapes without interference (regression)
5. Read-only display outside annotation mode still non-interactive (regression)

## Deviations from Plan

None — plan executed exactly as written. One line changed, nothing else touched.

## Key Files

- `src/components/viewer/AnnotationCanvas.tsx` (1 line modified, line 163)

## Commit

- `e975334e`: fix(73-01): restore evented=true on select tool for single-object transforms (DRAW-01)

## Self-Check: PASSED

- `src/components/viewer/AnnotationCanvas.tsx` exists and contains the fix on line 163 (grep verified)
- Commit `e975334e` exists in `git log` (verified)
- No unintended lock-flag or controls-visibility calls introduced (grep verified)
- TypeScript and test suite green
