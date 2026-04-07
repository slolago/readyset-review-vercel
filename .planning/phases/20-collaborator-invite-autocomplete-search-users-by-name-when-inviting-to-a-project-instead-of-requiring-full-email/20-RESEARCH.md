# Phase 20: collaborator-invite-autocomplete - Research

**Researched:** 2026-04-07
**Domain:** Firestore user search, React typeahead/autocomplete, Next.js API routes
**Confidence:** HIGH

## Summary

Phase 20 adds user search autocomplete to the collaborator invite flow in `CollaboratorsPanel.tsx`. Currently the invite form requires the inviter to type the exact email address of a user. This phase replaces that free-text email input with a live-search field that queries the registered users collection by name (or email prefix) and surfaces matching users in a dropdown, letting the inviter pick from results.

The Firestore `users` collection already stores `name` and `email` for every registered user (and pre-invited users). However, Firestore does not support full-text search natively. The standard approach for prefix/substring matching in Firestore is a `>=` / `<` range query on the indexed field — this enables prefix search (e.g. "jo" matches "john") but not mid-string search. This is sufficient for name lookup and is the only approach that avoids adding a third-party search service.

The entire change is self-contained: one new API route (`GET /api/users/search?q=...`), one new `UserSearchCombobox` component, and a targeted swap inside `CollaboratorsPanel.tsx`. No schema changes are needed.

**Primary recommendation:** Add `GET /api/users/search` using Firestore `>=`/`<` prefix query on the `name` field (with a secondary pass on `email`), and build a controlled combobox in `CollaboratorsPanel.tsx` using only existing UI primitives (no new library).

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| firebase-admin | ^12.2.0 | Firestore Admin SDK for server-side user search | Already in use for all API routes |
| Next.js App Router | 14.2.5 | API route at `/api/users/search` | Project's routing standard |
| React | ^18 | Combobox UI component | Project's framework |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| lucide-react | ^0.395.0 | Search/loader icons in combobox input | Already used across all components |
| react-hot-toast | ^2.4.1 | Error toast if search fails | Already used for all feedback |
| tailwind-merge / clsx | in use | Conditional class composition | Already used everywhere |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Custom combobox | `@radix-ui/react-combobox` or `cmdk` | `cmdk` is excellent but adds a dependency; a 60-line custom dropdown is simpler for this case and consistent with project style |
| Firestore prefix query | Algolia / Typesense | Full-text, but overkill for an internal user list that stays small |
| Debounced fetch | Client-side filter of all users | Fetching all users risks performance as the list grows; debounced server search scales better |

**Installation:** No new packages required.

## Architecture Patterns

### Recommended Project Structure
```
src/
├── app/api/users/
│   ├── route.ts                  # existing — GET /api/users?ids=...
│   └── search/
│       └── route.ts              # NEW — GET /api/users/search?q=&exclude=uid1,uid2
├── components/
│   ├── ui/
│   │   └── UserSearchCombobox.tsx  # NEW — controlled combobox component
│   └── projects/
│       └── CollaboratorsPanel.tsx  # MODIFIED — swap email Input for UserSearchCombobox
```

### Pattern 1: Firestore Prefix Search
**What:** Use `orderBy('name').where('name', '>=', q).where('name', '<', q + '\uf8ff')` to return all users whose `name` starts with the query string. `\uf8ff` is a Unicode character above most characters, acting as an end-of-range sentinel.
**When to use:** Any case where you need prefix filtering on a Firestore string field without a full-text search engine.
**Example:**
```typescript
// Source: Firestore docs — range queries on strings
const snap = await db
  .collection('users')
  .orderBy('name')
  .where('name', '>=', q)
  .where('name', '<', q + '\uf8ff')
  .limit(8)
  .get();
```

**Secondary email pass:** After the name query, run a second prefix query on `email` with the same bounds, then merge and deduplicate results by `id`. This lets users search either by name or email prefix.

