import { describe, it, expect } from 'vitest';
import {
  PLATFORM_ROLE_RANK,
  platformRoleAtLeast,
  getProjectRole,
  canAccessProject,
  canRenameProject,
  canDeleteProject,
  canInviteCollaborator,
  canRemoveCollaborator,
  canUpload,
  canDeleteAsset,
  canRenameAsset,
  canCopyAsset,
  canModifyStack,
  canProbeAsset,
  canGenerateSprite,
  canCreateFolder,
  canRenameFolder,
  canDeleteFolder,
  canCreateReviewLink,
  canEditReviewLink,
  canDeleteReviewLink,
  canPostComment,
  canResolveComment,
  canEditComment,
  canDeleteComment,
  assertReviewLinkActive,
  assertReviewLinkAllows,
  ReviewLinkDenied,
  roleAtLeast,
} from '@/lib/permissions';
import type { User, Project, ReviewLink, Comment } from '@/types';

// ---------- Fixture builders ----------

type PlatformRole = 'admin' | 'manager' | 'editor' | 'viewer';
type ProjectRole = 'owner' | 'editor' | 'reviewer';

function makeUser(overrides: Partial<User> & { id?: string; role?: PlatformRole } = {}): User {
  return {
    id: overrides.id ?? 'u-1',
    email: 'u@example.com',
    name: 'User',
    avatar: '',
    role: overrides.role ?? 'viewer',
    createdAt: { toMillis: () => 0, toDate: () => new Date(0) } as any,
    ...overrides,
  };
}

function makeProject(
  opts: {
    id?: string;
    ownerId?: string;
    collaborators?: Array<{ userId: string; role: ProjectRole }>;
  } = {}
): Project {
  const collaborators = (opts.collaborators ?? []).map((c) => ({
    userId: c.userId,
    role: c.role,
    email: `${c.userId}@example.com`,
    name: c.userId,
  }));
  return {
    id: opts.id ?? 'p-1',
    name: 'Project',
    description: '',
    ownerId: opts.ownerId ?? 'owner-id',
    collaborators,
    color: 'purple',
    createdAt: {} as any,
    updatedAt: {} as any,
  };
}

function tsFromDate(d: Date) {
  return {
    toMillis: () => d.getTime(),
    toDate: () => d,
  } as any;
}

function makeReviewLink(overrides: Partial<ReviewLink> = {}): ReviewLink {
  return {
    id: 'rl-1',
    token: 'tok-1',
    projectId: 'p-1',
    folderId: null,
    name: 'Link',
    createdBy: 'owner-id',
    expiresAt: null,
    allowComments: true,
    createdAt: {} as any,
    ...overrides,
  };
}

function makeComment(overrides: Partial<Comment> = {}): Comment {
  return {
    id: 'c-1',
    assetId: 'a-1',
    projectId: 'p-1',
    authorId: 'owner-id',
    authorName: 'Owner',
    text: 'hi',
    resolved: false,
    parentId: null,
    createdAt: {} as any,
    ...overrides,
  };
}

// Common fixtures — a project with one owner + editor + reviewer collaborator
const OWNER = makeUser({ id: 'owner-id', role: 'editor' });
const EDITOR_COLLAB = makeUser({ id: 'ed-id', role: 'editor' });
const REVIEWER_COLLAB = makeUser({ id: 'rv-id', role: 'editor' });
const STRANGER = makeUser({ id: 'stranger-id', role: 'editor' });
const PLATFORM_ADMIN = makeUser({ id: 'admin-id', role: 'admin' });
const PLATFORM_VIEWER_OWNER = makeUser({ id: 'owner-id', role: 'viewer' });

const PROJECT = makeProject({
  ownerId: 'owner-id',
  collaborators: [
    { userId: 'owner-id', role: 'owner' },
    { userId: 'ed-id', role: 'editor' },
    { userId: 'rv-id', role: 'reviewer' },
  ],
});

