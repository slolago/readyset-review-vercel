# Phase 51: file-type-expansion - Context

**Gathered:** 2026-04-20
**Status:** Ready for planning
**Mode:** Auto-generated (discuss skipped via workflow.skip_discuss)

<domain>
Accept PDFs, archives, fonts, HTML, and editable design files. Inline-preview what's previewable (PDF, HTML); show a clean file-type card for the rest.
</domain>

<decisions>
### Claude's Discretion
- Introduce a new AssetType enum extension: 'video' | 'image' | 'document' | 'archive' | 'font' | 'design' | 'web' (or simpler: keep 'video'/'image' and add 'other' with a subtype field).
- Viewer: PDFs via `<iframe>` pointing to the signed URL (Chrome's built-in PDF viewer works fine and is zero-deps); HTML via sandboxed `<iframe sandbox="allow-scripts">`.
- For non-viewable types: a file-type card component with Lucide icon (FileArchive, FileType, FileCode, Palette icons) + name + size + uploader + date + Download button.
- Client + server allow-lists must agree. Centralize MIME map in src/lib/file-types.ts.
- Don't touch the stack-version concept — documents can have versions just like videos.
</decisions>

<code_context>
Relevant files:
- src/hooks/useUpload.ts (or useAssets) — has the MIME allow-list
- src/app/api/upload/signed-url/route.ts — server allow-list
- src/types/index.ts — Asset type definitions
- src/components/files/AssetCard.tsx — grid card, shows thumbnail or icon
- src/app/(app)/projects/[projectId]/assets/[assetId]/page.tsx — viewer page (conditionally renders VideoPlayer vs ImageViewer)
- src/components/viewer/FileInfoPanel.tsx — info sidebar
</code_context>

<specifics>
Success criteria:
1. Uploader accepts PDF, .zip, .ttf/.otf/.woff/.woff2, .html, .ai, .psd, .aep, .fig (MIME + extension)
2. PDF opens in an inline viewer inside the asset page
3. HTML opens in a sandboxed iframe inside the asset page
4. Archive/font/design files show a file-type icon + metadata card (not broken preview)
5. Grid cards for non-viewable types show file-type icon (not broken thumbnail)
</specifics>

<deferred>
- Zip content extraction/preview
- Inline design-file rendering (.psd/.ai/.fig preview)
- Font preview (type specimen)
- PDF annotations
</deferred>
