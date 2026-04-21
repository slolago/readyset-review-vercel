---
phase: 56-viewer-alignment
plan: 01
verified_by: automated
human_needed: true
---

# Phase 56 Plan 01: Verification

## Automated (passed)

- `npx tsc --noEmit` — clean after each task (VWR-01..06).
- `npx vitest run` — 138/138 tests pass across `format-date`, `permissions`, `permissions-api`.
- Per-task atomic commits verified via `git log --oneline` (hashes in SUMMARY Self-Check).

## Human-needed

### 1. Review-page routing cascade (VWR-03)

Needs a real asset mix on a live review link. Create a review link with:
- at least one PDF asset
- at least one HTML asset
- at least one arbitrary file type (e.g. `.zip`, `.txt`, `.ai`)

Open the link in an incognito window. Expect:
- PDF → renders in `DocumentViewer` (embedded PDF, not a broken image).
- HTML → renders in `HtmlViewer` (iframe/sandboxed, not a broken image).
- Other type → renders in `FileTypeCard` (file-type card with icon + download button if `allowDownloads`).

If any of those fall into `ImageViewer` (the old else-branch), the cascade is still wrong and this task regressed.

### 2. VUMeter AudioContext leak verification under real navigation (VWR-05)

The unit of work (`consumerCount` bump/decrement) is correct by inspection, but the intent of the fix is "no AudioContext leak across page transitions". That's observable only in a real browser across real navigations.

Procedure:
1. Open the viewer for a video asset → VUMeter mounts (context 1 created).
2. Navigate back to the project page (viewer unmounts) → `sharedCtx.close()` should run, `sharedCtx` nulled.
3. Open another video asset → VUMeter mounts again, `getOrCreateAudioContext()` should build a FRESH context.
4. Open Chrome devtools → Performance Monitor or `chrome://media-internals` → confirm only ONE active AudioContext after step 3 (not two).
5. Repeat toggling compare mode on/off several times, then close the tab. The count of AudioContexts during the session should stay at 0 or 1, never climb.

If the count climbs with each navigation, the decrement isn't firing (most likely: the effect is being re-created on re-render, implying the `[]` deps assumption broke).

## Out of Scope (deferred)

- Phase-wide smoke tests in `56-01-PLAN.md` verification section (1–6) are manual by design and require a running dev server with uploaded assets. The automation-first mandate doesn't apply — there's no checkpoint gating them; these are post-ship sanity checks.
