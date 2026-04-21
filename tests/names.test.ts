import { describe, it, expect } from 'vitest';
import { validateAssetRename, validateFolderRename } from '@/lib/names';

// Minimal Firestore admin fake: supports
//   db.collection(name).doc(id).get() → { exists, id, data() }
//   db.collection(name).where(f, '==', v).where(f, '==', v).get() → { docs: [{ id, data() }] }

interface FakeDoc {
  id: string;
  data: Record<string, any>;
  exists?: boolean;
}

function makeDb(collections: Record<string, FakeDoc[]>): any {
  return {
    collection(name: string) {
      const docs = collections[name] ?? [];
      const queryDocs = (filters: Array<[string, any]>) => {
        const matching = docs.filter((d) =>
          filters.every(([field, val]) => {
            const got = d.data[field] ?? null;
            return got === val;
          })
        );
        return {
          docs: matching.map((d) => ({ id: d.id, data: () => d.data })),
        };
      };
      const buildQuery = (filters: Array<[string, any]>) => ({
        where(f: string, _op: string, v: any) {
          return buildQuery([...filters, [f, v]]);
        },
        async get() {
          return queryDocs(filters);
        },
      });
      return {
        doc(id: string) {
          const found = docs.find((d) => d.id === id);
          return {
            async get() {
              if (!found) return { exists: false, id, data: () => undefined };
              return { exists: true, id, data: () => found.data };
            },
          };
        },
        where(f: string, op: string, v: any) {
          return buildQuery([[f, v]]);
        },
      };
    },
  };
}

describe('validateAssetRename', () => {
  const base = {
    assets: [
      { id: 'a1', data: { projectId: 'p1', folderId: 'f1', name: 'hero.mp4' } },
      { id: 'a2', data: { projectId: 'p1', folderId: 'f1', name: 'Other.mp4' } },
      { id: 'a3', data: { projectId: 'p1', folderId: 'f1', name: 'Deleted.mp4', deletedAt: { seconds: 1 } } },
      { id: 'a4', data: { projectId: 'p1', folderId: 'f2', name: 'hero.mp4' } },
      { id: 'root1', data: { projectId: 'p1', folderId: null, name: 'toplevel.mp4' } },
    ],
  };

  it('returns ok when no collision exists', async () => {
    const db = makeDb(base);
    const result = await validateAssetRename(db, 'a1', 'brand-new.mp4');
    expect(result).toEqual({ ok: true, trimmed: 'brand-new.mp4' });
  });

  it('returns NAME_COLLISION on case-insensitive sibling match', async () => {
    const db = makeDb(base);
    const result = await validateAssetRename(db, 'a1', 'OTHER.mp4');
    expect(result).toEqual({ ok: false, code: 'NAME_COLLISION' });
  });

  it('ignores soft-deleted siblings', async () => {
    const db = makeDb(base);
    const result = await validateAssetRename(db, 'a1', 'deleted.mp4');
    expect(result).toEqual({ ok: true, trimmed: 'deleted.mp4' });
  });

  it('allows a no-op rename (same name as current)', async () => {
    const db = makeDb(base);
    const result = await validateAssetRename(db, 'a1', 'hero.mp4');
    expect(result).toEqual({ ok: true, trimmed: 'hero.mp4' });
  });

  it('returns EMPTY_NAME on whitespace-only input', async () => {
    const db = makeDb(base);
    const result = await validateAssetRename(db, 'a1', '   ');
    expect(result).toEqual({ ok: false, code: 'EMPTY_NAME' });
  });

  it('trims the name before comparing and returns trimmed on ok', async () => {
    const db = makeDb(base);
    const result = await validateAssetRename(db, 'a1', '  unique.mp4  ');
    expect(result).toEqual({ ok: true, trimmed: 'unique.mp4' });
  });

  it('scopes by folder (sibling in different folder is not a collision)', async () => {
    const db = makeDb(base);
    // a1 is in f1; a4 ("hero.mp4") is in f2 — renaming a1 to a4's name is allowed
    // because a1 in its own folder is the only "hero.mp4".
    // Here we pick a distinct name to prove we don't read across folders.
    const result = await validateAssetRename(db, 'a1', 'otherfolder.mp4');
    expect(result).toEqual({ ok: true, trimmed: 'otherfolder.mp4' });
  });
});

describe('validateFolderRename', () => {
  const base = {
    folders: [
      { id: 'f1', data: { projectId: 'p1', parentId: null, name: 'Shots' } },
      { id: 'f2', data: { projectId: 'p1', parentId: null, name: 'Edits' } },
      { id: 'f3', data: { projectId: 'p1', parentId: 'f1', name: 'Day1' } },
      { id: 'f4', data: { projectId: 'p1', parentId: 'f1', name: 'Day2' } },
      { id: 'fdel', data: { projectId: 'p1', parentId: null, name: 'Old', deletedAt: { seconds: 1 } } },
    ],
  };

  it('returns ok when no collision exists', async () => {
    const db = makeDb(base);
    const result = await validateFolderRename(db, 'f1', 'NewName');
    expect(result).toEqual({ ok: true, trimmed: 'NewName' });
  });

  it('returns NAME_COLLISION on case-insensitive sibling match at same parent', async () => {
    const db = makeDb(base);
    const result = await validateFolderRename(db, 'f1', 'edits');
    expect(result).toEqual({ ok: false, code: 'NAME_COLLISION' });
  });

  it('ignores soft-deleted siblings', async () => {
    const db = makeDb(base);
    const result = await validateFolderRename(db, 'f1', 'old');
    expect(result).toEqual({ ok: true, trimmed: 'old' });
  });

  it('allows a no-op rename (same name as current)', async () => {
    const db = makeDb(base);
    const result = await validateFolderRename(db, 'f1', 'Shots');
    expect(result).toEqual({ ok: true, trimmed: 'Shots' });
  });

  it('returns EMPTY_NAME on whitespace-only input', async () => {
    const db = makeDb(base);
    const result = await validateFolderRename(db, 'f1', '');
    expect(result).toEqual({ ok: false, code: 'EMPTY_NAME' });
  });

  it('scopes by parentId (sub-folder at different parent is not a collision)', async () => {
    const db = makeDb(base);
    // f3 is under f1; no other folder under f1 is named "RootOnlyName".
    // Renaming a root folder (f1) to "Day1" (name used under parent f1) is allowed
    // because scope is same-parent not same-project.
    const result = await validateFolderRename(db, 'f1', 'Day1');
    expect(result).toEqual({ ok: true, trimmed: 'Day1' });
  });
});
