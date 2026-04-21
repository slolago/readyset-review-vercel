import type { ReactNode } from 'react';

/** Which kind of thing the right-click / three-dots menu is targeting. */
export type ActionTarget = 'asset' | 'folder' | 'mixed';

/** Unified item shape — superset of ContextMenu MenuItem and Dropdown DropdownItem.
 *  Consumers map `divider` <-> `dividerBefore` when feeding into Dropdown. */
export interface BrowserAction {
  /** Stable key for dedup + testing (e.g. 'rename', 'duplicate'). */
  id: string;
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  /** Used by ContextMenu. Dropdown consumers must map this to `divider`. */
  dividerBefore?: boolean;
}

/** Handlers the consumer must supply — `undefined` means "this action is not
 *  supported in this context and will be omitted from the returned list". */
export interface ActionContext {
  onOpen?: () => void;
  onRename?: () => void;
  onDuplicate?: () => void;
  onCopyTo?: () => void;
  onMoveTo?: () => void;
  onUploadVersion?: () => void;    // asset-only
  onStackOnto?: () => void;        // asset-only
  onManageVersions?: () => void;   // asset-only
  onDownload?: () => void;
  onGetLink?: () => void;
  onCreateReviewLink?: () => void;
  onAddToReviewLink?: () => void;
  /** Asset-only. */
  onSetStatus?: (status: 'approved' | 'needs_revision' | 'in_review' | null) => void;
  onDelete?: () => void;
  /** Icon factory — kept here so the action file doesn't hard-depend on lucide-react.
   *  Consumer supplies the icon map; the helper returns undefined icon if no match. */
  icons?: Partial<Record<
    | 'open' | 'rename' | 'duplicate' | 'copyTo' | 'moveTo' | 'uploadVersion'
    | 'stackOnto' | 'manageVersions' | 'download' | 'getLink'
    | 'createReviewLink' | 'addToReviewLink'
    | 'approved' | 'needsRevision' | 'inReview' | 'clearStatus' | 'delete',
    ReactNode
  >>;
}

/**
 * Single source of truth for the asset / folder / mixed action lists used by
 * the right-click context menu, the three-dots dropdown, and (eventually) the
 * bottom selection bar. Omitted handlers drop their corresponding items.
 */
export function buildFileBrowserActions(
  target: ActionTarget,
  ctx: ActionContext
): BrowserAction[] {
  const items: BrowserAction[] = [];
  const push = (a: BrowserAction | null) => { if (a) items.push(a); };

  // Open — asset / folder only; skipped for mixed selection.
  if (target !== 'mixed' && ctx.onOpen)
    push({ id: 'open', label: 'Open', icon: ctx.icons?.open, onClick: ctx.onOpen });

  // Rename — single-target only.
  if (ctx.onRename && target !== 'mixed')
    push({ id: 'rename', label: 'Rename', icon: ctx.icons?.rename, onClick: ctx.onRename });

  if (ctx.onDuplicate)
    push({ id: 'duplicate', label: 'Duplicate', icon: ctx.icons?.duplicate, onClick: ctx.onDuplicate });

  if (ctx.onCopyTo)
    push({ id: 'copyTo', label: 'Copy to', icon: ctx.icons?.copyTo, onClick: ctx.onCopyTo });

  if (ctx.onMoveTo)
    push({ id: 'moveTo', label: 'Move to', icon: ctx.icons?.moveTo, onClick: ctx.onMoveTo });

  // Asset-only version operations.
  if (target === 'asset') {
    if (ctx.onUploadVersion)
      push({ id: 'uploadVersion', label: 'Upload new version', icon: ctx.icons?.uploadVersion, onClick: ctx.onUploadVersion });
    if (ctx.onStackOnto)
      push({ id: 'stackOnto', label: 'Stack onto\u2026', icon: ctx.icons?.stackOnto, onClick: ctx.onStackOnto });
    if (ctx.onManageVersions)
      push({ id: 'manageVersions', label: 'Manage version stack', icon: ctx.icons?.manageVersions, onClick: ctx.onManageVersions });
  }

  if (ctx.onDownload)
    push({ id: 'download', label: 'Download', icon: ctx.icons?.download, onClick: ctx.onDownload });

  if (ctx.onGetLink && target === 'asset')
    push({ id: 'getLink', label: 'Get link', icon: ctx.icons?.getLink, onClick: ctx.onGetLink });

  if (ctx.onCreateReviewLink)
    push({ id: 'createReviewLink', label: 'Create review link', icon: ctx.icons?.createReviewLink, onClick: ctx.onCreateReviewLink, dividerBefore: true });
  if (ctx.onAddToReviewLink)
    push({ id: 'addToReviewLink', label: 'Add to review link\u2026', icon: ctx.icons?.addToReviewLink, onClick: ctx.onAddToReviewLink });

  // Review status — asset-only.
  if (target === 'asset' && ctx.onSetStatus) {
    const setStatus = ctx.onSetStatus;
    push({ id: 'approved', label: 'Approved', icon: ctx.icons?.approved, onClick: () => setStatus('approved'), dividerBefore: true });
    push({ id: 'needsRevision', label: 'Needs Revision', icon: ctx.icons?.needsRevision, onClick: () => setStatus('needs_revision') });
    push({ id: 'inReview', label: 'In Review', icon: ctx.icons?.inReview, onClick: () => setStatus('in_review') });
    push({ id: 'clearStatus', label: 'Clear status', icon: ctx.icons?.clearStatus, onClick: () => setStatus(null) });
  }

  if (ctx.onDelete)
    push({ id: 'delete', label: 'Delete', icon: ctx.icons?.delete, onClick: ctx.onDelete, danger: true, dividerBefore: true });

  return items;
}
