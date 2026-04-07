# Phase 21: admin-panel-polish — Research

**Researched:** 2026-04-07
**Domain:** Next.js admin UI, Firestore multi-collection queries, role system display
**Confidence:** HIGH

---

## Summary

The admin panel currently covers only user management: a user table with role selects, a stats bar, and an invite modal. It has no visibility into projects at all. Phase 21 adds a second concern to the admin panel: surfacing all projects in the system (every project regardless of owner) with their owner name/email visible, and cleaning up an inconsistency in how roles are displayed across the app.

Two distinct role systems co-exist in this codebase and are partially confused:

1. **System role** (stored in `users` collection): `admin | manager | editor | viewer`. This governs platform-wide access — who can log in as admin, etc.
2. **Project-level collaborator role** (stored inside each `projects` document, `collaborators[]` array): `owner | editor | reviewer`. This governs access within a specific project.

The "clean up roles display" part of the phase likely targets one or both of: (a) the stale `UserRoleSelect.tsx` component that still uses the obsolete two-value `admin | user` type instead of the four-value system role enum, and (b) making the collaborator roles on projects visually consistent (the `Badge` component already handles `owner/editor/reviewer` well in `CollaboratorsPanel`).

The "admin sees all projects with owner info" part requires a new admin-only API endpoint (or extending the existing `/api/admin/users` pattern) that fetches all projects from Firestore (no `ownerId` filter) and joins the owner's name/email from the `users` collection — then surfaces this in a new tab or section on the admin page.

**Primary recommendation:** Add a "Projects" tab to the admin page (parallel to the existing Users view); fetch all projects server-side via a new `/api/admin/projects` route that joins owner data from `users`; clean up `UserRoleSelect.tsx` to use the real four-value type, and audit any other place `admin | user` leaks.

---

## Standard Stack

### Core (already in project — no new installs)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Next.js App Router | 14.x | Page routing, API routes | Already in use throughout |
| Firebase Admin SDK | 12.x | Server-side Firestore reads | All admin routes use `getAdminDb()` |
| Lucide React | latest | Icons (Shield, FolderOpen, etc.) | Used everywhere in admin UI |
| react-hot-toast | latest | Success/error toasts | Used in admin page already |
| Tailwind CSS | 3.x | Styling | Project-wide utility classes |

No new packages required.

---

## Architecture Patterns

### Recommended Project Structure
No new files needed at the component level beyond what mirrors existing admin components:

```
src/
├── app/
│   ├── (app)/admin/page.tsx          # Add "Projects" tab + ProjectsTable section
│   └── api/admin/
│       ├── users/route.ts            # Existing — no change needed
│       └── projects/route.ts         # NEW — GET all projects with owner join
├── components/admin/
│   ├── UserTable.tsx                 # Existing — no change needed
│   ├── UserRoleSelect.tsx            # FIX — update type from 'admin'|'user' to four-value enum
│   ├── CreateUserModal.tsx           # Existing — no change needed
│   └── ProjectsTable.tsx             # NEW — renders admin view of all projects
```

### Pattern 1: Admin API with Owner Join
The pattern used for user listing (GET `/api/admin/users` with `requireAdmin`) applies directly to projects.

**What:** Fetch all projects collection; for each unique `ownerId`, batch-fetch from `users` collection.
**When to use:** When admin needs cross-user data that normal users can't see.

```typescript
// Source: pattern from /api/admin/users/route.ts + /api/projects/route.ts
import { requireAdmin } from '@/lib/auth-helpers';
import { getAdminDb } from '@/lib/firebase-admin';

export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const db = getAdminDb();

  // Step 1: fetch all projects (no filter — admin sees everything)
  const projectsSnap = await db.collection('projects').orderBy('createdAt', 'desc').get();
  const projects = projectsSnap.docs.map((d) => ({ id: d.id, ...d.data() } as any));

  // Step 2: collect unique owner IDs
  const ownerIds = [...new Set(projects.map((p: any) => p.ownerId).filter(Boolean))];

  // Step 3: batch fetch owners (Firestore getAll handles up to 500)
  const ownerDocs = ownerIds.length > 0
    ? await db.getAll(...ownerIds.map((id) => db.collection('users').doc(id as string)))
    : [];
  const ownerMap = new Map(
    ownerDocs.filter((d) => d.exists).map((d) => [d.id, { id: d.id, ...d.data() }])
  );

  // Step 4: enrich projects with owner info
  const enriched = projects.map((p: any) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    color: p.color,
    createdAt: p.createdAt,
    ownerId: p.ownerId,
    ownerName: (ownerMap.get(p.ownerId) as any)?.name ?? 'Unknown',
    ownerEmail: (ownerMap.get(p.ownerId) as any)?.email ?? '',
    collaboratorCount: (p.collaborators || []).length,
  }));

  return NextResponse.json({ projects: enriched });
}
```

