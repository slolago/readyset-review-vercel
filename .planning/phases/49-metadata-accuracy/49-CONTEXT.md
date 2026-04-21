# Phase 49: metadata-accuracy - Context

**Gathered:** 2026-04-20
**Status:** Ready for planning
**Mode:** Auto-generated (discuss skipped via workflow.skip_discuss)

<domain>
## Phase Boundary

Info panel shows accurate, type-appropriate metadata for images and videos. Stop running ffprobe on images; add an image-specific extraction path. Fix resolution/file-size inaccuracies and "Invalid Date" upload timestamp bug.
</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
- For image metadata: use the `sharp` library (already installed or add it) or `image-size` + a tiny EXIF parser. Prefer sharp since it's in most Node image pipelines.
- For the client-side pre-upload resolution: the client was probably measuring a downscaled/transformed in-memory canvas. Read dimensions from the original File object, not from a resized canvas.
- For Invalid Date: the issue is almost certainly a serialization mismatch between Firestore Admin's Timestamp shape ({_seconds,_nanoseconds}) and the client's toDate() call. Add a defensive `coerceToDate` helper.
- FileInfoPanel already supports per-type section arrays — just switch the branches on asset.type === 'image'.
</decisions>

<code_context>
## Existing Code Insights

- src/app/api/assets/[assetId]/probe/route.ts — ffprobe route (should bail early for images)
- src/app/api/upload/complete/route.ts — fires the probe in background; also needs image branch
- src/components/viewer/FileInfoPanel.tsx — renders the sections; already branches on video/image
- src/hooks/useAssets.ts and upload hooks — measure width/height/duration client-side before upload
- src/types/index.ts — Asset has width/height/size; size may be wrong if uploader sends a transcoded value
- formatDate in FileInfoPanel handles Timestamp + {_seconds}; verify it also handles {seconds, nanoseconds} (Admin SDK shape when returned over JSON)
</code_context>

<specifics>
## Specific Ideas

Success criteria:
1. JPEG 2250×4000 / 718KB displayed as 2250×4000 / 718KB
2. Image asset info panel hides video-only fields (Container, Pixel format, Color space, Overall bitrate)
3. Video asset info panel unchanged
4. "Upload — Date" row shows human-readable date, never "Invalid Date"
</specifics>

<deferred>
## Deferred Ideas

- Full EXIF panel (orientation, camera, exposure) — nice-to-have, out of scope
- HDR/color-profile deep inspection for images — deferred
</deferred>
