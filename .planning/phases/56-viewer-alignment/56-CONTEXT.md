# Phase 56: viewer-alignment - Context

**Gathered:** 2026-04-20
**Status:** Ready (skip_discuss)

<domain>
Unify the three "range" concepts (loop range, range-comment range, export trim), route non-playable assets correctly in review pages, and fix the AudioContext + duration-effect lifecycle bugs surfaced by the audit.
</domain>

<decisions>
### Claude's Discretion
- VWR-01: Plumb `rangeIn`/`rangeOut` from viewer page to ExportModal via initialIn/initialOut props (they already exist on the modal interface)
- VWR-02: Render a different modal state when duration is unknown (0): "Encoding in progress — export will be available once metadata is ready" + disable submit + show Cancel only
- VWR-03: Copy the routing cascade from internal viewer (VideoPlayer → ImageViewer → DocumentViewer → HtmlViewer → FileTypeCard) into review/[token]/page.tsx
- VWR-04: Clicking a range-comment timeline marker sets rangeIn/rangeOut state (lifted state) — unifies with loop + composer
- VWR-05: Ref-count the VUMeter AudioContext. When refs==0, close().
- VWR-06: Move the `loadedmetadata` effects into a useEffect with [selectedIdA]/[selectedIdB] deps (or use the onLoadedMetadata inline handler approach)
</decisions>

<code_context>
- src/app/(app)/projects/[projectId]/assets/[assetId]/page.tsx (ExportModal render, line 367)
- src/components/viewer/ExportModal.tsx (line 46 duration default)
- src/app/review/[token]/page.tsx (only routes video/image)
- src/components/viewer/VideoPlayer.tsx (rangeComments render, handleCommentClickFromTimeline)
- src/components/viewer/VUMeter.tsx (sharedCtx singleton)
- src/components/viewer/VersionComparison.tsx (durationA/B effect deps)
</code_context>

<specifics>
6 REQs: VWR-01..06
</specifics>

<deferred>None</deferred>
