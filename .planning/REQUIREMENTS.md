# Requirements: readyset-review

**Defined:** 2026-04-20 (v1.9 — hardening & consistency audit)
**Core Value:** Fast, accurate video review — frame-level precision, rich metadata, and fluid version management without leaving the browser.

## v1.9 Requirements

Synthesized from a 4-stream full-app audit (UX, backend/security, file-management flows, viewer/player). Every REQ below traces to at least one concrete audit finding.

### Security Hardening

- [ ] **SEC-01**: `GET /api/debug` is gated behind `requireAdmin` and stops returning any private-key prefix, Firebase service-account email, or git-level identifiers in the response body
- [ ] **SEC-02**: `GET /api/safe-zones` requires `getAuthenticatedUser` (read path was unauthenticated; seed transaction stays on the server side unchanged)
- [ ] **SEC-03**: `getAuthenticatedUser` in `src/lib/auth-helpers.ts` returns `null` when the user's Firestore doc has `disabled === true`, so a suspended user's still-valid Firebase ID token cannot authenticate any API route (not just `/auth/session`)
- [ ] **SEC-04**: `PATCH /api/review-links/[token]` accepts updates to every editable field — `name`, `password`, `expiresAt`, `allowComments`, `allowDownloads`, `allowApprovals`, `showAllVersions` — gated by `canEditReviewLink`; removing a password or shortening an expiry is possible in-app
- [ ] **SEC-05**: `password` field is stripped from every review-link API response shape — `/api/review-links`, `/api/review-links/all`, `/api/review-links/[token]/contents` — via a shared `serializeReviewLink` helper
- [ ] **SEC-06**: `POST /api/comments` persists `approvalStatus` onto the comment doc when provided; the value is returned on subsequent GETs
- [ ] **SEC-07**: Review-link guest comment GET uses a composite Firestore query (`assetId` + `reviewLinkId`) rather than an in-memory filter after a collection scan

### Soft-Delete Filter Sweep

- [ ] **SDC-01**: `GET /api/stats` excludes soft-deleted assets from `assetCount` and `storageBytes`
- [ ] **SDC-02**: Review-link resolution endpoints — `GET /api/review-links/[token]`, drill-down folder queries, and `GET /api/review-links/[token]/contents` — filter out soft-deleted assets and folders before returning to guests
- [ ] **SDC-03**: `POST /api/assets/copy` skips soft-deleted versions when expanding the source group; the destination never contains resurrected trash entries
- [ ] **SDC-04**: `GET /api/assets/size` excludes soft-deleted assets from folder-size totals

### Bulk Mutation Correctness

- [ ] **BLK-01**: `DELETE /api/assets/[id]` on a version stack soft-deletes every member of the group atomically (not just the representative card) when the caller's intent is delete-all-versions; an explicit single-version delete is still available via the version-stack modal's per-row delete
- [ ] **BLK-02**: Bulk move (`handleMoveSelected` in FolderBrowser) uses `Promise.allSettled`; per-item failures are surfaced via distinct toasts and the grid reflects partial success state accurately
- [ ] **BLK-03**: Bulk review-status update uses `Promise.allSettled`; the toast reports "N updated, M failed" rather than collapsing to a single failure
- [ ] **BLK-04**: Drag-to-stack merge clears the source asset's id from `selectedIds` after the merge succeeds so the selection toolbar reflects reality
- [ ] **BLK-05**: `POST /api/folders/copy` deep-copies the folder tree — subfolders + their assets — not just the top-level folder doc; behavior is documented in the API response

### Viewer Alignment

