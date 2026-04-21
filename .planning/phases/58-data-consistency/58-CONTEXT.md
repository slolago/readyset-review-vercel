# Phase 58: data-consistency - Context

**Gathered:** 2026-04-20
**Status:** Ready (skip_discuss)

<domain>
Consolidate permission helpers onto pure functions, declare phantom Asset fields, add name-collision validation on rename, and log all silent catches.
</domain>

<decisions>
### Claude's Discretion
- DC-01: Remove or deprecate `canAccessProject(userId, projectId)` async from `auth-helpers.ts`; migrate every caller to load project once, then call the pure `canAccessProject(user, project)` from `src/lib/permissions.ts`. The audit flagged: /api/assets/size, /api/review-links/[token]/viewers, folders ancestor walks.
- DC-02: Audit server route files and `src/lib/trash.ts` for any field name written to Asset docs. Ensure `src/types/index.ts::Asset` declares every server-written field. Likely additions: `thumbnailGcsPath`, `spriteStripGcsPath`, `approvalStatus` (from SEC-06), maybe others.
- DC-03: Asset rename → query siblings in same folder (`where('projectId','==',X).where('folderId','==',Y)`) + in-memory filter not-deleted + case-insensitive compare. Folder rename → siblings at same parent.
- DC-04: grep for `catch {}`, `catch (_e) {}`, `catch { }` in all api routes; replace with `catch (err) { console.error('[route-name]', err); ... }`.
</decisions>

<code_context>
- src/lib/auth-helpers.ts (deprecated canAccessProject async wrapper)
- src/lib/permissions.ts (pure canAccessProject)
- src/app/api/assets/size/route.ts
- src/app/api/review-links/[token]/viewers/route.ts
- src/app/api/folders/[folderId]/route.ts
- src/app/api/assets/[assetId]/route.ts (rename)
- src/app/api/folders/[folderId]/route.ts (rename)
- src/app/api/projects/[projectId]/route.ts (collision reference pattern)
- src/types/index.ts
- src/lib/trash.ts
- grep output for `catch {}` in src/app/api
</code_context>

<specifics>
4 REQs: DC-01..04
</specifics>

<deferred>None</deferred>
