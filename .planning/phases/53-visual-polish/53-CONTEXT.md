# Phase 53: visual-polish - Context

**Gathered:** 2026-04-20
**Status:** Ready for planning
**Mode:** Auto-generated (discuss skipped via workflow.skip_discuss)

<domain>
Close 8 visible UI-polish bugs reported during v1.7 QA.
</domain>

<decisions>
### Claude's Discretion
- VIS-01 (New Folder modal accent): fix root cause in Modal.tsx — accent line has rounded-t-2xl but maybe incorrect left/right clip.
- VIS-02 (folder content thumbnails): fetch first 4 asset thumbnails for each folder; tile 2x2 or stack. Use existing thumbnailSignedUrl field.
- VIS-03 (rename confirm): replace blur-to-save with explicit checkmark + X buttons. Blur does NOTHING until user commits.
- VIS-04 (aspect ratio): change AssetCard thumbnail container — use object-contain within fixed aspect ratio, not object-cover stretch.
- VIS-05 (version count dupe): grep for double-render source; remove one.
- VIS-06 (tag contrast): add semi-opaque dark background + backdrop-blur to tag pills.
- VIS-07 (review link modal overflow): audit CreateReviewLinkModal — some child pickers (folder/asset lists) probably lack overflow-hidden or max-height.
- VIS-08 (Quick Actions routing): dashboard Quick Actions buttons all go to same href — find the dashboard component, fix each action's target.
</decisions>

<code_context>
- src/components/ui/Modal.tsx
- src/components/files/FolderBrowser.tsx (folder cards)
- src/components/files/AssetCard.tsx (thumbnail + rename inline)
- src/components/review/CreateReviewLinkModal.tsx
- src/app/(app)/dashboard/page.tsx (Quick Actions)
</code_context>

<specifics>
8 success criteria — one per VIS-NN item.
</specifics>

<deferred>
None.
</deferred>
