'use client';

import { useState } from 'react';
import { X, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/Button';

interface CreateUserModalProps {
  onClose: () => void;
  onCreated: (user: any) => void;
  getIdToken: () => Promise<string | null>;
}

export function CreateUserModal({ onClose, onCreated, getIdToken }: CreateUserModalProps) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'admin' | 'manager' | 'editor' | 'viewer'>('viewer');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim()) return;
    setSubmitting(true);
    setError('');
    try {
      const token = await getIdToken();
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: name.trim(), email: email.trim(), role }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to create user');
        return;
      }
      onCreated(data.user);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-frame-card border border-frame-border rounded-xl shadow-2xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-frame-border">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-frame-accent/10 rounded-lg flex items-center justify-center">
              <UserPlus className="w-4 h-4 text-frame-accent" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-white">Invite user</h2>
              <p className="text-xs text-frame-textMuted">They'll sign in with Google using this email</p>
            </div>
          </div>
          <button onClick={onClose} className="text-frame-textMuted hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-medium text-frame-textSecondary mb-1.5">Full name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Jane Smith"
              required
              autoFocus
              className="w-full bg-frame-bg border border-frame-border rounded-lg px-3 py-2 text-sm text-white placeholder-frame-textMuted focus:outline-none focus:border-frame-accent transition-colors"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-frame-textSecondary mb-1.5">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="jane@company.com"
              required
              className="w-full bg-frame-bg border border-frame-border rounded-lg px-3 py-2 text-sm text-white placeholder-frame-textMuted focus:outline-none focus:border-frame-accent transition-colors"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-frame-textSecondary mb-1.5">Role</label>
            <div className="flex gap-2">
              {(['viewer', 'editor', 'manager', 'admin'] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRole(r)}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors capitalize ${
                    role === r
                      ? 'bg-frame-accent/15 border-frame-accent text-frame-accent'
                      : 'bg-frame-bg border-frame-border text-frame-textSecondary hover:text-white hover:border-frame-borderLight'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <p className="text-sm text-red-400 bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <div className="flex gap-2 pt-1">
            <Button type="button" variant="ghost" className="flex-1" onClick={onClose} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" className="flex-1" disabled={submitting || !name.trim() || !email.trim()}>
              {submitting ? 'Saving…' : 'Save invitation'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
