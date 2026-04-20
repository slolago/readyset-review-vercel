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

  // NB: folder/asset/upload/review-link/comment suites appended below

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

// ---------- Tests: folder endpoints ----------

describe('API enforcement — folders', () => {
  async function callList(handler: any, uid: string | null, url: string, body?: unknown) {
    const req = makeRequest({
      url,
      body: body as any,
      headers: uid ? authHeader(uid) : {},
    });
    return handler(req) as Promise<Response>;
  }

  async function callId(
    handler: any,
    uid: string | null,
    folderId: string,
    body?: unknown
  ): Promise<Response> {
    const req = makeRequest({ body: body as any, headers: uid ? authHeader(uid) : {} });
    return handler(req, { params: { folderId } });
  }

  it('POST /api/folders — create matrix', async () => {
    const { POST } = await import('@/app/api/folders/route');
    const body = { name: 'New', projectId: F.projectId };
    expect((await callList(POST, F.owner, 'http://localhost/api/folders', body)).status).toBe(201);
    expect((await callList(POST, F.editor, 'http://localhost/api/folders', body)).status).toBe(201);
    expect((await callList(POST, F.reviewer, 'http://localhost/api/folders', body)).status).toBe(403);
    // Platform-viewer-owner has project=owner but platform=viewer → blocked
    expect(
      (await callList(POST, F.platformViewerOwner, 'http://localhost/api/folders', {
        name: 'Nope',
        projectId: 'proj-viewer',
      })).status
    ).toBe(403);
    expect((await callList(POST, F.admin, 'http://localhost/api/folders', body)).status).toBe(201);
  });

  it('PUT /api/folders/[id] — rename matrix', async () => {
    const { PUT } = await import('@/app/api/folders/[folderId]/route');
    const fid = seedFolder(db, { projectId: F.projectId });
    const body = { name: 'Renamed' };
    expect((await callId(PUT, F.owner, fid, body)).status).toBe(200);
    expect((await callId(PUT, F.editor, fid, body)).status).toBe(200);
    expect((await callId(PUT, F.reviewer, fid, body)).status).toBe(403);
    expect((await callId(PUT, F.stranger, fid, body)).status).toBe(403);
    expect((await callId(PUT, F.admin, fid, body)).status).toBe(200);
  });

  it('DELETE /api/folders/[id] — gap closure: platform-editor project-owner can delete', async () => {
    const { DELETE } = await import('@/app/api/folders/[folderId]/route');
    const fid1 = seedFolder(db, { projectId: F.projectId });
    // OWNER is platform=editor + project=owner → previously blocked by roleAtLeast(manager), now allowed.
    expect((await callId(DELETE, F.owner, fid1)).status).toBe(200);

    const fid2 = seedFolder(db, { projectId: F.projectId });
    expect((await callId(DELETE, F.reviewer, fid2)).status).toBe(403);

    const fid3 = seedFolder(db, { projectId: F.projectId });
    expect((await callId(DELETE, F.stranger, fid3)).status).toBe(403);

    const fid4 = seedFolder(db, { projectId: F.projectId });
    expect((await callId(DELETE, F.admin, fid4)).status).toBe(200);
  });

  it('POST /api/folders/copy — matrix', async () => {
    const { POST } = await import('@/app/api/folders/copy/route');
    const fid = seedFolder(db, { projectId: F.projectId });
    const body = { folderId: fid };
    const req = (uid: string) => makeRequest({ body: body as any, headers: authHeader(uid) });
    expect((await POST(req(F.owner))).status).toBe(201);
    expect((await POST(req(F.editor))).status).toBe(201);
    expect((await POST(req(F.reviewer))).status).toBe(403);
  });
});

// ---------- Tests: asset endpoints ----------

