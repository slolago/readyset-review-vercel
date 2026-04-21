# Phase 72: inline-edit-and-folder-duplicate - Context

**Gathered:** 2026-04-21
**Status:** Ready for planning
**Mode:** Auto-generated (discuss skipped via workflow.skip_discuss)

<domain>
## Phase Boundary

Inline rename is safely cancellable and never double-mounted, and folder Duplicate actually persists a copy instead of firing a success toast on nothing.

Requirements in scope: EDIT-01, FS-01.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices are at Claude's discretion — discuss phase was skipped per user setting. Use ROADMAP phase goal, success criteria, and codebase conventions to guide decisions.

</decisions>

<code_context>
## Existing Code Insights

Codebase context will be gathered during plan-phase research.

Relevant prior art:
- `<InlineRename />` primitive from v1.9 Phase 57 (`src/components/ui/InlineRename.tsx`) is the rename input — used in grid + list views today. Per v1.8 Phase 53, rename uses Check/X confirm buttons and blur does NOT commit. Need to verify that blur cancels (not commits) today, and that only one rename is active at a time.
- `src/lib/folders.ts::deepCopyFolder` (v1.9 Phase 55) is the existing helper for recursive folder copying using BFS + Promise.all — this is what asset-duplicate uses under the hood for "copy to folder" and what folder-duplicate should reuse.
- Asset duplicate naming rule (no "copy of" prefix) from v1.5 Phase 39 — folder Duplicate should match for parity (same name as source; Firestore IDs are unique anyway).

</code_context>

<specifics>
## Specific Ideas

- EDIT-01: The "only one rename active at a time" invariant is best enforced by lifting rename state to a higher component (e.g. FolderBrowser or a small provider) — single `activeRenameId` that when set, other cards must see and un-mount their input. Alternative: InlineRename listens for a custom event or document-level click, self-cancelling. Prefer lifted state — cleaner and already used for context menu singleton in Phase 70.
- EDIT-01 cancel-on-outside-click: document-level pointerdown listener inside InlineRename that checks `!inputRef.contains(e.target)` and cancels. Escape already cancels (standard pattern); Enter / check commits.
- FS-01: Likely there's an existing `/api/folders/[id]/duplicate` route that's either (a) missing entirely, (b) stubbed, or (c) doing the wrong thing (e.g. firing a toast without making the API call). Grep for "Folder duplicated" to find the call site, then trace backward. If the route is missing, add it using `deepCopyFolder` as the core logic. Match the asset-duplicate endpoint's response shape + error handling.

</specifics>

<deferred>
## Deferred Ideas

None — discuss phase skipped.

</deferred>
