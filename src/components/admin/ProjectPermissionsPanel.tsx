'use client';

import { useCallback, useEffect, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import {
  MessageSquare,
  Download,
  CheckCircle2,
  Layers,
  Lock,
  Trash2,
  Calendar,
} from 'lucide-react';
import toast from 'react-hot-toast';

interface HydratedCollaborator {
  userId: string;
  name: string;
  email: string;
  role: 'owner' | 'editor' | 'reviewer';
  disabled?: boolean;
  invited?: boolean;
}

interface ReviewLinkRow {
  token: string;
  name: string | null;
  createdBy: string;
  createdByName: string;
  createdAt: any;
  expiresAt: any | null;
  allowComments: boolean;
  allowDownloads: boolean;
  allowApprovals: boolean;
  showAllVersions: boolean;
  hasPassword: boolean;
}

interface PendingInviteRow {
  userId: string;
  name: string;
  email: string;
}

interface PermissionsPayload {
  project: { id: string; name: string; ownerId: string; ownerName: string; ownerEmail: string };
  collaborators: HydratedCollaborator[];
  reviewLinks: ReviewLinkRow[];
  pendingInvites: PendingInviteRow[];
}

const ROLE_COLORS: Record<string, 'purple' | 'success' | 'info'> = {
  owner: 'purple',
  editor: 'success',
  reviewer: 'info',
};

interface Props {
  projectId: string;
  onClose: () => void;
  getIdToken: () => Promise<string | null>;
}

function toDate(v: any): Date | null {
  if (!v) return null;
  if (typeof v?.toDate === 'function') return v.toDate();
  if (typeof v?._seconds === 'number') return new Date(v._seconds * 1000);
  return null;
}

export function ProjectPermissionsPanel({ projectId, onClose, getIdToken }: Props) {
  const [data, setData] = useState<PermissionsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirmRevoke, setConfirmRevoke] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getIdToken();
      const res = await fetch(`/api/admin/projects/${projectId}/permissions`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const b = await res.json().catch(() => null);
        throw new Error(b?.error || 'Failed to load');
      }
      setData(await res.json());
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [projectId, getIdToken]);

  useEffect(() => {
    load();
  }, [load]);

  const handleRoleChange = async (c: HydratedCollaborator, newRole: 'editor' | 'reviewer') => {
    if (newRole === c.role) return;
    setBusy(c.userId);
    try {
      const token = await getIdToken();
      // POST is idempotent (removes existing entry then appends) — see collaborators/route.ts
      const res = await fetch(`/api/projects/${projectId}/collaborators`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ email: c.email, role: newRole }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => null);
        throw new Error(b?.error || 'Failed to update role');
      }
      toast.success(`Role updated to ${newRole}`);
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const handleRevoke = async (token: string) => {
    setBusy(token);
    try {
      const idToken = await getIdToken();
      const res = await fetch(`/api/review-links/${token}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${idToken}` },
      });
      if (!res.ok) {
        const b = await res.json().catch(() => null);
        throw new Error(b?.error || 'Failed to revoke');
      }
      toast.success('Review link revoked');
      setConfirmRevoke(null);
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Modal isOpen onClose={onClose} title={data?.project.name ? `Permissions — ${data.project.name}` : 'Permissions'} size="lg">
      {loading || !data ? (
        <div className="flex items-center justify-center py-12">
          <Spinner />
        </div>
      ) : (
        <div className="space-y-6 max-h-[70vh] overflow-y-auto pr-1">
          {/* Collaborators */}
          <section>
            <h3 className="text-sm font-semibold text-white mb-3">
              Collaborators ({data.collaborators.length + 1})
            </h3>
            <div className="space-y-2">
              {/* Owner row — read-only */}
              <div className="flex items-center gap-3 px-3 py-2.5 bg-frame-bg rounded-lg border border-frame-border">
                <Avatar name={data.project.ownerName} size="sm" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white font-medium truncate">{data.project.ownerName}</p>
                  <p className="text-xs text-frame-textMuted truncate">{data.project.ownerEmail}</p>
                </div>
                <Badge variant="purple">owner</Badge>
              </div>
              {data.collaborators.length === 0 && (
                <p className="text-xs text-frame-textMuted py-2">No collaborators.</p>
              )}
              {data.collaborators.map((c) => (
                <div
                  key={c.userId}
                  className="flex items-center gap-3 px-3 py-2.5 bg-frame-bg rounded-lg border border-frame-border"
                >
                  <Avatar name={c.name} size="sm" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white font-medium truncate flex items-center gap-2 flex-wrap">
                      {c.name}
                      {c.disabled && (
                        <span className="text-[10px] bg-red-500/15 text-red-400 border border-red-400/20 px-1.5 py-0.5 rounded-full font-normal">
                          Suspended
                        </span>
                      )}
                      {c.invited && (
                        <span className="text-[10px] bg-yellow-400/10 text-yellow-400 border border-yellow-400/20 px-1.5 py-0.5 rounded-full font-normal">
                          Pending
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-frame-textMuted truncate">{c.email}</p>
                  </div>
                  <select
                    value={c.role}
                    disabled={busy === c.userId || c.role === 'owner'}
                    onChange={(e) => handleRoleChange(c, e.target.value as 'editor' | 'reviewer')}
                    className="bg-frame-bg border border-frame-border rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-frame-accent disabled:opacity-50"
                  >
                    <option value="editor">editor</option>
                    <option value="reviewer">reviewer</option>
                  </select>
                </div>
              ))}
            </div>
          </section>

          {/* Review Links */}
          <section>
            <h3 className="text-sm font-semibold text-white mb-3">
              Review Links ({data.reviewLinks.length})
            </h3>
            {data.reviewLinks.length === 0 ? (
              <p className="text-xs text-frame-textMuted py-2">No review links.</p>
            ) : (
              <div className="overflow-x-auto border border-frame-border rounded-lg">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-frame-border bg-frame-bg">
                      <th className="text-left px-3 py-2 font-semibold text-frame-textMuted uppercase tracking-wider">Token</th>
                      <th className="text-left px-3 py-2 font-semibold text-frame-textMuted uppercase tracking-wider">Creator</th>
                      <th className="text-left px-3 py-2 font-semibold text-frame-textMuted uppercase tracking-wider">Created</th>
                      <th className="text-left px-3 py-2 font-semibold text-frame-textMuted uppercase tracking-wider">Expires</th>
                      <th className="text-left px-3 py-2 font-semibold text-frame-textMuted uppercase tracking-wider">Flags</th>
                      <th className="px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {data.reviewLinks.map((rl) => {
                      const created = toDate(rl.createdAt);
                      const expires = toDate(rl.expiresAt);
                      const isConfirming = confirmRevoke === rl.token;
                      return (
                        <tr key={rl.token} className="border-b border-frame-border/50 last:border-0">
                          <td className="px-3 py-2 font-mono text-frame-textSecondary">{rl.token.slice(0, 8)}</td>
                          <td className="px-3 py-2 text-white">{rl.createdByName}</td>
                          <td className="px-3 py-2 text-frame-textSecondary">
                            {created ? created.toLocaleDateString() : '—'}
                          </td>
                          <td className="px-3 py-2 text-frame-textSecondary">
                            {expires ? (
                              <span className="inline-flex items-center gap-1">
                                <Calendar className="w-3 h-3" />
                                {expires.toLocaleDateString()}
                              </span>
                            ) : (
                              <span className="text-frame-textMuted">Never</span>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-1.5">
                              <MessageSquare
                                className={`w-3.5 h-3.5 ${rl.allowComments ? 'text-frame-accent' : 'text-frame-textMuted/40'}`}
                                aria-label={rl.allowComments ? 'Comments enabled' : 'Comments disabled'}
                              />
                              <Download
                                className={`w-3.5 h-3.5 ${rl.allowDownloads ? 'text-frame-accent' : 'text-frame-textMuted/40'}`}
                                aria-label={rl.allowDownloads ? 'Downloads enabled' : 'Downloads disabled'}
                              />
                              <CheckCircle2
                                className={`w-3.5 h-3.5 ${rl.allowApprovals ? 'text-frame-accent' : 'text-frame-textMuted/40'}`}
                                aria-label={rl.allowApprovals ? 'Approvals enabled' : 'Approvals disabled'}
                              />
                              <Layers
                                className={`w-3.5 h-3.5 ${rl.showAllVersions ? 'text-frame-accent' : 'text-frame-textMuted/40'}`}
                                aria-label={rl.showAllVersions ? 'All versions shown' : 'Latest version only'}
                              />
                              {rl.hasPassword && (
                                <Lock className="w-3.5 h-3.5 text-yellow-400" aria-label="Password protected" />
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-2 text-right">
                            {isConfirming ? (
                              <div className="inline-flex items-center gap-2">
                                <span className="text-frame-textSecondary">Revoke?</span>
                                <button
                                  onClick={() => handleRevoke(rl.token)}
                                  disabled={busy === rl.token}
                                  className="text-red-400 hover:text-red-300 font-medium disabled:opacity-50"
                                >
                                  {busy === rl.token ? '…' : 'Yes'}
                                </button>
                                <button
                                  onClick={() => setConfirmRevoke(null)}
                                  className="text-frame-textMuted hover:text-white"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => setConfirmRevoke(rl.token)}
                                className="inline-flex items-center gap-1 text-frame-textMuted hover:text-red-400 transition-colors"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                Revoke
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Pending Invites */}
          <section>
            <h3 className="text-sm font-semibold text-white mb-3">
              Pending Invites ({data.pendingInvites.length})
            </h3>
            {data.pendingInvites.length === 0 ? (
              <p className="text-xs text-frame-textMuted py-2">No pending invites.</p>
            ) : (
              <div className="space-y-2">
                {data.pendingInvites.map((p) => (
                  <div
                    key={p.userId}
                    className="flex items-center gap-3 px-3 py-2 bg-frame-bg rounded-lg border border-frame-border"
                  >
                    <Avatar name={p.name} size="sm" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white truncate">{p.name}</p>
                      <p className="text-xs text-frame-textMuted truncate">{p.email}</p>
                    </div>
                    <Badge variant="warning">Pending</Badge>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </Modal>
  );
}
