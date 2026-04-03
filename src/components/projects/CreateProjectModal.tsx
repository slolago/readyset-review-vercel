'use client';

import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/hooks/useAuth';
import { PROJECT_COLORS, getProjectColor } from '@/lib/utils';
import toast from 'react-hot-toast';

interface CreateProjectModalProps {
  onClose: () => void;
  onCreated: () => void;
}

export function CreateProjectModal({ onClose, onCreated }: CreateProjectModalProps) {
  const { getIdToken } = useAuth();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState('purple');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Project name is required');
      return;
    }

    setLoading(true);
    try {
      const token = await getIdToken();
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name: name.trim(), description: description.trim(), color }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to create project');
      }

      toast.success('Project created!');
      onCreated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create project');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} title="New Project">
      <form onSubmit={handleSubmit} className="space-y-5">
        <Input
          label="Project name"
          placeholder="My Awesome Project"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setError('');
          }}
          error={error}
          autoFocus
        />

        <div>
          <label className="block text-sm font-medium text-frame-textSecondary mb-1.5">
            Description
          </label>
          <textarea
            placeholder="What is this project about? (optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="w-full bg-frame-bg border border-frame-border rounded-lg px-4 py-2.5 text-sm text-white placeholder-frame-textMuted resize-none focus:outline-none focus:border-frame-accent transition-colors"
          />
        </div>

        {/* Color picker */}
        <div>
          <label className="block text-sm font-medium text-frame-textSecondary mb-2">
            Color
          </label>
          <div className="flex gap-2 flex-wrap">
            {PROJECT_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className={`w-7 h-7 rounded-full transition-all ${
                  color === c ? 'ring-2 ring-white ring-offset-2 ring-offset-frame-card scale-110' : 'hover:scale-110'
                }`}
                style={{ backgroundColor: getProjectColor(c) }}
                title={c}
              />
            ))}
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={onClose} className="flex-1">
            Cancel
          </Button>
          <Button type="submit" loading={loading} className="flex-1">
            Create Project
          </Button>
        </div>
      </form>
    </Modal>
  );
}
