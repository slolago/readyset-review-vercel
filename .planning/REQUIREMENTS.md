# Requirements: readyset-review

**Defined:** 2026-04-21 (v2.2 — dashboard & annotation UX fixes)
**Core Value:** Fast, accurate video review — frame-level precision, rich metadata, and fluid version management without leaving the browser.

## v2.2 Requirements

9 UI/UX bugs reported from hands-on use of the dashboard file browser, inline rename flow, and drawing-mode canvas. Grouped by UI surface.

### Context menu behavior

- [ ] **CTX-02**: In grid view, a right-click context menu on an asset or folder stays inside the viewport regardless of position. When the natural anchor would push the menu off-screen (e.g. asset rows sitting below folder rows push the menu past the bottom edge), the menu flips up/left so every item remains clickable.
- [ ] **CTX-03**: Left-clicking anywhere outside an open context menu (empty space, another card, the sidebar, the header) closes the menu. Right-clicking on a different object replaces the open menu instead of stacking — only one context menu can be open at a time. Escape also closes.
- [ ] **CTX-04**: The right-click context menu exposes the full action set for the clicked target. The floating bottom selection bar may remain a curated shortcut of common actions, but the right-click menu is always the superset. When an asset + folder are both in the current selection, right-clicking either one opens the same menu (a consistent intersection, or the full set with target-appropriate actions disabled) — not two different menus depending on which card the cursor lands on.
- [ ] **CTX-05**: Right-clicking a folder opens the context menu and each menu item runs its action (Rename, Duplicate, Move, Copy, Delete, Share, etc.). Clicking an item never falls through to the folder's default double-click "open" behavior. The same menu that works via the three-dots button works via right-click.

### Grid / list affordances

- [x] **VIEW-01**: The list/grid view toggle is available and functional when the current folder contains only folders (no assets). Switching to list view renders folders as rows matching the existing list view for mixed contents.
- [x] **VIEW-02**: On an asset card in grid view, the three-dots overflow button is reachable and clickable. Hovering the card shows the button; moving the cursor over the button keeps it visible and interactive. The real-time hover preview does not consume pointer events over the three-dots hit region (z-order, pointer-events, or an explicit hover-preview exclusion zone) so the button behaves identically to the three-dots on folder cards.

### Inline edit + mutations

- [x] **EDIT-01**: When renaming a folder or asset via the inline rename input, clicking anywhere outside the input (another card, empty space, sidebar, header) cancels the rename and reverts the name. Only the confirm affordance (check icon or Enter key) commits the new name. Only one rename input can be active across the whole file browser at any time — opening rename on object B while A is still editing cancels A first.
- [x] **FS-01**: Selecting "Duplicate" on a folder (via three-dots or right-click) creates a real duplicate of the folder — same contents, new id, "(copy)" naming treatment or whatever rule the asset duplicate uses — and the duplicate appears in the current folder listing. The success toast only fires after the duplicate actually persists. Parity with asset duplicate behavior.

### Drawing mode

- [x] **DRAW-01**: In drawing mode over an asset, selecting a single object (text, arrow, freehand vector) with the selection tool shows the Fabric.js bounding box with working scale + rotation handles. Dragging a corner handle scales the object; dragging the rotation handle rotates it. Single-object transforms match multi-object transforms — the controls are not movement-only.

## Absorbed from prior milestones

See `.planning/MILESTONES.md` — v1.7 through v2.1 shipped.

## v3 / Future Requirements

- Server-side cron: Trash auto-purge, stale job sweeper, orphan GCS object cleanup, orphan asset cleanup (projectId references deleted project)
- Presence indicators
- Notifications (in-app + email)
- Per-asset watermarks
- AI auto-tagging + semantic search
- Bulk export
- Real-time project list updates via Firestore onSnapshot (would obsolete PERF-06's fetch-and-cache approach)
- Middleware-based session cookie infra (unlocks true SSR prefetch on dashboard Server Component from v2.1)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Real-time collaborative cursors | Async workflow |
| Offline mode | Real-time collab is core |
| Mobile app | Web-first |
| SSO beyond Google | Single entry point |
| Custom role matrices | Fixed role set |
| In-browser AE/Photoshop | Review platform, not editor |
| Zip preview | Download to inspect |
| Full event-sourced audit log | Structured logging + Firestore history sufficient |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| CTX-02 | Phase 70 | Pending |
| CTX-03 | Phase 70 | Pending |
| CTX-04 | Phase 70 | Pending |
| CTX-05 | Phase 70 | Pending |
| VIEW-01 | Phase 71 | Complete |
| VIEW-02 | Phase 71 | Complete |
| EDIT-01 | Phase 72 | Complete |
| FS-01 | Phase 72 | Complete |
| DRAW-01 | Phase 73 | Complete |

**Coverage:**
- v2.2 requirements: 9 total
- Mapped to phases: 9 (100%)
- Unmapped: 0

---
*Requirements defined: 2026-04-21*
*Last updated: 2026-04-21 — v2.2 roadmap created, all 9 REQs mapped to phases 70–73*