**Key efficiency note:** `db.getAll()` is a single Firestore RPC for multiple docs, far cheaper than individual `.get()` calls per project. Confirmed pattern from Firebase Admin SDK documentation.

### Pattern 2: Tab Navigation on Admin Page
The existing admin page has a single "Users" view. Adding a "Projects" tab uses the same pattern as other tab-based views in the app (e.g., Phase 09-review-link-enhancements added tabs to the Review Links view with `-mb-px` border overlap trick from STATE.md decisions).

```typescript
// Source: pattern from ReviewLinksTab + admin/page.tsx structure
const [activeTab, setActiveTab] = useState<'users' | 'projects'>('users');

// Tab bar (same -mb-px connected underline pattern documented in STATE.md)
<div className="flex gap-1 border-b border-frame-border -mb-px">
  {(['users', 'projects'] as const).map((tab) => (
    <button
      key={tab}
      onClick={() => setActiveTab(tab)}
      className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors capitalize ${
        activeTab === tab
          ? 'border-frame-accent text-white'
          : 'border-transparent text-frame-textSecondary hover:text-white'
      }`}
    >
      {tab === 'users' ? 'Users' : 'All Projects'}
    </button>
  ))}
</div>
```

### Pattern 3: ProjectsTable Component
Mirror the `UserTable` structure — a table with columns: Project Name, Owner, Collaborators (count), Created. No edit actions needed for MVP (admin is read-only for projects in v1).

```typescript
// Source: mirrors UserTable.tsx structure
export function ProjectsTable({ projects, loading }: ProjectsTableProps) {
  // columns: name | owner (name + email) | collaborators count | created
}
```

### Pattern 4: UserRoleSelect Fix
`UserRoleSelect.tsx` currently types `currentRole` as `'admin' | 'user'` — a stale two-value type that doesn't match the actual four-value system role enum (`admin | manager | editor | viewer`). This component appears to be a dead file — it is NOT imported by `UserTable.tsx` (which has its own inline `<select>`). It should either be deleted or updated to match the real type.

**Action:** Delete `UserRoleSelect.tsx` since `UserTable.tsx` already has its own inline role select with the correct four values. Or update the type to match — but since it's unused, deletion is cleaner.

### Anti-Patterns to Avoid
- **Per-owner `.doc(id).get()` in a loop:** Expensive for large project lists. Use `db.getAll()` instead.
- **Fetching all assets per project in the admin projects view:** Not needed — just project metadata with owner join.
- **Re-using the regular `/api/projects` endpoint for admin:** That route filters by the requesting user's ownership/collaboration; admin needs ALL projects regardless of ownership.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Batch user lookups | Individual `.get()` per owner | `db.getAll(...refs)` | Single RPC, better Firestore billing |
| Auth enforcement | Custom token check | `requireAdmin()` from `@/lib/auth-helpers` | Already exists and tested |
| Role badge rendering | Custom span | `RoleBadge` already in `UserTable.tsx`, `Badge` in `CollaboratorsPanel.tsx` | Consistent styling |
| Loading states | Custom spinner logic | `<Spinner />` from `@/components/ui/Spinner` | Already used throughout admin |

---

## Key Findings: Roles Display Inconsistency

### Two Separate Role Systems

The codebase has two distinct role concepts that currently appear side-by-side in the admin panel without visual differentiation:

| System | Where Stored | Values | Used For |
|--------|-------------|--------|----------|
| **System role** | `users/{uid}.role` | `admin`, `manager`, `editor`, `viewer` | Platform-wide access level |
| **Project role** | `projects/{id}.collaborators[].role` | `owner`, `editor`, `reviewer` | Per-project access level |

The `UserRoleSelect.tsx` component (stale) uses `admin | user` — a completely outdated two-value system that predates the current four-value enum. It is not imported anywhere active; it can safely be deleted.

The `CollaboratorsPanel.tsx` correctly uses `owner | editor | reviewer` via the `Badge` component with colour coding (`purple | success | info`).

The `UserTable.tsx` correctly uses `admin | manager | editor | viewer` for system roles with inline styled `<select>` and `RoleBadge`.

**The "clean up" work** is:
1. Delete `UserRoleSelect.tsx` (dead file, wrong types)
2. Optionally add descriptive tooltips or help text on the admin page clarifying that "system role" (on the Users tab) vs. "project role" (on the Projects tab collaborators list) are different things
3. Ensure the new Projects tab uses the correct project-level role labels (`owner/editor/reviewer`) — not system roles

---

## Common Pitfalls

### Pitfall 1: Confusing System Role and Project Role
**What goes wrong:** Showing the user's system role (`admin/manager/editor/viewer`) on the projects table when the per-project collaborator role (`owner/editor/reviewer`) is what's meaningful for project access.
**Why it happens:** Two role systems with overlapping label names (`editor` appears in both).
**How to avoid:** Keep the two tables visually separate. On the Projects tab, show project collaborator roles from `collaborators[]`, not the user's system role.
**Warning signs:** If you see "editor" in a project context fetched from `users.role`, it's the wrong field.

### Pitfall 2: Missing `requireAdmin` on New Route
**What goes wrong:** Sensitive admin data (all projects, all owners) exposed to any authenticated user.
**Why it happens:** Forgetting to swap `getAuthenticatedUser` for `requireAdmin`.
**How to avoid:** Always use `requireAdmin(request)` in `/api/admin/*` routes.

### Pitfall 3: N+1 Owner Lookups
**What goes wrong:** Fetching 50 projects then doing 50 individual `db.collection('users').doc(id).get()` calls.
**Why it happens:** Loop-based fetching is the naive approach.
**How to avoid:** Collect all unique ownerIds first, then `db.getAll()` in one call.

### Pitfall 4: Forgetting `orderBy` Before Deploying
**What goes wrong:** `orderBy('createdAt', 'desc')` on the projects collection may require a Firestore composite index if combined with other filters later.
**Why it happens:** Single-field orderBy on `createdAt` alone usually works without a composite index, but chaining with `.where()` on another field would require one.
**How to avoid:** For the admin endpoint, no additional `where()` filter is needed — just `orderBy('createdAt', 'desc').get()` which works on the default index.

### Pitfall 5: Stale `UserRoleSelect` Type Confusion
**What goes wrong:** A developer imports `UserRoleSelect` for a new use case and passes the correct four-value role type, getting a TypeScript error.
**Why it happens:** The component interface says `'admin' | 'user'`.
**How to avoid:** Delete `UserRoleSelect.tsx` entirely in this phase (it is unused).

---

## Code Examples

### Firestore `getAll` Batch Pattern
```typescript
// Source: Firebase Admin SDK — batch document fetch
// Efficient owner lookup for N projects
const ownerIds = [...new Set(projects.map((p) => p.ownerId).filter(Boolean))];
const refs = ownerIds.map((id) => db.collection('users').doc(id));
const ownerDocs = refs.length > 0 ? await db.getAll(...refs) : [];
const ownerMap = new Map(
  ownerDocs.filter((d) => d.exists).map((d) => [d.id, d.data()])
);
```

### `formatRelativeTime` for Project Created Date
```typescript
// Source: already imported in UserTable.tsx from @/lib/utils
import { formatRelativeTime } from '@/lib/utils';
// usage: formatRelativeTime(project.createdAt?.toDate() ?? new Date())
```

### RoleBadge Reuse for Project Collaborator Roles
```typescript
// Source: CollaboratorsPanel.tsx — Badge component with colour coding
const PROJECT_ROLE_COLORS: Record<string, 'purple' | 'success' | 'info'> = {
  owner: 'purple',
  editor: 'success',
  reviewer: 'info',
};
// <Badge variant={PROJECT_ROLE_COLORS[collab.role] || 'info'}>{collab.role}</Badge>
```

---

## Data Model Reference

### Project document (Firestore `projects/{id}`)
```typescript
{
  id: string;
  name: string;
  description: string;
  ownerId: string;              // user UID
  collaborators: Array<{
    userId: string;
    role: 'owner' | 'editor' | 'reviewer';
    email: string;
    name: string;
  }>;
  color: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

### User document (Firestore `users/{uid}`)
```typescript
{
  id: string;
  name: string;
  email: string;
  avatar: string;
  role: 'admin' | 'manager' | 'editor' | 'viewer';  // SYSTEM role
  createdAt: Timestamp;
  invited?: boolean;
}
```

**Critical distinction:** `project.collaborators[].role` is a PROJECT role. `user.role` is a SYSTEM role. The two `editor` values mean completely different things.

---

## Environment Availability

Step 2.6: SKIPPED (no external dependencies — purely code/config changes to existing Next.js + Firebase stack).

---

## Validation Architecture

`workflow.nyquist_validation` is not set to `false` in `.planning/config.json` — treating as enabled.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | None detected — no test config files found in repo |
| Config file | None |
| Quick run command | Manual verification via browser |
| Full suite command | N/A |

### Phase Requirements (inferred — TBD in ROADMAP)
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| P21-01 | Admin sees all projects list with owner name/email | manual | N/A | ❌ |
| P21-02 | Projects ordered by creation date descending | manual | N/A | ❌ |
| P21-03 | Non-admin user cannot access `/api/admin/projects` (403) | manual/curl | `curl -H 'Authorization: Bearer <non-admin-token>' /api/admin/projects` | ❌ |
| P21-04 | `UserRoleSelect.tsx` deleted or updated to correct type | TypeScript build | `npx tsc --noEmit` | N/A |
| P21-05 | System roles (users tab) and project roles (projects tab) are visually distinct | manual | N/A | ❌ |

### Wave 0 Gaps
No automated test framework exists in this project. All verification is manual (browser + `tsc --noEmit` for type safety).

---

## Open Questions

1. **Should the Projects tab allow admin actions (delete project, change owner)?**
   - What we know: Roadmap says "clean up" — suggests display-only for now
   - What's unclear: Whether admin should be able to delete arbitrary projects or reassign ownership
   - Recommendation: Read-only table for v1; no delete/edit actions on projects tab

2. **Should collaborator breakdown be shown per project row or in an expandable drawer?**
   - What we know: `collaborators[]` is an array embedded in each project doc — already fetched
   - What's unclear: UX preference
   - Recommendation: Show collaborator count in the table row; expand to show list on click if desired, otherwise keep it simple (count only)

3. **Is `UserRoleSelect.tsx` imported anywhere not yet checked?**
   - What we know: `UserTable.tsx` does NOT import it; `admin/page.tsx` does NOT import it
   - What's unclear: Could be imported from somewhere not yet found
   - Recommendation: Run a quick grep before deleting — confirmed below

---

## Runtime State Inventory

> Phase is not a rename/refactor/migration phase — no runtime state to inventory.

---

## Sources

### Primary (HIGH confidence)
- Direct code inspection: `src/app/(app)/admin/page.tsx` — current admin page structure
- Direct code inspection: `src/components/admin/UserTable.tsx` — role select, badge, table pattern
- Direct code inspection: `src/components/admin/UserRoleSelect.tsx` — stale component with wrong type
- Direct code inspection: `src/app/api/admin/users/route.ts` — `requireAdmin` pattern for admin routes
- Direct code inspection: `src/app/api/projects/route.ts` — project data model, `ownerId` field
- Direct code inspection: `src/types/index.ts` — canonical type definitions for `User`, `Project`, `Collaborator`
- Direct code inspection: `src/lib/auth-helpers.ts` — `requireAdmin`, `getAuthenticatedUser` helpers
- Direct code inspection: `src/components/projects/CollaboratorsPanel.tsx` — project-level role display

### Secondary (MEDIUM confidence)
- Firebase Admin SDK documentation on `db.getAll()` — batch document retrieval in single RPC

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries already in use, no new dependencies
- Architecture: HIGH — extends existing patterns exactly (new admin API route + new admin tab)
- Role system analysis: HIGH — inspected all relevant files directly
- Pitfalls: HIGH — derived from actual code state (stale `UserRoleSelect`, two role systems)

**Research date:** 2026-04-07
**Valid until:** 2026-05-07 (stable stack, no fast-moving dependencies)
