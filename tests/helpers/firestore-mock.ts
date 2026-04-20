/**
 * Minimal in-memory Firestore shim sufficient for route integration tests.
 *
 * Supports the narrow surface our API routes use:
 *   db.collection(name).doc(id).get() / set() / update() / delete()
 *   db.collection(name).where(field, '==', value).get()
 *   db.collection(name).where(...).limit(n).get()
 *   db.collection(name).add(data)
 *   db.batch() / batch.update() / batch.delete() / batch.set() / batch.commit()
 *   db.runTransaction(fn)
 *
 * No support for `orderBy`, compound queries, or array-contains. Tests must
 * avoid those paths (or sort in memory).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Data = Record<string, any>;

export interface MockDoc {
  id: string;
  exists: boolean;
  data: () => Data | undefined;
  ref: MockDocRef;
}

export interface MockDocRef {
  id: string;
  get: () => Promise<MockDoc>;
  set: (data: Data) => Promise<void>;
  update: (data: Data) => Promise<void>;
  delete: () => Promise<void>;
  collection: (name: string) => MockCollection;
}

interface WhereClause {
  field: string;
  op: string;
  value: unknown;
}

export interface MockQuery {
  where: (field: string, op: string, value: unknown) => MockQuery;
  limit: (n: number) => MockQuery;
  orderBy: (field: string, dir?: string) => MockQuery;
  get: () => Promise<{ docs: MockDoc[]; size: number; empty: boolean }>;
}

export interface MockCollection extends MockQuery {
  doc: (id?: string) => MockDocRef;
  add: (data: Data) => Promise<MockDocRef>;
}

export interface MockBatch {
  set: (ref: MockDocRef, data: Data) => MockBatch;
  update: (ref: MockDocRef, data: Data) => MockBatch;
  delete: (ref: MockDocRef) => MockBatch;
  commit: () => Promise<void>;
}

export interface MockDb {
  __store: Map<string, Map<string, Data>>;
  collection: (name: string) => MockCollection;
  batch: () => MockBatch;
  runTransaction: <T>(fn: (tx: MockTransaction) => Promise<T>) => Promise<T>;
}

export interface MockTransaction {
  get: (ref: MockDocRef) => Promise<MockDoc>;
  set: (ref: MockDocRef, data: Data) => void;
  update: (ref: MockDocRef, data: Data) => void;
  delete: (ref: MockDocRef) => void;
}

let idCounter = 0;

export function createMockDb(): MockDb {
  const store: Map<string, Map<string, Data>> = new Map();

  const ensureCollection = (name: string) => {
    if (!store.has(name)) store.set(name, new Map());
    return store.get(name)!;
  };

  const makeDocSnapshot = (name: string, id: string): MockDoc => {
    const col = ensureCollection(name);
    const data = col.get(id);
    return {
      id,
      exists: data !== undefined,
      data: () => (data ? { ...data } : undefined),
      ref: makeDocRef(name, id),
    };
  };

  const makeDocRef = (name: string, id: string): MockDocRef => ({
    id,
    get: async () => makeDocSnapshot(name, id),
    set: async (data: Data) => {
      ensureCollection(name).set(id, { ...data });
    },
    update: async (data: Data) => {
      const col = ensureCollection(name);
      const existing = col.get(id);
      if (!existing) throw new Error(`update non-existent ${name}/${id}`);
      col.set(id, { ...existing, ...data });
    },
    delete: async () => {
      ensureCollection(name).delete(id);
    },
    collection: (_sub: string) => {
      throw new Error('sub-collections not supported by mock');
    },
  });

  const makeQuery = (name: string, wheres: WhereClause[], limitN: number | null): MockQuery => {
    const exec = async () => {
      const col = ensureCollection(name);
      let docs: MockDoc[] = Array.from(col.entries()).map(([id]) => makeDocSnapshot(name, id));
      for (const w of wheres) {
        docs = docs.filter((d) => {
          const v = (d.data() as Data)?.[w.field];
          if (w.op === '==') return v === w.value;
          if (w.op === '!=') return v !== w.value;
          throw new Error(`unsupported op ${w.op}`);
        });
      }
      if (limitN !== null) docs = docs.slice(0, limitN);
      return { docs, size: docs.length, empty: docs.length === 0 };
    };
    return {
      where: (field: string, op: string, value: unknown) =>
        makeQuery(name, [...wheres, { field, op, value }], limitN),
      limit: (n: number) => makeQuery(name, wheres, n),
      orderBy: () => makeQuery(name, wheres, limitN), // ignore ordering
      get: exec,
    };
  };

  const makeCollection = (name: string): MockCollection => {
    const baseQuery = makeQuery(name, [], null);
    return {
      ...baseQuery,
      doc: (id?: string) => {
        const realId = id ?? `mock-${++idCounter}`;
        return makeDocRef(name, realId);
      },
      add: async (data: Data) => {
        const id = `mock-${++idCounter}`;
        ensureCollection(name).set(id, { ...data });
        return makeDocRef(name, id);
      },
    };
  };

  const makeBatch = (): MockBatch => {
    const ops: Array<() => Promise<void>> = [];
    const b: MockBatch = {
      set: (ref, data) => { ops.push(() => ref.set(data)); return b; },
      update: (ref, data) => { ops.push(() => ref.update(data)); return b; },
      delete: (ref) => { ops.push(() => ref.delete()); return b; },
      commit: async () => { for (const op of ops) await op(); },
    };
    return b;
  };

  const runTransaction = async <T>(fn: (tx: MockTransaction) => Promise<T>): Promise<T> => {
    const ops: Array<() => Promise<void>> = [];
    const tx: MockTransaction = {
      get: (ref) => ref.get(),
      set: (ref, data) => { ops.push(() => ref.set(data)); },
      update: (ref, data) => { ops.push(() => ref.update(data)); },
      delete: (ref) => { ops.push(() => ref.delete()); },
    };
    const result = await fn(tx);
    for (const op of ops) await op();
    return result;
  };

  return {
    __store: store,
    collection: makeCollection,
    batch: makeBatch,
    runTransaction,
  };
}

export function seedUser(
  db: MockDb,
  user: { id: string; role: 'admin' | 'manager' | 'editor' | 'viewer'; email?: string; name?: string }
) {
  db.collection('users').doc(user.id).set({
    email: user.email ?? `${user.id}@example.com`,
    name: user.name ?? user.id,
    avatar: '',
    role: user.role,
    createdAt: { toMillis: () => 0 },
  });
}

export function seedProject(
  db: MockDb,
  opts: {
    id?: string;
    ownerId: string;
    collaborators?: Array<{ userId: string; role: 'owner' | 'editor' | 'reviewer' }>;
    name?: string;
  }
): string {
  const id = opts.id ?? `p-${++idCounter}`;
  const collaborators = (opts.collaborators ?? []).map((c) => ({
    userId: c.userId,
    role: c.role,
    email: `${c.userId}@example.com`,
    name: c.userId,
  }));
  db.collection('projects').doc(id).set({
    name: opts.name ?? 'Project',
    description: '',
    ownerId: opts.ownerId,
    collaborators,
    color: 'purple',
    createdAt: { toMillis: () => 0 },
    updatedAt: { toMillis: () => 0 },
  });
  return id;
}

export function seedAsset(
  db: MockDb,
  opts: {
    id?: string;
    projectId: string;
    folderId?: string | null;
    name?: string;
    uploadedBy?: string;
    gcsPath?: string;
  }
): string {
  const id = opts.id ?? `a-${++idCounter}`;
  db.collection('assets').doc(id).set({
    projectId: opts.projectId,
    folderId: opts.folderId ?? null,
    name: opts.name ?? 'asset.mp4',
    type: 'video',
    mimeType: 'video/mp4',
    url: '',
    gcsPath: opts.gcsPath ?? `projects/${opts.projectId}/assets/${id}/file.mp4`,
    thumbnailUrl: '',
    size: 1000,
    uploadedBy: opts.uploadedBy ?? 'owner-id',
    status: 'ready',
    version: 1,
    versionGroupId: id,
    createdAt: { toMillis: () => 0 },
  });
  return id;
}

export function seedFolder(
  db: MockDb,
  opts: { id?: string; projectId: string; parentId?: string | null; name?: string }
): string {
  const id = opts.id ?? `f-${++idCounter}`;
  db.collection('folders').doc(id).set({
    name: opts.name ?? 'Folder',
    projectId: opts.projectId,
    parentId: opts.parentId ?? null,
    path: [],
    createdAt: { toMillis: () => 0 },
  });
  return id;
}

export function seedReviewLink(
  db: MockDb,
  opts: {
    token?: string;
    projectId: string;
    createdBy: string;
    allowComments?: boolean;
    allowDownloads?: boolean;
    allowApprovals?: boolean;
    password?: string;
    expiresAt?: Date | null;
    folderId?: string | null;
  }
): string {
  const token = opts.token ?? `tok-${++idCounter}`;
  const expiresAt = opts.expiresAt
    ? { toMillis: () => opts.expiresAt!.getTime(), toDate: () => opts.expiresAt! }
    : null;
  db.collection('reviewLinks').doc(token).set({
    token,
    name: 'Link',
    projectId: opts.projectId,
    folderId: opts.folderId ?? null,
    createdBy: opts.createdBy,
    allowComments: opts.allowComments !== false,
    allowDownloads: opts.allowDownloads === true,
    allowApprovals: opts.allowApprovals === true,
    expiresAt,
    password: opts.password ?? null,
    createdAt: { toMillis: () => 0 },
  });
  return token;
}

export function seedComment(
  db: MockDb,
  opts: {
    id?: string;
    assetId: string;
    projectId: string;
    authorId: string | null;
    text?: string;
    reviewLinkId?: string;
  }
): string {
  const id = opts.id ?? `c-${++idCounter}`;
  const data: Data = {
    assetId: opts.assetId,
    projectId: opts.projectId,
    authorId: opts.authorId,
    authorName: opts.authorId ?? 'Guest',
    text: opts.text ?? 'hi',
    resolved: false,
    parentId: null,
    createdAt: { toMillis: () => 0 },
  };
  if (opts.reviewLinkId) data.reviewLinkId = opts.reviewLinkId;
  db.collection('comments').doc(id).set(data);
  return id;
}

// ---------- NextRequest mock helpers ----------

interface MockRequestOpts {
  method?: string;
  url?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  body?: any;
  headers?: Record<string, string>;
}

export function makeRequest(opts: MockRequestOpts = {}) {
  const url = opts.url ?? 'http://localhost/api/test';
  const method = opts.method ?? 'GET';
  const headers = new Headers(opts.headers ?? {});
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const body = opts.body;

  const req = {
    method,
    url,
    headers,
    nextUrl: new URL(url),
    json: async () => body ?? {},
    formData: async () => {
      throw new Error('formData not mocked');
    },
  };
  return req as unknown as import('next/server').NextRequest;
}

export function authHeader(uid: string): Record<string, string> {
  // Token format: the auth mock in setup.ts decodes the uid from `Bearer mock-<uid>`
  return { Authorization: `Bearer mock-${uid}` };
}