describe('API enforcement — assets', () => {
  async function callId(
    handler: any,
    uid: string | null,
    assetId: string,
    body?: unknown
  ): Promise<Response> {
    const req = makeRequest({ body: body as any, headers: uid ? authHeader(uid) : {} });
    return handler(req, { params: { assetId } });
  }

  it('PUT /api/assets/[id] — rename: reviewer is 403', async () => {
    const { PUT } = await import('@/app/api/assets/[assetId]/route');
    const aid = seedAsset(db, { projectId: F.projectId });
    const body = { name: 'new-name.mp4' };
    expect((await callId(PUT, F.owner, aid, body)).status).toBe(200);
    expect((await callId(PUT, F.editor, aid, body)).status).toBe(200);
    expect((await callId(PUT, F.reviewer, aid, body)).status).toBe(403);
    expect((await callId(PUT, F.admin, aid, body)).status).toBe(200);
    expect((await callId(PUT, F.stranger, aid, body)).status).toBe(403);
  });

  it('DELETE /api/assets/[id] — reviewer is 403 (gap closure)', async () => {
    const { DELETE } = await import('@/app/api/assets/[assetId]/route');
    const aid1 = seedAsset(db, { projectId: F.projectId });
    expect((await callId(DELETE, F.reviewer, aid1)).status).toBe(403);

    const aid2 = seedAsset(db, { projectId: F.projectId });
    expect((await callId(DELETE, F.owner, aid2)).status).toBe(200);

    const aid3 = seedAsset(db, { projectId: F.projectId });
    expect((await callId(DELETE, F.editor, aid3)).status).toBe(200);

    const aid4 = seedAsset(db, { projectId: F.projectId });
    expect((await callId(DELETE, F.stranger, aid4)).status).toBe(403);

    const aid5 = seedAsset(db, { projectId: F.projectId });
    expect((await callId(DELETE, F.admin, aid5)).status).toBe(200);
  });

  it('POST /api/assets/copy — reviewer is 403', async () => {
    const { POST } = await import('@/app/api/assets/copy/route');
    const aid = seedAsset(db, { projectId: F.projectId });
    const body = { assetId: aid };
    const call = (uid: string) => POST(makeRequest({ body: body as any, headers: authHeader(uid) }));
    expect((await call(F.owner)).status).toBe(201);
    expect((await call(F.reviewer)).status).toBe(403);
  });
});

// ---------- Tests: upload pipeline ----------

describe('API enforcement — upload', () => {
  it('POST /api/upload/signed-url — reviewer is 403 (gap closure)', async () => {
    const { POST } = await import('@/app/api/upload/signed-url/route');
    const body = {
      filename: 'clip.mp4',
      contentType: 'video/mp4',
      size: 1000,
      projectId: F.projectId,
    };
    const call = (uid: string) => POST(makeRequest({ body: body as any, headers: authHeader(uid) }));
    expect((await call(F.owner)).status).toBe(200);
    expect((await call(F.editor)).status).toBe(200);
    expect((await call(F.reviewer)).status).toBe(403);
    expect((await call(F.admin)).status).toBe(200);
    expect((await call(F.stranger)).status).toBe(403);
  });

  it('POST /api/upload/signed-url — platform-viewer owner is 403', async () => {
    const { POST } = await import('@/app/api/upload/signed-url/route');
    const body = {
      filename: 'clip.mp4',
      contentType: 'video/mp4',
      size: 1000,
      projectId: 'proj-viewer',
    };
    const res = await POST(makeRequest({ body: body as any, headers: authHeader(F.platformViewerOwner) }));
    expect(res.status).toBe(403);
  });
});

// ---------- Tests: review-link endpoints ----------