// ---------- Tests ----------

describe('permissions — platform rank', () => {
  it('PLATFORM_ROLE_RANK monotone', () => {
    expect(PLATFORM_ROLE_RANK.viewer).toBeLessThan(PLATFORM_ROLE_RANK.editor);
    expect(PLATFORM_ROLE_RANK.editor).toBeLessThan(PLATFORM_ROLE_RANK.manager);
    expect(PLATFORM_ROLE_RANK.manager).toBeLessThan(PLATFORM_ROLE_RANK.admin);
  });

  it.each([
    ['viewer', 'viewer', true],
    ['viewer', 'editor', false],
    ['viewer', 'admin', false],
    ['editor', 'viewer', true],
    ['editor', 'editor', true],
    ['editor', 'manager', false],
    ['manager', 'editor', true],
    ['manager', 'manager', true],
    ['manager', 'admin', false],
    ['admin', 'admin', true],
    ['admin', 'viewer', true],
  ] as Array<[PlatformRole, PlatformRole, boolean]>)(
    'platformRoleAtLeast(%s, %s) = %s',
    (role, min, expected) => {
      expect(platformRoleAtLeast(makeUser({ role }), min)).toBe(expected);
    }
  );

  it('roleAtLeast re-export works for backward compat', () => {
    expect(roleAtLeast(makeUser({ role: 'admin' }), 'manager')).toBe(true);
    expect(roleAtLeast(makeUser({ role: 'viewer' }), 'editor')).toBe(false);
  });
});

describe('permissions — getProjectRole', () => {
  it('platform admin always returns owner', () => {
    expect(getProjectRole(PLATFORM_ADMIN, PROJECT)).toBe('owner');
  });

  it('project ownerId match returns owner', () => {
    expect(getProjectRole(OWNER, PROJECT)).toBe('owner');
  });

  it('collaborator with editor role', () => {
    expect(getProjectRole(EDITOR_COLLAB, PROJECT)).toBe('editor');
  });

  it('collaborator with reviewer role', () => {
    expect(getProjectRole(REVIEWER_COLLAB, PROJECT)).toBe('reviewer');
  });

  it('stranger returns null', () => {
    expect(getProjectRole(STRANGER, PROJECT)).toBeNull();
  });

  it('ownerId match beats missing collaborator entry', () => {
    const proj = makeProject({ ownerId: 'owner-id', collaborators: [] });
    expect(getProjectRole(OWNER, proj)).toBe('owner');
  });
});

describe('permissions — canAccessProject', () => {
  it.each([
    ['owner', OWNER, true],
    ['editor collab', EDITOR_COLLAB, true],
    ['reviewer collab', REVIEWER_COLLAB, true],
    ['platform admin', PLATFORM_ADMIN, true],
    ['stranger', STRANGER, false],
  ] as const)('%s => %s', (_, user, expected) => {
    expect(canAccessProject(user, PROJECT)).toBe(expected);
  });
});

describe('permissions — canRenameProject / canDeleteProject', () => {
  it.each([
    ['owner', OWNER, true],
    ['platform admin', PLATFORM_ADMIN, true],
    ['editor collab', EDITOR_COLLAB, false],
    ['reviewer collab', REVIEWER_COLLAB, false],
    ['stranger', STRANGER, false],
  ] as const)('rename: %s => %s', (_, user, expected) => {
    expect(canRenameProject(user, PROJECT)).toBe(expected);
    expect(canDeleteProject(user, PROJECT)).toBe(expected);
  });
});

describe('permissions — canInviteCollaborator / canRemoveCollaborator', () => {
  it.each([
    ['owner', OWNER, true],
    ['platform admin', PLATFORM_ADMIN, true],
    ['editor collab', EDITOR_COLLAB, false],
    ['reviewer collab', REVIEWER_COLLAB, false],
    ['stranger', STRANGER, false],
  ] as const)('%s => %s', (_, user, expected) => {
    expect(canInviteCollaborator(user, PROJECT)).toBe(expected);
    expect(canRemoveCollaborator(user, PROJECT)).toBe(expected);
  });
});