- [ ] **VWR-01**: `ExportModal` receives `initialIn` and `initialOut` from the viewer parent and pre-fills the trim bar with the player's current loop/range markers; opening Export on a marked range always starts on that range
- [ ] **VWR-02**: When `asset.duration` is 0 (still processing), the Export modal renders a "Duration not yet available" state instead of showing a permanently-disabled submit button with no explanation
- [ ] **VWR-03**: Review-link asset viewer routes documents (PDF/HTML) to `DocumentViewer`/`HtmlViewer` and other non-playable types to `FileTypeCard`, matching the internal viewer's branching
- [ ] **VWR-04**: Clicking a range-comment timeline marker in VideoPlayer writes that comment's `inPoint`/`outPoint` into the shared loop range (`rangeIn`/`rangeOut`); loop honors the clicked range, unifying the three "range" concepts (loop range, range-comment range, export trim range)
- [ ] **VWR-05**: `VUMeter`'s `sharedCtx` singleton closes when the last consumer unmounts (ref-counted), so navigating away from the viewer does not leak an AudioContext; the analyser graph is torn down on `activeSide` change in compare
- [ ] **VWR-06**: `VersionComparison` duration/readiness `useEffect`s include `selectedIdA`/`selectedIdB` in their deps so version swaps re-subscribe to the new video element and `durationA`/`durationB` stay accurate

### UX & Dashboard