describe('API enforcement — review-links', () => {
  it('POST /api/review-links — create matrix (project-owner + platform-editor is 200, gap closure)', async () => {
    const { POST } = await import('@/app/api/review-links/route');
    const body = { name: 'L1', projectId: F.projectId };
    const call = (uid: string) => POST(makeRequest({ body: body as any, headers: authHeader(uid) }));
    expect((await call(F.owner)).status).toBe(201);
    expect((await call(F.editor)).status).toBe(201);
    expect((await call(F.reviewer)).status).toBe(403);
    expect((await call(F.admin)).status).toBe(201);
    expect((await call(F.stranger)).status).toBe(403);
  });

  it('PATCH /api/review-links/[token] — project owner (not creator) can revoke (gap closure)', async () => {
    const { PATCH } = await import('@/app/api/review-links/[token]/route');
    // Link created by a former collaborator (NOT the owner)
    const tok = seedReviewLink(db, { projectId: F.projectId, createdBy: 'former-user' });
    const req = (uid: string) =>
      makeRequest({ body: { name: 'renamed' } as any, headers: authHeader(uid) });
    expect((await PATCH(req(F.owner), { params: { token: tok } })).status).toBe(200);
    expect((await PATCH(req(F.editor), { params: { token: tok } })).status).toBe(403);
    expect((await PATCH(req(F.admin), { params: { token: tok } })).status).toBe(200);
  });

  it('DELETE /api/review-links/[token] — creator, owner, admin can delete; other collab denied', async () => {
    const { DELETE } = await import('@/app/api/review-links/[token]/route');
    const mkTok = (createdBy: string) =>
      seedReviewLink(db, { projectId: F.projectId, createdBy });

    const req = (uid: string) => makeRequest({ headers: authHeader(uid) });

    const t1 = mkTok(F.editor);
    expect((await DELETE(req(F.editor), { params: { token: t1 } })).status).toBe(200); // creator

    const t2 = mkTok('former-user');
    expect((await DELETE(req(F.owner), { params: { token: t2 } })).status).toBe(200); // project owner

    const t3 = mkTok(F.owner);
    expect((await DELETE(req(F.editor), { params: { token: t3 } })).status).toBe(403); // non-creator editor

    const t4 = mkTok('former-user');
    expect((await DELETE(req(F.admin), { params: { token: t4 } })).status).toBe(200); // admin
  });
});

// ---------- Tests: comments + review-link flags ----------

