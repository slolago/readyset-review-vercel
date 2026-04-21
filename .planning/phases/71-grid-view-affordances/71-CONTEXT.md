# Phase 71: grid-view-affordances - Context

**Gathered:** 2026-04-21
**Status:** Ready for planning
**Mode:** Auto-generated (discuss skipped via workflow.skip_discuss)

<domain>
## Phase Boundary

Grid and list view work in all folder states, and the per-card three-dots button on assets is reliably clickable without the hover preview stealing the pointer.

Requirements in scope: VIEW-01, VIEW-02.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices are at Claude's discretion — discuss phase was skipped per user setting. Use ROADMAP phase goal, success criteria, and codebase conventions to guide decisions.

</decisions>

<code_context>
## Existing Code Insights

Codebase context will be gathered during plan-phase research.

Relevant prior art: list view for folders existed and worked at some point in v1.2; the hover preview is part of AssetCard (video scrubbing on mouse X position inside the thumbnail area).

</code_context>

<specifics>
## Specific Ideas

- VIEW-01: The toggle almost certainly has a guard like `if (assets.length === 0) return null` or similar — verify and remove.
- VIEW-02: The hover preview consumes `onMouseMove` across the whole thumbnail area, including the region behind the three-dots button. Two reasonable fixes:
  a) Raise the three-dots button's z-index and set `pointer-events: auto` above the preview overlay
  b) Exclude a hit region (top-right corner, ~48×48px) from the preview's pointer-event capture
  Approach (a) is simpler and preferred.
- Asset + folder three-dots should be visually + functionally identical after the fix.

</specifics>

<deferred>
## Deferred Ideas

None — discuss phase skipped.

</deferred>
