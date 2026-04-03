'use client';

import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/hooks/useAuth';
import toast from 'react-hot-toast';

interface CreateFolderModalProps {
  projectId: string;
  parentId: string | null;
  onClose: () => void;
  onCreated: () => void;
}

export function CreateFolderModal({ projectId, parentId, onClose, onCreated }: CreateFolderModalProps) {
  const { getIdToken } = useAuth();
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Folder name is required');
      return;
    }

    setLoading(true);
    try {
      const token = await getIdToken();
      const res = await fetch('/api/folders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name: name.trim(), projectId, parentId }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to create folder');
      }

      toast.success('Folder created!');
      onCreated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create folder');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} title="New Folder" size="sm">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Folder name"
          placeholder="e.g. Final Cuts"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setError('');
          }}
          error={error}
          autoFocus
        />

        <div className="flex gap-3">
          <Button type="button" variant="secondary" onClick={onClose} className="flex-1">
            Cancel
          </Button>
          <Button type="submit" loading={loading} className="flex-1">
            Create
          </Button>
        </div>
      </form>
    </Modal>
  );
}
