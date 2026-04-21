# Phase 73: drawing-mode-transforms - Context

**Gathered:** 2026-04-21
**Status:** Ready for planning
**Mode:** Auto-generated (discuss skipped via workflow.skip_discuss)

<domain>
## Phase Boundary

Single-object selections in drawing mode expose Fabric.js scale and rotation handles, matching multi-select behavior.

Requirements in scope: DRAW-01.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices are at Claude's discretion — discuss phase was skipped per user setting.

</decisions>

<code_context>
## Existing Code Insights

Codebase context will be gathered during plan-phase research.

Drawing mode uses Fabric.js over a canvas overlay on the asset. The bug is specifically that single-object selection shows a bounding box with corner + rotation handles, but dragging the handles only moves the object instead of scaling/rotating it. Multi-object selections (Fabric's `ActiveSelection`) transform correctly.

Likely culprits:
- `object.set({ lockScalingX: true, lockScalingY: true, lockRotation: true })` applied somewhere
- `object.setControlsVisibility({ mt: false, mb: false, ml: false, mr: false, tl: false, tr: false, bl: false, br: false, mtr: false })` hiding/disabling handles
- `object.hasControls = false` or `object.selectable` issues
- Custom `Object.prototype` overrides on the Fabric instance
- Touch/pointer event handlers intercepting the handle drag before Fabric sees it

</code_context>

<specifics>
## Specific Ideas

Scout the drawing-mode canvas component. Look for `fabric.Canvas`, `fabric.Object`, `setControlsVisibility`, `lockScalingX`, `lockRotation`, `hasControls`. The scenario says selection "shows its selection's bounding box with scale and rotation controls" — so controls are visible. Dragging them only MOVES the object. That means either the lock flags are set, or the event handlers aren't wired to actually call scale/rotate on the object.

</specifics>

<deferred>
## Deferred Ideas

None — discuss phase skipped.

</deferred>