- [ ] **UX-01**: Dashboard Quick Actions route correctly — "Upload Assets" opens the upload flow (either via a modal or by navigating to a project with the upload sheet open), "Invite Team" opens the Collaborators panel; no more dead links
- [ ] **UX-02**: Review-link guest comment actions — resolve and delete — either fire a real API call (when the guest has permission) or are hidden entirely (when they don't); no more silent-no-op buttons
- [ ] **UX-03**: `AssetListView` inline rename uses the shared inline-rename pattern (checkmark + X buttons, Enter commits, Escape cancels) — matches AssetCard, no more `window.prompt`
- [ ] **UX-04**: Admin `UserTable` delete flow goes through `useConfirm({ destructive: true })` instead of the ad-hoc inline confirmation
- [ ] **UX-05**: Dashboard stats show a "Collaborators" card — the value returned by `/api/stats.collaboratorCount` is surfaced (currently fetched and discarded)
- [ ] **UX-06**: Review page surfaces expiry state — links within 24 h of `expiresAt` show a banner; expired links show a dedicated message ("This link has expired") instead of the generic "Link not available"
- [ ] **UX-07**: Review page guest-info is restored in full on reload — both name and email come from a single JSON `frame_guest_info` key in localStorage (current key only stores name)

### Data Consistency & Types

- [ ] **DC-01**: Permission helpers are consolidated onto the pure `src/lib/permissions.ts` style — the deprecated async `canAccessProject(userId, projectId)` in `auth-helpers` is removed or reduced to a thin wrapper with a deprecation comment; all call sites use load-then-pure-check
- [ ] **DC-02**: `Asset` interface in `src/types/index.ts` declares every field actually written by the server — `thumbnailGcsPath`, `spriteStripGcsPath`, any other phantom fields surfaced by the audit
- [ ] **DC-03**: Asset and folder rename APIs validate name-collisions within the parent scope (same folder for assets, same project+parent for folders) — matches project rename's behavior; duplicate names are rejected with a clear error
- [ ] **DC-04**: Every `catch` block in API routes logs the error via `console.error` with a contextual prefix before returning the 500 response — no more silent swallows

### A11y & Keyboard Coordination

- [ ] **A11Y-01**: `Modal` renders with `role="dialog"`, `aria-modal="true"`, and traps Tab focus within the modal card; Escape continues to close
- [ ] **A11Y-02**: `UserDrawer` matches Modal a11y — `role="dialog"`, `aria-modal="true"`, Escape closes, focus trap active
- [ ] **A11Y-03**: `Dropdown` supports keyboard navigation — ArrowUp/Down moves selection, Enter activates, Escape closes; `role="menu"` and `role="menuitem"` set
- [ ] **A11Y-04**: `window.keydown` listener coordination — when a modal (`Modal`/`UserDrawer`/`ExportModal`) is open, underlying viewer shortcuts (Space/arrows/M/F/I/O etc.) are suppressed; driven by a shared "keyboard-owner" context or data attribute checked by each listener

## Absorbed from audits

Every REQ above traces to an audit finding. The audits also surfaced lower-severity items (Modal `size="full"` variant for AssetCompareModal, Dropdown divider API unification, `useAssets` AbortController, ReviewHeader download/approval pills, SafeZonesOverlay videoRect cleanup) — these are captured in the "v2 / Future" section and can be promoted into a follow-up milestone if the core v1.9 set ships clean.

## v2 / Future Requirements

- Modal `size="full"` variant; migrate `AssetCompareModal` to the primitive
- Unified `divider` / `dividerBefore` API between `Dropdown` and `ContextMenu`
- `useAssets` request deduplication via AbortController
- Review-link header: visual indicators for allowDownloads / allowApprovals flags
- Hash-based folder sort; lowercased shadow fields on users for case-insensitive search
- N+1 query fixes in `hardDeleteFolder` (Promise.all per BFS level)
- Trash retention policy / cron auto-purge after N days
- Inline design-file preview (AI/PSD/Figma)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Mobile app | Web-first |
| Real-time collaborative cursors | Async review workflow |
| Video transcoding library | ffmpeg trim/convert is enough |
| SSO / SAML / OIDC beyond Google | Google OAuth is the single entry |
| Role customization | Fixed role set is sufficient |
| Audit log with full event sourcing | Structured logging is enough |
| In-browser Photoshop/AE editing | Out of scope for review platform |
| Archive (zip) content extraction/preview | Download to inspect |
| Server-side HTML sandboxing beyond iframe sandbox | `sandbox` attr is the boundary |
| Auto-purge Trash after N days (cron) | Manual cleanup only |

## Traceability

Which phases cover which requirements. Populated at roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| SEC-01 | Phase 54 | Pending |
| SEC-02 | Phase 54 | Pending |
| SEC-03 | Phase 54 | Pending |
| SEC-04 | Phase 54 | Pending |
| SEC-05 | Phase 54 | Pending |
| SEC-06 | Phase 54 | Pending |
| SEC-07 | Phase 54 | Pending |
| SDC-01 | Phase 55 | Pending |
| SDC-02 | Phase 55 | Pending |
| SDC-03 | Phase 55 | Pending |
| SDC-04 | Phase 55 | Pending |
| BLK-01 | Phase 55 | Pending |
| BLK-02 | Phase 55 | Pending |
| BLK-03 | Phase 55 | Pending |
| BLK-04 | Phase 55 | Pending |
| BLK-05 | Phase 55 | Pending |
| VWR-01 | Phase 56 | Pending |
| VWR-02 | Phase 56 | Pending |
| VWR-03 | Phase 56 | Pending |
| VWR-04 | Phase 56 | Pending |
| VWR-05 | Phase 56 | Pending |
| VWR-06 | Phase 56 | Pending |
| UX-01 | Phase 57 | Pending |
| UX-02 | Phase 57 | Pending |
| UX-03 | Phase 57 | Pending |
| UX-04 | Phase 57 | Pending |
| UX-05 | Phase 57 | Pending |
| UX-06 | Phase 57 | Pending |
| UX-07 | Phase 57 | Pending |
| DC-01 | Phase 58 | Pending |
| DC-02 | Phase 58 | Pending |
| DC-03 | Phase 58 | Pending |
| DC-04 | Phase 58 | Pending |
| A11Y-01 | Phase 59 | Pending |
| A11Y-02 | Phase 59 | Pending |
| A11Y-03 | Phase 59 | Pending |
| A11Y-04 | Phase 59 | Pending |

**Coverage:**
- v1.9 requirements: 37 total
- Mapped to phases: 37 (100%)
- Unmapped: 0

---
*Requirements defined: 2026-04-20*
*Last updated: 2026-04-20 — traceability populated at roadmap creation*