### Pattern 2: Controlled Combobox in React
**What:** An `<input>` that fires a debounced fetch on change; results render in an absolute-positioned `<ul>` beneath the input. Selecting an item populates state and collapses the list.
**When to use:** Any type-to-search UX. The project has no existing combobox component.

```typescript
// Debounce pattern (no library needed)
const timerRef = useRef<ReturnType<typeof setTimeout>>();

const handleInputChange = (value: string) => {
  setQuery(value);
  clearTimeout(timerRef.current);
  timerRef.current = setTimeout(() => fetchUsers(value), 250);
};
```

### Pattern 3: Exclude Already-Added Collaborators
**What:** Pass existing collaborator `userId` values as an `exclude` query param so search results never surface users already on the project.
**When to use:** Any multi-select invite flow where re-inviting existing members is a no-op or error.

```typescript
// API call from CollaboratorsPanel
const existing = project.collaborators?.map((c) => c.userId) ?? [];
const res = await fetch(
  `/api/users/search?q=${encodeURIComponent(query)}&exclude=${existing.join(',')}`
);
```

### Anti-Patterns to Avoid
- **Searching client-side after fetching all users:** Scales poorly. Always search server-side.
- **No debounce:** Without a 200-300ms debounce, every keystroke fires a Firestore read. Use `setTimeout` in a ref.
- **Case-sensitive only:** Firestore string comparison is case-sensitive. Normalize query to lowercase and store `nameLower` field for reliable matching — or document that search is case-sensitive and instruct users to type lowercase (simpler for now, can improve later).
- **Not trimming the query:** An accidental trailing space breaks the range query. Always `q.trim()` before querying.
- **Submitting without a selected user:** Keep the "Add Collaborator" button disabled until a user is explicitly picked from the dropdown, not just typed.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Debouncing | Manual setTimeout logic everywhere | Single `timerRef` pattern in the component | Simple, no import needed |
| Full-text user search | Custom index / trigram table | Firestore `>=`/`<` prefix query | Sufficient for name prefix lookup at small scale |
| Accessible combobox | Full ARIA combobox from scratch | Minimal custom implementation (this project does not use full a11y tooling currently) | Consistent with project's current UI style |

**Key insight:** The `users` collection is small (tens to low hundreds of entries for an internal tool), so a prefix query returning 8 results with a 250ms debounce is fast and cheap. No search infrastructure needed.

## Common Pitfalls

### Pitfall 1: Case-Sensitive Firestore Range Query
**What goes wrong:** User types "John" but the stored name is "john" — no results returned.
**Why it happens:** Firestore string ordering is byte-order (case-sensitive). "j" < "A" is false.
**How to avoid:** Either (a) store a `nameLower` field during user creation and query that, converting the search query to lowercase first; or (b) document that search matches the stored casing and instruct callers to type as stored. Option (a) is cleaner long-term.
**Warning signs:** Works in test with exact casing, fails in production with mixed casing.

### Pitfall 2: Firestore Compound Index Requirement
**What goes wrong:** Deploying without the composite index causes a runtime 400 error from Firestore when `orderBy` + `where` are combined.
**Why it happens:** Firestore requires a composite index for queries combining `orderBy` with a `where` clause on a different field.
**How to avoid:** The query uses `orderBy('name')` + `where('name', ...)` — this is on the SAME field, so no composite index is required. A single-field index on `name` is auto-created by Firestore. If you add `where('role', ...)` in the same query, a composite index IS needed.
**Warning signs:** Console logs a Firestore index error with a link to create the index.

### Pitfall 3: Race Conditions in Rapid Typing
**What goes wrong:** User types quickly; an older slow response arrives after a newer fast one, overwriting correct results.
**Why it happens:** Async fetch responses don't arrive in order.
**How to avoid:** Track a `searchVersion` counter. Increment before each fetch; only apply the response if the counter still matches.
**Warning signs:** Results flicker or show stale data after fast typing.

