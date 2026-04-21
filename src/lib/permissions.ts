/**
 * Single source of truth for access-control.
 *
 * Pure functions only — no Firestore, no NextRequest. Callers pass already-fetched
 * User/Project/ReviewLink/Comment objects. The only exception is the async
 * `canAccessProjectById` helper at the bottom which is a thin DB wrapper for
 * legacy call sites; it delegates to the pure `canAccessProject` after loading.
 */

import type { User, Project, ReviewLink, Comment, Collaborator } from '@/types';
import { verifyPassword } from '@/lib/review-links';

// ---------- Platform role ----------

export const PLATFORM_ROLE_RANK = {
  viewer: 0,
  editor: 1,
  manager: 2,
  admin: 3,
} as const;

export type PlatformRole = keyof typeof PLATFORM_ROLE_RANK;

export const PLATFORM_ROLES: readonly PlatformRole[] = ['viewer', 'editor', 'manager', 'admin'];

export function platformRoleAtLeast(user: User, min: PlatformRole): boolean {
  return (PLATFORM_ROLE_RANK[user.role] ?? 0) >= PLATFORM_ROLE_RANK[min];
}

/** @deprecated use platformRoleAtLeast directly */
export function roleAtLeast(user: User, min: PlatformRole): boolean {
  return platformRoleAtLeast(user, min);
}

function isPlatformAdmin(user: User): boolean {
  return user.role === 'admin';
}

// ---------- Project role ----------

export type ProjectRole = 'owner' | 'editor' | 'reviewer';

export const PROJECT_ROLES: readonly ProjectRole[] = ['owner', 'editor', 'reviewer'];

/**
 * Returns the user's role in a project, or null if none.
 *
 * Admin override: platform admins always see 'owner' regardless of the
 * collaborators array. The legacy `ownerId` field is treated as an implicit
 * 'owner' collaborator entry.
 */
export function getProjectRole(user: User, project: Project): ProjectRole | null {
  if (isPlatformAdmin(user)) return 'owner';
  if (project.ownerId === user.id) return 'owner';
  const entry = (project.collaborators || []).find((c: Collaborator) => c.userId === user.id);
  return entry ? entry.role : null;
}

export function canAccessProject(user: User, project: Project): boolean {
  return getProjectRole(user, project) !== null;
}

// ---------- Project scope (rename/delete/invite) ----------

function isProjectOwnerOrAdmin(user: User, project: Project): boolean {
  if (isPlatformAdmin(user)) return true;
  return project.ownerId === user.id;
}

export function canRenameProject(user: User, project: Project): boolean {
  return isProjectOwnerOrAdmin(user, project);
}

export function canDeleteProject(user: User, project: Project): boolean {
  return isProjectOwnerOrAdmin(user, project);
}

export function canInviteCollaborator(user: User, project: Project): boolean {
  return isProjectOwnerOrAdmin(user, project);
}

export function canRemoveCollaborator(user: User, project: Project): boolean {
  return isProjectOwnerOrAdmin(user, project);
}

// ---------- Asset / stack scope ----------

/**
 * Write-level access: platform editor+ AND project owner/editor (or admin).
 * Reviewers cannot upload. Platform-viewer owners cannot upload.
 */
export function canUpload(user: User, project: Project): boolean {
  if (isPlatformAdmin(user)) return true;
  if (!platformRoleAtLeast(user, 'editor')) return false;
  const role = getProjectRole(user, project);
  return role === 'owner' || role === 'editor';
}

function canWriteAsset(user: User, project: Project): boolean {
  // Delete/rename/modify-stack: platform admin OR project owner/editor.
  // Unlike canUpload, these do NOT require platform role >= editor for
  // project owners/editors — if you're a project editor, you can already
  // rename/delete assets even if your platform role is lower. But for
  // consistency with canUpload (uploads are platform-gated), we keep the
  // same rule: platform editor+ required. This matches the design intent
  // that "viewer" platform role is strictly read-only.
  if (isPlatformAdmin(user)) return true;
  if (!platformRoleAtLeast(user, 'editor')) return false;
  const role = getProjectRole(user, project);
  return role === 'owner' || role === 'editor';
}

export function canDeleteAsset(user: User, project: Project): boolean {
  return canWriteAsset(user, project);
}

export function canRenameAsset(user: User, project: Project): boolean {
  return canWriteAsset(user, project);
}

export function canCopyAsset(user: User, project: Project): boolean {
  return canWriteAsset(user, project);
}

export function canModifyStack(user: User, project: Project): boolean {
  return canWriteAsset(user, project);
}

export function canProbeAsset(user: User, project: Project): boolean {
  return canWriteAsset(user, project);
}

export function canGenerateSprite(user: User, project: Project): boolean {
  return canWriteAsset(user, project);
}