describe('permissions — canUpload', () => {
  it.each([
    ['owner (platform editor)', OWNER, true],
    ['editor collab', EDITOR_COLLAB, true],
    ['reviewer collab', REVIEWER_COLLAB, false],
    ['platform-viewer owner (below editor)', PLATFORM_VIEWER_OWNER, false],
    ['platform admin', PLATFORM_ADMIN, true],
    ['stranger', STRANGER, false],
  ] as const)('%s => %s', (_, user, expected) => {
    expect(canUpload(user, PROJECT)).toBe(expected);
  });
});

describe('permissions — canDeleteAsset / canRenameAsset', () => {
  it.each([
    ['owner', OWNER, true],
    ['editor collab', EDITOR_COLLAB, true],
    ['reviewer collab', REVIEWER_COLLAB, false],
    ['platform admin', PLATFORM_ADMIN, true],
    ['stranger', STRANGER, false],
  ] as const)('%s => %s', (_, user, expected) => {
    expect(canDeleteAsset(user, PROJECT)).toBe(expected);
    expect(canRenameAsset(user, PROJECT)).toBe(expected);
  });
});

describe('permissions — canCopyAsset / canModifyStack / canProbeAsset / canGenerateSprite', () => {
  it.each([
    ['owner', OWNER, true],
    ['editor collab', EDITOR_COLLAB, true],
    ['reviewer collab', REVIEWER_COLLAB, false],
    ['platform admin', PLATFORM_ADMIN, true],
    ['platform-viewer owner', PLATFORM_VIEWER_OWNER, false],
    ['stranger', STRANGER, false],
  ] as const)('%s => %s', (_, user, expected) => {
    expect(canCopyAsset(user, PROJECT)).toBe(expected);
    expect(canModifyStack(user, PROJECT)).toBe(expected);
    expect(canProbeAsset(user, PROJECT)).toBe(expected);
    expect(canGenerateSprite(user, PROJECT)).toBe(expected);
  });
});

describe('permissions — folder checks', () => {
  it.each([
    ['owner', OWNER, true],
    ['editor collab', EDITOR_COLLAB, true],
    ['reviewer collab', REVIEWER_COLLAB, false],
    ['platform admin', PLATFORM_ADMIN, true],
    ['platform-viewer owner', PLATFORM_VIEWER_OWNER, false],
    ['stranger', STRANGER, false],
  ] as const)('create/rename/delete: %s => %s', (_, user, expected) => {
    expect(canCreateFolder(user, PROJECT)).toBe(expected);
    expect(canRenameFolder(user, PROJECT)).toBe(expected);
    expect(canDeleteFolder(user, PROJECT)).toBe(expected);
  });

  it('platform-editor project-owner CAN delete folders (gap closure)', () => {
    // OWNER is platform editor + project owner
    expect(canDeleteFolder(OWNER, PROJECT)).toBe(true);
  });
});

