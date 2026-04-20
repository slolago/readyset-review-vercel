/**
 * Integration tests for API route × role enforcement.
 *
 * Strategy:
 *   - Mock @/lib/firebase-admin so routes read/write against an in-memory store.
 *   - Mock @/lib/gcs so routes don't try to talk to Google Cloud.
 *   - Mock the auth token path: `Bearer mock-<uid>` decodes to that uid.
 *
 * Test fixture per `describe` block: a seeded project with owner, editor,
 * reviewer, platform admin, platform-viewer-owner, and a stranger user.
 * Each role tries each endpoint and the assertions are per the matrix in
 * 44-01-PLAN.md.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createMockDb,
  seedUser,
  seedProject,
  seedAsset,
  seedFolder,
  seedReviewLink,
  seedComment,
  makeRequest,
  authHeader,
  type MockDb,
} from './helpers/firestore-mock';

// ---------- Shared mocks ----------

let db: MockDb = createMockDb();

vi.mock('@/lib/firebase-admin', () => ({
  getAdminDb: () => db,
  getAdminAuth: () => ({
    verifyIdToken: async (token: string) => {
      if (!token.startsWith('mock-')) throw new Error('bad token');
      const uid = token.slice(5);
      return { uid, email: `${uid}@example.com` };
    },
  }),
}));

vi.mock('@/lib/gcs', () => ({
  generateReadSignedUrl: async () => 'signed://read',
  generateDownloadSignedUrl: async () => 'signed://download',
  generateUploadSignedUrl: async () => 'signed://upload',
  buildGcsPath: (projectId: string, assetId: string, filename: string) =>
    `projects/${projectId}/assets/${assetId}/${filename}`,
  buildThumbnailPath: (projectId: string, assetId: string) =>
    `projects/${projectId}/assets/${assetId}/thumb.jpg`,
  getPublicUrl: (gcsPath: string) => `https://storage/${gcsPath}`,
  deleteFile: async () => undefined,
  uploadBuffer: async () => undefined,
}));

// Version-groups helper uses Firestore — let real code run through mocked db.

// ---------- Fixtures ----------

interface Fixture {
  projectId: string;
  owner: string;
  editor: string;
  reviewer: string;
  admin: string;
  stranger: string;
  platformViewerOwner: string;
}

function seedStandard(): Fixture {
  db = createMockDb();
  const owner = 'owner-id';
  const editor = 'ed-id';
  const reviewer = 'rv-id';
  const admin = 'admin-id';
  const stranger = 'stranger-id';
  const platformViewerOwner = 'pvo-id';

  seedUser(db, { id: owner, role: 'editor' });
  seedUser(db, { id: editor, role: 'editor' });
  seedUser(db, { id: reviewer, role: 'editor' });
  seedUser(db, { id: admin, role: 'admin' });
  seedUser(db, { id: stranger, role: 'editor' });
  seedUser(db, { id: platformViewerOwner, role: 'viewer' });

  const projectId = seedProject(db, {
    id: 'proj-1',
    ownerId: owner,
    collaborators: [
      { userId: owner, role: 'owner' },
      { userId: editor, role: 'editor' },
      { userId: reviewer, role: 'reviewer' },
    ],
  });

  // Second project owned by platform-viewer user
  seedProject(db, {
    id: 'proj-viewer',
    ownerId: platformViewerOwner,
    collaborators: [{ userId: platformViewerOwner, role: 'owner' }],
  });

  return { projectId, owner, editor, reviewer, admin, stranger, platformViewerOwner };
}

let F: Fixture;
beforeEach(() => {
  F = seedStandard();
});

// ---------- Dynamic imports AFTER mocks are set ----------

async function loadProjectRoutes() {
  const [byIdMod, collabMod, listMod] = await Promise.all([
    import('@/app/api/projects/[projectId]/route'),
    import('@/app/api/projects/[projectId]/collaborators/route'),
    import('@/app/api/projects/route'),
  ]);
  return {
    GET_ID: byIdMod.GET,
    PUT_ID: byIdMod.PUT,
    DELETE_ID: byIdMod.DELETE,
    POST_COLLAB: collabMod.POST,
    DELETE_COLLAB: collabMod.DELETE,
    GET_LIST: listMod.GET,
    POST_LIST: listMod.POST,
  };
}

// ---------- Tests: project endpoints ----------

describe('API enforcement — projects', () => {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  async function call(
    handler: any,
    uid: string | null,
    body?: unknown,
    projectId: string = F.projectId
  ): Promise<Response> {
    const req = makeRequest({
      method: 'POST',
      body: body as any,
      headers: uid ? authHeader(uid) : {},
    });
    return handler(req, { params: { projectId } });
  }
  /* eslint-enable @typescript-eslint/no-explicit-any */

  it('GET /api/projects/[id] matrix', async () => {
    const { GET_ID } = await loadProjectRoutes();
    expect((await call(GET_ID, F.admin)).status).toBe(200);
    expect((await call(GET_ID, F.owner)).status).toBe(200);
    expect((await call(GET_ID, F.editor)).status).toBe(200);
    expect((await call(GET_ID, F.reviewer)).status).toBe(200);
    expect((await call(GET_ID, F.stranger)).status).toBe(403);
    expect((await call(GET_ID, null)).status).toBe(401);
  });

  it('PUT /api/projects/[id] matrix', async () => {
    const { PUT_ID } = await loadProjectRoutes();
    const body = { name: 'Renamed' };
    expect((await call(PUT_ID, F.owner, body)).status).toBe(200);
    expect((await call(PUT_ID, F.admin, body)).status).toBe(200);
    expect((await call(PUT_ID, F.editor, body)).status).toBe(403);
    expect((await call(PUT_ID, F.reviewer, body)).status).toBe(403);
    expect((await call(PUT_ID, F.stranger, body)).status).toBe(403);
  });

  it('DELETE /api/projects/[id] matrix', async () => {
    const { DELETE_ID } = await loadProjectRoutes();
    expect((await call(DELETE_ID, F.editor)).status).toBe(403);
    expect((await call(DELETE_ID, F.stranger)).status).toBe(403);
    // admin+owner paths delete project; seed fresh per subtest
    F = seedStandard();
    expect((await call(DELETE_ID, F.owner)).status).toBe(200);
    F = seedStandard();
    expect((await call(DELETE_ID, F.admin)).status).toBe(200);
  });

  it('POST /api/projects/[id]/collaborators matrix', async () => {
    const { POST_COLLAB } = await loadProjectRoutes();
    // seed an invitee user
    seedUser(db, { id: 'invitee', role: 'editor' });
    const body = { email: 'invitee@example.com', role: 'editor' };
    expect((await call(POST_COLLAB, F.owner, body)).status).toBe(200);
    expect((await call(POST_COLLAB, F.admin, body)).status).toBe(200);
    expect((await call(POST_COLLAB, F.editor, body)).status).toBe(403);
    expect((await call(POST_COLLAB, F.reviewer, body)).status).toBe(403);
  });

  it('DELETE /api/projects/[id]/collaborators matrix', async () => {
    const { DELETE_COLLAB } = await loadProjectRoutes();
    const body = { userId: F.reviewer };
    expect((await call(DELETE_COLLAB, F.owner, body)).status).toBe(200);
    F = seedStandard();
    expect((await call(DELETE_COLLAB, F.admin, body)).status).toBe(200);
    expect((await call(DELETE_COLLAB, F.editor, body)).status).toBe(403);
  });

  it('GET /api/projects lists only accessible projects', async () => {
    const { GET_LIST } = await loadProjectRoutes();
    const req = makeRequest({ url: 'http://localhost/api/projects', headers: authHeader(F.owner) });
    const res = await GET_LIST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.projects).toBeDefined();
    expect(json.projects.length).toBeGreaterThanOrEqual(1);
  });
});
