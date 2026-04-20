'use client';

import { useState } from 'react';
import { Ban, RefreshCw, CheckCircle } from 'lucide-react';
import { Spinner } from '@/components/ui/Spinner';
import type { User } from '@/types';

interface Props {
  user: User;
  isSelf: boolean;
  onSuspendToggle: (userId: string, disabled: boolean) => Promise<void>;
  onRevoke: (userId: string) => Promise<void>;
}

export function UserSessionActions({ user, isSelf, onSuspendToggle, onRevoke }: Props) {
  const [suspendLoading, setSuspendLoading] = useState(false);
  const [revokeLoading, setRevokeLoading] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState(false);

  if (isSelf) return null;

  const disabled = !!(user as any).disabled;

  const handleSuspend = async () => {
    setSuspendLoading(true);
    await onSuspendToggle(user.id, !disabled);
    setSuspendLoading(false);
  };

  const handleRevoke = async () => {
    if (!confirmRevoke) { setConfirmRevoke(true); return; }
    setRevokeLoading(true);
    await onRevoke(user.id);
    setRevokeLoading(false);
    setConfirmRevoke(false);
  };

  return (
    <div className="inline-flex items-center gap-3">
      {/* Suspend / Reactivate */}
      <button
        onClick={handleSuspend}
        disabled={suspendLoading}
        className={`inline-flex items-center gap-1 text-xs transition-colors disabled:opacity-50 ${
          disabled
            ? 'text-frame-accent hover:text-frame-accentHover'
            : 'text-frame-textMuted hover:text-yellow-400'
        }`}
      >
        {suspendLoading ? (
          <Spinner size="sm" />
        ) : disabled ? (
          <CheckCircle className="w-3.5 h-3.5" />
        ) : (
          <Ban className="w-3.5 h-3.5" />
        )}
        {disabled ? 'Reactivate' : 'Suspend'}
      </button>

      {/* Revoke sessions */}
      {confirmRevoke ? (
        <span className="inline-flex items-center gap-2 text-xs">
          <span className="text-frame-textSecondary">Sure?</span>
          <button
            onClick={handleRevoke}
            disabled={revokeLoading}
            className="text-yellow-400 hover:text-yellow-300 font-medium disabled:opacity-50"
          >
            {revokeLoading ? '…' : 'Yes, revoke'}
          </button>
          <button
            onClick={() => setConfirmRevoke(false)}
            className="text-frame-textMuted hover:text-white"
          >
            Cancel
          </button>
        </span>
      ) : (
        <button
          onClick={handleRevoke}
          className="inline-flex items-center gap-1 text-xs text-frame-textMuted hover:text-yellow-400 transition-colors"
          title="Invalidate the user's active Firebase refresh tokens"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Revoke sessions
        </button>
      )}
    </div>
  );
}