describe('permissions — review-link create/edit/delete', () => {
  it.each([
    ['owner (platform editor)', OWNER, true],
    ['editor collab', EDITOR_COLLAB, true],
    ['reviewer collab', REVIEWER_COLLAB, false],
    ['platform-viewer owner', PLATFORM_VIEWER_OWNER, false],
    ['platform admin', PLATFORM_ADMIN, true],
    ['stranger', STRANGER, false],
  ] as const)('create: %s => %s', (_, user, expected) => {
    expect(canCreateReviewLink(user, PROJECT)).toBe(expected);
  });

  it('edit/delete: createdBy match', () => {
    const link = makeReviewLink({ createdBy: EDITOR_COLLAB.id });
    expect(canEditReviewLink(EDITOR_COLLAB, PROJECT, link)).toBe(true);
    expect(canDeleteReviewLink(EDITOR_COLLAB, PROJECT, link)).toBe(true);
  });

  it('edit/delete: project owner can revoke any link (gap closure)', () => {
    const link = makeReviewLink({ createdBy: 'some-former-user' });
    expect(canEditReviewLink(OWNER, PROJECT, link)).toBe(true);
    expect(canDeleteReviewLink(OWNER, PROJECT, link)).toBe(true);
  });

  it('edit/delete: platform admin', () => {
    const link = makeReviewLink({ createdBy: 'some-former-user' });
    expect(canEditReviewLink(PLATFORM_ADMIN, PROJECT, link)).toBe(true);
    expect(canDeleteReviewLink(PLATFORM_ADMIN, PROJECT, link)).toBe(true);
  });

  it('edit/delete: other collaborator (not creator/owner) denied', () => {
    const link = makeReviewLink({ createdBy: OWNER.id });
    expect(canEditReviewLink(EDITOR_COLLAB, PROJECT, link)).toBe(false);
    expect(canDeleteReviewLink(EDITOR_COLLAB, PROJECT, link)).toBe(false);
  });

  it('edit/delete: stranger denied', () => {
    const link = makeReviewLink({ createdBy: OWNER.id });
    expect(canEditReviewLink(STRANGER, PROJECT, link)).toBe(false);
  });
});

describe('permissions — comments', () => {
  it.each([
    ['owner', OWNER, true],
    ['editor collab', EDITOR_COLLAB, true],
    ['reviewer collab', REVIEWER_COLLAB, true],
    ['platform admin', PLATFORM_ADMIN, true],
    ['stranger', STRANGER, false],
  ] as const)('canPostComment: %s => %s', (_, user, expected) => {
    expect(canPostComment(user, PROJECT)).toBe(expected);
  });

  it('canResolveComment: any project role', () => {
    expect(canResolveComment(REVIEWER_COLLAB, PROJECT)).toBe(true);
    expect(canResolveComment(STRANGER, PROJECT)).toBe(false);
  });

  it('canEditComment: author only (plus admin)', () => {
    const c = makeComment({ authorId: EDITOR_COLLAB.id });
    expect(canEditComment(EDITOR_COLLAB, PROJECT, c)).toBe(true);
    expect(canEditComment(PLATFORM_ADMIN, PROJECT, c)).toBe(true);
    // non-author owner cannot edit someone else's comment text
    expect(canEditComment(OWNER, PROJECT, c)).toBe(false);
    expect(canEditComment(STRANGER, PROJECT, c)).toBe(false);
  });

  it('canDeleteComment: author, project owner, or admin', () => {
    const c = makeComment({ authorId: EDITOR_COLLAB.id });
    expect(canDeleteComment(EDITOR_COLLAB, PROJECT, c)).toBe(true);
    expect(canDeleteComment(OWNER, PROJECT, c)).toBe(true);
    expect(canDeleteComment(PLATFORM_ADMIN, PROJECT, c)).toBe(true);
    // non-author editor (not owner) cannot delete another user's comment
    const otherEditor = makeUser({ id: 'other-ed', role: 'editor' });
    const proj2 = makeProject({
      ownerId: 'owner-id',
      collaborators: [
        { userId: 'owner-id', role: 'owner' },
        { userId: 'ed-id', role: 'editor' },
        { userId: 'other-ed', role: 'editor' },
      ],
    });
    expect(canDeleteComment(otherEditor, proj2, c)).toBe(false);
  });
});