### Pitfall 4: Owner Excluded From Invite But Not Search
**What goes wrong:** The project owner appears in search results, inviter picks them, API returns error ("already owner").
**Why it happens:** The `exclude` param only sends `collaborators` user IDs, not the owner.
**How to avoid:** Include `project.ownerId` in the `exclude` list alongside existing collaborators.

### Pitfall 5: Submitting the Typed Query Instead of the Selected User
**What goes wrong:** User types "alice" but never selects from the dropdown — form submits with no valid userId and the API falls back to the old email-lookup path.
**Why it happens:** Conflating the search input value with the selected user.
**How to avoid:** Keep selected user as separate state (`selectedUser: UserResult | null`). Only enable submit and pass `userId` when `selectedUser` is non-null. Clear `selectedUser` when input changes without re-selecting.

## Code Examples

### API Route: GET /api/users/search
```typescript
// src/app/api/users/search/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth-helpers';
import { getAdminDb } from '@/lib/firebase-admin';

export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const q = (searchParams.get('q') || '').trim();
  const excludeIds = (searchParams.get('exclude') || '').split(',').filter(Boolean);

  if (q.length < 1) return NextResponse.json({ users: [] });

  const db = getAdminDb();
  const end = q + '\uf8ff';

  // Name prefix query
  const nameSnap = await db
    .collection('users')
    .orderBy('name')
    .where('name', '>=', q)
    .where('name', '<', end)
    .limit(8)
    .get();

  // Email prefix query (secondary)
  const emailSnap = await db
    .collection('users')
    .orderBy('email')
    .where('email', '>=', q)
    .where('email', '<', end)
    .limit(8)
    .get();

  const seen = new Set<string>();
  const users: { id: string; name: string; email: string }[] = [];

  for (const doc of [...nameSnap.docs, ...emailSnap.docs]) {
    if (seen.has(doc.id)) continue;
    if (excludeIds.includes(doc.id)) continue;
    seen.add(doc.id);
    const d = doc.data() as any;
    users.push({ id: doc.id, name: d.name || '', email: d.email || '' });
  }

  return NextResponse.json({ users: users.slice(0, 8) });
}
```

### CollaboratorsPanel — key wiring change
```typescript
// Replace email Input + handleAdd body with:
const [selectedUser, setSelectedUser] = useState<{ id: string; name: string; email: string } | null>(null);
const [role, setRole] = useState<'editor' | 'reviewer'>('reviewer');

const handleAdd = async (e: React.FormEvent) => {
  e.preventDefault();
  if (!selectedUser) return;
  // POST with userId instead of email — or keep email for the existing API
  const res = await fetch(`/api/projects/${project.id}/collaborators`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ email: selectedUser.email, role }),
  });
  // ... toast + onUpdated + reset selectedUser
};
```

Note: the existing collaborators API accepts `email` and does a `where('email', '==', email)` lookup. We can keep that unchanged and just pass `selectedUser.email` from the combobox result — no API contract change needed.

