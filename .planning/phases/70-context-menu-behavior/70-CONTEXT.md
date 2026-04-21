# Phase 70: context-menu-behavior - Context

**Gathered:** 2026-04-21
**Status:** Ready for planning
**Mode:** Auto-generated (discuss skipped via workflow.skip_discuss)

<domain>
## Phase Boundary

Right-click context menus in the file browser behave predictably — they stay on-screen, close when they should, expose the full action set, and every action actually runs on folders.

Requirements in scope: CTX-02, CTX-03, CTX-04, CTX-05.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices are at Claude's discretion — discuss phase was skipped per user setting. Use ROADMAP phase goal, success criteria, and codebase conventions to guide decisions. Reuse existing Dropdown / ContextMenu component (set up with a11y + keyboard nav in v1.9 Phase 59) — no new menu primitive.

</decisions>

<code_context>
## Existing Code Insights

Codebase context will be gathered during plan-phase research.

Relevant prior art: `role="menu"` + arrow-key nav pattern from v1.9 Phase 59; `<InlineRename />` from v1.9 Phase 57; floating bottom selection bar exists in files browser.

</code_context>

<specifics>
## Specific Ideas

- Viewport clipping: prefer a standard anchor-flip approach (measure menu size post-open, flip horizontally / vertically if it would overflow) over CSS-only clamping
- Click-away: single document-level listener managed by the menu component (or a provider), not per-card listeners
- Action parity: build one action-list factory keyed by target kind (asset/folder/mixed), consumed by right-click menu + three-dots menu + bottom selection bar
- Folder right-click: the bug is almost certainly an event propagation issue — the folder card's click-to-open handler is firing when the menu item is clicked, or the context menu's own item-click handler is calling the parent's onOpen

</specifics>

<deferred>
## Deferred Ideas

None — discuss phase skipped.

</deferred>