// ---------- Folder scope ----------

export function canCreateFolder(user: User, project: Project): boolean {
  return canWriteAsset(user, project);
}

export function canRenameFolder(user: User, project: Project): boolean {
  return canWriteAsset(user, project);
}

export function canDeleteFolder(user: User, project: Project): boolean {
  return canWriteAsset(user, project);
}

// Restore + permanent delete share the same write-gate as delete — no new role semantics.
export function canRestoreAsset(user: User, project: Project): boolean {
  return canWriteAsset(user, project);
}

export function canPermanentDeleteAsset(user: User, project: Project): boolean {
  return canWriteAsset(user, project);
}

export function canRestoreFolder(user: User, project: Project): boolean {
  return canWriteAsset(user, project);
}

export function canPermanentDeleteFolder(user: User, project: Project): boolean {
  return canWriteAsset(user, project);
}

// ---------- Review-link scope ----------

export function canCreateReviewLink(user: User, project: Project): boolean {
  // Same gate as canUpload per design: platform editor+ AND project owner/editor.
  return canUpload(user, project);
}

export function canEditReviewLink(user: User, project: Project, link: ReviewLink): boolean {
  if (isPlatformAdmin(user)) return true;
  if (project.ownerId === user.id) return true;
  return link.createdBy === user.id && canAccessProject(user, project);
}

export function canDeleteReviewLink(user: User, project: Project, link: ReviewLink): boolean {
  return canEditReviewLink(user, project, link);
}

// ---------- Comments ----------

export function canPostComment(user: User, project: Project): boolean {
  // Any project role (including reviewer) can post comments.
  return canAccessProject(user, project);
}

export function canResolveComment(user: User, project: Project): boolean {
  return canAccessProject(user, project);
}

export function canEditComment(user: User, project: Project, comment: Comment): boolean {
  if (isPlatformAdmin(user)) return true;
  if (comment.authorId === null) return false;
  return comment.authorId === user.id && canAccessProject(user, project);
}

export function canDeleteComment(user: User, project: Project, comment: Comment): boolean {
  if (isPlatformAdmin(user)) return true;
  if (project.ownerId === user.id && canAccessProject(user, project)) return true;
  if (comment.authorId !== null && comment.authorId === user.id && canAccessProject(user, project)) {
    return true;
  }
  return false;
}

// ---------- Review-link assertions (throw-style for write paths) ----------

export type ReviewLinkDenyReason =
  | 'expired'
  | 'password'
  | 'comments_disabled'
  | 'approvals_disabled'
  | 'downloads_disabled';

export class ReviewLinkDenied extends Error {
  public readonly reason: ReviewLinkDenyReason;
  constructor(reason: ReviewLinkDenyReason) {
    super(reason);
    this.reason = reason;
    this.name = 'ReviewLinkDenied';
  }
}

interface TimestampLike {
  toMillis?: () => number;
  toDate?: () => Date;
  seconds?: number;
}

function tsToMillis(ts: unknown): number | null {
  if (!ts) return null;
  const t = ts as TimestampLike;
  if (typeof t.toMillis === 'function') return t.toMillis();
  if (typeof t.toDate === 'function') return t.toDate().getTime();
  if (typeof t.seconds === 'number') return t.seconds * 1000;
  return null;
}

/**
 * Enforce expiry and password gates. Returns `{ needsPasswordUpgrade }` so the
 * caller can fire-and-forget a re-hash when the stored password was legacy
 * plaintext (SEC-20 transparent migration).
 */
export function assertReviewLinkActive(
  link: ReviewLink,
  opts: { providedPassword?: string }
): { needsPasswordUpgrade: boolean } {
  if (link.expiresAt) {
    const expires = tsToMillis(link.expiresAt);
    if (expires !== null && expires < Date.now()) {
      throw new ReviewLinkDenied('expired');
    }
  }
  if (link.password) {
    if (!opts.providedPassword) {
      throw new ReviewLinkDenied('password');
    }
    const { ok, needsUpgrade } = verifyPassword(opts.providedPassword, link.password);
    if (!ok) throw new ReviewLinkDenied('password');
    return { needsPasswordUpgrade: needsUpgrade };
  }
  return { needsPasswordUpgrade: false };
}

export function assertReviewLinkAllows(
  link: ReviewLink,
  action: 'comment' | 'approve' | 'download'
): void {
  if (action === 'comment' && link.allowComments === false) {
    throw new ReviewLinkDenied('comments_disabled');
  }
  if (action === 'approve' && link.allowApprovals !== true) {
    throw new ReviewLinkDenied('approvals_disabled');
  }
  if (action === 'download' && link.allowDownloads !== true) {
    throw new ReviewLinkDenied('downloads_disabled');
  }
}