### UserSearchCombobox skeleton
```typescript
// src/components/ui/UserSearchCombobox.tsx
interface UserResult { id: string; name: string; email: string; }

interface Props {
  onSelect: (user: UserResult) => void;
  exclude?: string[];   // user IDs to hide
  placeholder?: string;
}

export function UserSearchCombobox({ onSelect, exclude = [], placeholder }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<UserResult[]>([]);
  const [open, setOpen] = useState(false);
  const { getIdToken } = useAuth();
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  const versionRef = useRef(0);

  const search = async (q: string) => {
    const v = ++versionRef.current;
    if (!q.trim()) { setResults([]); return; }
    const token = await getIdToken();
    const res = await fetch(
      `/api/users/search?q=${encodeURIComponent(q)}&exclude=${exclude.join(',')}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (v !== versionRef.current) return; // stale
    const data = await res.json();
    setResults(data.users || []);
    setOpen(true);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => search(e.target.value), 250);
  };

  const handleSelect = (user: UserResult) => {
    setQuery(user.name);
    setResults([]);
    setOpen(false);
    onSelect(user);
  };

  return (
    <div className="relative flex-1">
      <Input
        value={query}
        onChange={handleChange}
        placeholder={placeholder ?? 'Search by name or email...'}
        onFocus={() => results.length > 0 && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && results.length > 0 && (
        <ul className="absolute z-50 mt-1 w-full bg-frame-surface border border-frame-border rounded-xl shadow-lg overflow-hidden">
          {results.map((u) => (
            <li
              key={u.id}
              onMouseDown={() => handleSelect(u)}
              className="px-4 py-2.5 cursor-pointer hover:bg-frame-hover flex items-center gap-3"
            >
              <Avatar name={u.name} size="sm" />
              <div>
                <p className="text-sm text-white">{u.name}</p>
                <p className="text-xs text-frame-textMuted">{u.email}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Type full email to invite | Search by name prefix, pick from dropdown | Phase 20 | Eliminates the need to know exact email addresses |

**Deprecated/outdated:**
- Nothing deprecated in this phase. The existing collaborators POST API accepting `email` is reused unchanged.

## Open Questions

1. **Case normalization for name search**
   - What we know: Firestore range queries are case-sensitive. Most names in this system are stored as entered during Google sign-in (e.g. "Alice Smith" with capitals).
   - What's unclear: Whether to add a `nameLower` field to `users` documents now or just document that search is case-sensitive.
   - Recommendation: For simplicity, convert the search query to lowercase and store `nameLower` on each user doc at sign-in time (session endpoint). If adding `nameLower` to existing docs is out of scope, a migration step or a note that search is case-sensitive is acceptable for v1.

2. **Minimum query length**
   - What we know: A 1-character query can return many results and many Firestore reads.
   - What's unclear: Whether to require 2+ characters before searching.
   - Recommendation: Require at least 2 characters before firing the search. Show a subtle hint ("Type at least 2 characters") in the empty state.

## Environment Availability

Step 2.6: SKIPPED — no new external dependencies. Firebase Admin SDK and Next.js are already installed and in use.

## Validation Architecture

`workflow.nyquist_validation` is not set to `false` in config.json, so this section is included. However, there is no test framework configured in this project (no pytest.ini, jest.config.*, vitest.config.*, test/ directory found). Nyquist validation for this phase is manual browser testing.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | None detected |
| Config file | None |
| Quick run command | `npm run build` (type-check only) |
| Full suite command | `npm run lint && npm run build` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| P20-01 | Typing in invite field shows matching users | manual | — | N/A |
| P20-02 | Selecting a user populates the invite | manual | — | N/A |
| P20-03 | Already-added members excluded from results | manual | — | N/A |
| P20-04 | API route requires auth | `npm run build` (type safety) | ✅ (part of build) |
| P20-05 | Stale results don't overwrite newer results | manual | — | N/A |

### Wave 0 Gaps
No test framework exists. No test files need to be created for Wave 0. Validation is build success + manual browser smoke test.

## Sources

### Primary (HIGH confidence)
- Firestore Admin SDK — direct inspection of existing `collaborators/route.ts` and `users/route.ts`
- Project source code — `CollaboratorsPanel.tsx`, `types/index.ts`, `auth-helpers.ts` inspected directly
- `package.json` — dependency list verified directly

### Secondary (MEDIUM confidence)
- Firestore documentation pattern: `>= q`, `< q + '\uf8ff'` for prefix search — well-known Firestore idiom, confirmed by inspection of existing queries in project

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries already present, no new installs
- Architecture: HIGH — based on direct reading of existing patterns in the codebase
- Pitfalls: HIGH — case sensitivity and race conditions are well-known Firestore/async issues
- API design: HIGH — existing collaborators route uses `email` lookup, reused unchanged

**Research date:** 2026-04-07
**Valid until:** 2026-05-07 (stable stack, no fast-moving dependencies)
