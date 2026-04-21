# Phase 50: review-links-repair - Context

**Gathered:** 2026-04-20
**Status:** Ready for planning
**Mode:** Auto-generated (discuss skipped via workflow.skip_discuss)

<domain>
## Phase Boundary

Restore the project-scoped review-link flows that regressed in v1.7: "Add to review link" modal error and empty project-scoped views.
</domain>

<decisions>
## Implementation Decisions
### Claude's Discretion
- Root cause is likely a mismatch between API query shape (projectId filter) and the client call. The v1.7 access-model rewrite may have tightened the API's expected inputs.
- Fix is likely: align the client `/api/review-links?projectId=X` calls to the current server shape, and make sure the sidebar + tab components pass the projectId.
</decisions>

<code_context>
Relevant files:
- src/app/api/review-links/route.ts — list endpoint (probably filters by projectId)
- src/app/api/review-links/[linkId]/route.ts — edit/delete endpoint
- src/components/review-links/AddToReviewLinkModal.tsx OR similar — "Add to review link" modal
- src/components/review-links/CreateReviewLinkModal.tsx — creation
- src/app/(app)/projects/[projectId]/review-links/page.tsx — project review-links tab
- src/components/layout/ProjectTreeNav.tsx — sidebar shortcut
- src/lib/permissions.ts — canListReviewLinks / similar gate (Phase 44 artifact)
</code_context>

<specifics>
Success criteria:
1. "Add to review link" modal loads without "Failed to load review links" toast
2. Sidebar Review Links shortcut lists project's links
3. Project's Review Links tab lists project's links (same set as sidebar)
4. Global Review Links page still works
</specifics>

<deferred>
None.
</deferred>
