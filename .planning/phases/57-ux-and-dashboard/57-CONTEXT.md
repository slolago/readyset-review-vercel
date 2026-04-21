# Phase 57: ux-and-dashboard - Context

**Gathered:** 2026-04-20
**Status:** Ready (skip_discuss)

<domain>
UX polish: wire dashboard Quick Actions, make review-link guest resolve/delete work, migrate AssetListView rename to inline pattern, unify admin table delete with useConfirm, surface review-link expiry state, add collaborator stat card, persist guest email in localStorage.
</domain>

<decisions>
### Claude's Discretion
- UX-01: Quick Actions — "Upload Assets" navigates to `/projects?create=1` or if projects exist, to the first project's folder with `?action=upload` (which projects page interprets via useEffect); "Invite Team" → same first project with `?action=invite` opening CollaboratorsPanel. "Browse Projects" → `/projects`. If no projects exist, both upload+invite land on the empty-state with CTA to create project first.
- UX-02: Review-link guest resolve/delete — pass reviewToken in the comment API call, server already supports it via permission chain. Check `link.allowComments` before rendering buttons.
- UX-03: Extract inline-rename from AssetCard into a shared `<InlineRename value onCommit onCancel />` component; use in both grid + list.
- UX-04: Replace UserTable ad-hoc confirm toggle with `useConfirm({ destructive: true, title: 'Delete user "X"?'})`.
- UX-05: Add Collaborators stat card to dashboard grid. Icon: Users.
- UX-06: ReviewHeader shows banner when expiresAt is < 24h away ("This link expires in Xh"); expired link error screen distinct.
- UX-07: Migrate guest info to single `frame_guest_info` JSON key (read legacy `frame_guest_name` for backward compat on first load).
</decisions>

<code_context>
- src/app/(app)/dashboard/page.tsx — Quick Actions + stat cards
- src/app/(app)/projects/page.tsx — no action query param handling
- src/app/review/[token]/page.tsx — resolve/delete hardcoded, guest-name-only localStorage
- src/components/viewer/CommentSidebar.tsx + CommentItem.tsx — resolve/delete button visibility
- src/components/files/AssetCard.tsx — inline rename (extract)
- src/components/files/AssetListView.tsx — window.prompt (migrate)
- src/components/admin/UserTable.tsx — ad-hoc confirm
- src/components/review/ReviewHeader.tsx — no expiry banner
- src/app/api/stats/route.ts — collaboratorCount already returned but not rendered
</code_context>

<specifics>
7 REQs: UX-01..07
</specifics>

<deferred>None</deferred>