describe('permissions — assertReviewLinkActive', () => {
  it('no expiresAt + no password = no throw', () => {
    const link = makeReviewLink({ expiresAt: null });
    expect(() => assertReviewLinkActive(link, {})).not.toThrow();
  });

  it('past expiresAt throws expired', () => {
    const link = makeReviewLink({ expiresAt: tsFromDate(new Date(Date.now() - 60_000)) });
    expect(() => assertReviewLinkActive(link, {})).toThrowError(ReviewLinkDenied);
    try {
      assertReviewLinkActive(link, {});
    } catch (e) {
      expect((e as ReviewLinkDenied).reason).toBe('expired');
    }
  });

  it('future expiresAt no throw', () => {
    const link = makeReviewLink({ expiresAt: tsFromDate(new Date(Date.now() + 60_000)) });
    expect(() => assertReviewLinkActive(link, {})).not.toThrow();
  });

  it('password set + missing provided = password throw', () => {
    const link = makeReviewLink({ password: 'secret' });
    try {
      assertReviewLinkActive(link, {});
      throw new Error('should not reach');
    } catch (e) {
      expect(e).toBeInstanceOf(ReviewLinkDenied);
      expect((e as ReviewLinkDenied).reason).toBe('password');
    }
  });

  it('password mismatch = password throw', () => {
    const link = makeReviewLink({ password: 'secret' });
    try {
      assertReviewLinkActive(link, { providedPassword: 'wrong' });
      throw new Error('should not reach');
    } catch (e) {
      expect((e as ReviewLinkDenied).reason).toBe('password');
    }
  });

  it('password match (legacy plaintext) = no throw + needsPasswordUpgrade=true', () => {
    const link = makeReviewLink({ password: 'secret' });
    const res = assertReviewLinkActive(link, { providedPassword: 'secret' });
    expect(res.needsPasswordUpgrade).toBe(true);
  });

  it('password match (bcrypt hash) = no throw + needsPasswordUpgrade=false', async () => {
    const { hashPassword } = await import('@/lib/review-links');
    const link = makeReviewLink({ password: hashPassword('secret') });
    const res = assertReviewLinkActive(link, { providedPassword: 'secret' });
    expect(res.needsPasswordUpgrade).toBe(false);
  });

  it('password mismatch (bcrypt hash) throws', async () => {
    const { hashPassword } = await import('@/lib/review-links');
    const link = makeReviewLink({ password: hashPassword('secret') });
    expect(() => assertReviewLinkActive(link, { providedPassword: 'wrong' })).toThrowError(
      ReviewLinkDenied
    );
  });
});

describe('permissions — assertReviewLinkAllows', () => {
  it('allowComments=false + comment throws', () => {
    const link = makeReviewLink({ allowComments: false });
    try {
      assertReviewLinkAllows(link, 'comment');
      throw new Error('should not reach');
    } catch (e) {
      expect((e as ReviewLinkDenied).reason).toBe('comments_disabled');
    }
  });

  it('allowComments=true + comment passes', () => {
    const link = makeReviewLink({ allowComments: true });
    expect(() => assertReviewLinkAllows(link, 'comment')).not.toThrow();
  });

  it('allowApprovals=false + approve throws', () => {
    const link = makeReviewLink({ allowApprovals: false });
    try {
      assertReviewLinkAllows(link, 'approve');
      throw new Error('should not reach');
    } catch (e) {
      expect((e as ReviewLinkDenied).reason).toBe('approvals_disabled');
    }
  });

  it('allowApprovals=true + approve passes', () => {
    const link = makeReviewLink({ allowApprovals: true });
    expect(() => assertReviewLinkAllows(link, 'approve')).not.toThrow();
  });

  it('allowDownloads=false + download throws', () => {
    const link = makeReviewLink({ allowDownloads: false });
    try {
      assertReviewLinkAllows(link, 'download');
      throw new Error('should not reach');
    } catch (e) {
      expect((e as ReviewLinkDenied).reason).toBe('downloads_disabled');
    }
  });

  it('allowDownloads=true + download passes', () => {
    const link = makeReviewLink({ allowDownloads: true });
    expect(() => assertReviewLinkAllows(link, 'download')).not.toThrow();
  });
});