describe('API enforcement — comments', () => {
  it('guest POST blocked when link.allowComments=false (gap closure)', async () => {
    const { POST } = await import('@/app/api/comments/route');
    const aid = seedAsset(db, { projectId: F.projectId });
    const tok = seedReviewLink(db, {
      projectId: F.projectId,
      createdBy: F.owner,
      allowComments: false,
    });
    const body = {
      assetId: aid,
      projectId: F.projectId,
      text: 'hi',
      reviewLinkId: tok,
    };
    const res = await POST(makeRequest({ body: body as any }));
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toMatch(/Comments are disabled/i);
  });

  it('guest POST blocked when link expired (gap closure)', async () => {
    const { POST } = await import('@/app/api/comments/route');
    const aid = seedAsset(db, { projectId: F.projectId });
    const tok = seedReviewLink(db, {
      projectId: F.projectId,
      createdBy: F.owner,
      expiresAt: new Date(Date.now() - 60_000),
    });
    const body = {
      assetId: aid,
      projectId: F.projectId,
      text: 'hi',
      reviewLinkId: tok,
    };
    const res = await POST(makeRequest({ body: body as any }));
    expect(res.status).toBe(410);
  });

  it('guest POST requires password when link has one', async () => {
    const { POST } = await import('@/app/api/comments/route');
    const aid = seedAsset(db, { projectId: F.projectId });
    const tok = seedReviewLink(db, {
      projectId: F.projectId,
      createdBy: F.owner,
      password: 'hunter2',
    });
    const noPwd = await POST(
      makeRequest({
        body: { assetId: aid, projectId: F.projectId, text: 'hi', reviewLinkId: tok } as any,
      })
    );
    expect(noPwd.status).toBe(401);
    const wrongPwd = await POST(
      makeRequest({
        body: {
          assetId: aid,
          projectId: F.projectId,
          text: 'hi',
          reviewLinkId: tok,
          password: 'wrong',
        } as any,
      })
    );
    expect(wrongPwd.status).toBe(401);
    const okPwd = await POST(
      makeRequest({
        body: {
          assetId: aid,
          projectId: F.projectId,
          text: 'hi',
          reviewLinkId: tok,
          password: 'hunter2',
        } as any,
      })
    );
    expect(okPwd.status).toBe(201);
  });

  it('guest GET ?reviewToken= + expired → 410', async () => {
    const { GET } = await import('@/app/api/comments/route');
    const aid = seedAsset(db, { projectId: F.projectId });
    seedReviewLink(db, {
      token: 'expired-tok',
      projectId: F.projectId,
      createdBy: F.owner,
      expiresAt: new Date(Date.now() - 60_000),
    });
    const res = await GET(
      makeRequest({
        url: `http://localhost/api/comments?assetId=${aid}&reviewToken=expired-tok`,
      })
    );
    expect(res.status).toBe(410);
  });

  it('authenticated POST: reviewer allowed, stranger denied', async () => {
    const { POST } = await import('@/app/api/comments/route');
    const aid = seedAsset(db, { projectId: F.projectId });
    const body = { assetId: aid, projectId: F.projectId, text: 'hi' };
    const call = (uid: string) => POST(makeRequest({ body: body as any, headers: authHeader(uid) }));
    expect((await call(F.reviewer)).status).toBe(201); // reviewer can post
    expect((await call(F.editor)).status).toBe(201);
    expect((await call(F.stranger)).status).toBe(403);
  });

  it('PUT /api/comments/[id]: non-author cannot change text', async () => {
    const { PUT } = await import('@/app/api/comments/[commentId]/route');
    const aid = seedAsset(db, { projectId: F.projectId });
    const cid = seedComment(db, {
      assetId: aid,
      projectId: F.projectId,
      authorId: F.editor,
    });
    const body = { text: 'hacked' };
    // Owner is NOT the author → author-updatable field denied → 0 updatable → 403
    const ownerRes = await PUT(
      makeRequest({ body: body as any, headers: authHeader(F.owner) }),
      { params: { commentId: cid } }
    );
    expect(ownerRes.status).toBe(403);
    // Author can update text
    const authorRes = await PUT(
      makeRequest({ body: body as any, headers: authHeader(F.editor) }),
      { params: { commentId: cid } }
    );
    expect(authorRes.status).toBe(200);
  });

  it('PUT /api/comments/[id]: any project member can mark resolved', async () => {
    const { PUT } = await import('@/app/api/comments/[commentId]/route');
    const aid = seedAsset(db, { projectId: F.projectId });
    const cid = seedComment(db, {
      assetId: aid,
      projectId: F.projectId,
      authorId: F.editor,
    });
    const res = await PUT(
      makeRequest({ body: { resolved: true } as any, headers: authHeader(F.reviewer) }),
      { params: { commentId: cid } }
    );
    expect(res.status).toBe(200);
  });

  it('DELETE /api/comments/[id]: project owner (non-author) can delete', async () => {
    const { DELETE } = await import('@/app/api/comments/[commentId]/route');
    const aid = seedAsset(db, { projectId: F.projectId });
    const cid = seedComment(db, {
      assetId: aid,
      projectId: F.projectId,
      authorId: F.editor, // editor is the author
    });
    const res = await DELETE(makeRequest({ headers: authHeader(F.owner) }), {
      params: { commentId: cid },
    });
    expect(res.status).toBe(200);
  });

  it('DELETE /api/comments/[id]: non-author non-owner collab denied', async () => {
    const { DELETE } = await import('@/app/api/comments/[commentId]/route');
    // Add a second editor as collaborator
    seedUser(db, { id: 'other-ed', role: 'editor' });
    db.collection('projects').doc(F.projectId).update({
      collaborators: [
        { userId: F.owner, role: 'owner', email: 'o@e.com', name: 'o' },
        { userId: F.editor, role: 'editor', email: 'e@e.com', name: 'e' },
        { userId: F.reviewer, role: 'reviewer', email: 'r@e.com', name: 'r' },
        { userId: 'other-ed', role: 'editor', email: 'oe@e.com', name: 'oe' },
      ],
    });
    const aid = seedAsset(db, { projectId: F.projectId });
    const cid = seedComment(db, {
      assetId: aid,
      projectId: F.projectId,
      authorId: F.editor,
    });
    const res = await DELETE(makeRequest({ headers: authHeader('other-ed') }), {
      params: { commentId: cid },
    });
    expect(res.status).toBe(403);
  });
});

