'use client';

import { useState } from 'react';
import { MessageSquare } from 'lucide-react';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';

interface ReviewGuestFormProps {
  projectName: string;
  onSubmit: (info: { name: string; email: string }) => void;
}

export function ReviewGuestForm({ projectName, onSubmit }: ReviewGuestFormProps) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [errors, setErrors] = useState<{ name?: string; email?: string }>({});

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const newErrors: { name?: string; email?: string } = {};
    if (!name.trim()) newErrors.name = 'Name is required';
    if (!email.trim()) newErrors.email = 'Email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) newErrors.email = 'Invalid email';
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }
    onSubmit({ name: name.trim(), email: email.trim() });
  };

  return (
    <div className="w-full max-w-sm mx-auto">
      <div className="text-center mb-8">
        <div className="w-12 h-12 bg-frame-accent/10 border border-frame-accent/30 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <MessageSquare className="w-6 h-6 text-frame-accent" />
        </div>
        <h1 className="text-xl font-bold text-white">Review: {projectName}</h1>
        <p className="text-frame-textSecondary text-sm mt-2">
          Enter your details to leave comments on this review.
        </p>
      </div>

      <div className="bg-frame-card border border-frame-border rounded-2xl p-6">
        <div className="flex items-center gap-2 mb-5">
          <MessageSquare className="w-4 h-4 text-frame-accent" />
          <h2 className="text-sm font-semibold text-white">Who are you?</h2>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Your name"
            placeholder="Jane Smith"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setErrors((prev) => ({ ...prev, name: undefined }));
            }}
            error={errors.name}
            autoFocus
          />
          <Input
            label="Your email"
            type="email"
            placeholder="jane@example.com"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setErrors((prev) => ({ ...prev, email: undefined }));
            }}
            error={errors.email}
          />
          <Button type="submit" className="w-full">
            Start reviewing
          </Button>
        </form>
      </div>
    </div>
  );
}
