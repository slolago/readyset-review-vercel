'use client';

import { useState, useRef } from 'react';
import { Input } from '@/components/ui/Input';
import { Avatar } from '@/components/ui/Avatar';
import { useAuth } from '@/hooks/useAuth';
import { Search, Loader2 } from 'lucide-react';

export interface UserResult {
  id: string;
  name: string;
  email: string;
}

interface UserSearchComboboxProps {
  onSelect: (user: UserResult) => void;
  onClear: () => void;
  exclude?: string[];
  placeholder?: string;
  disabled?: boolean;
  /**
   * When true, selecting a user clears the input instead of filling it with
   * their name. Use in multi-select contexts where the parent renders chips.
   */
  clearOnSelect?: boolean;
}

export function UserSearchCombobox({
  onSelect,
  onClear,
  exclude = [],
  placeholder = 'Search by name or email...',
  disabled = false,
  clearOnSelect = false,
}: UserSearchComboboxProps) {
  const { getIdToken } = useAuth();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<UserResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  const versionRef = useRef(0);

  const search = async (q: string) => {
    const version = ++versionRef.current;

    if (q.trim().length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }

    setLoading(true);
    try {
      const token = await getIdToken();
      const res = await fetch(
        `/api/users/search?q=${encodeURIComponent(q)}&exclude=${exclude.join(',')}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      // Discard stale responses
      if (version !== versionRef.current) return;

      if (res.ok) {
        const data = await res.json() as { users: UserResult[] };
        setResults(data.users || []);
        setOpen(true);
      } else {
        setResults([]);
      }
    } catch {
      if (version === versionRef.current) {
        setResults([]);
      }
    } finally {
      if (version === versionRef.current) {
        setLoading(false);
      }
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setQuery(value);
    onClear(); // Invalidate any prior selection whenever input changes
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => search(value), 250);
  };

  const handleSelect = (user: UserResult) => {
    if (clearOnSelect) {
      setQuery('');
    } else {
      setQuery(user.name);
    }
    setResults([]);
    setOpen(false);
    onSelect(user);
  };

  const handleFocus = () => {
    if (results.length > 0) setOpen(true);
  };

  const handleBlur = () => {
    // Delay to allow onMouseDown on list items to fire first
    setTimeout(() => setOpen(false), 150);
  };

  const showNoResults =
    open && !loading && results.length === 0 && query.trim().length >= 2;

  const showDropdown = open && (results.length > 0 || showNoResults);

  return (
    <div className="relative flex-1">
      <Input
        value={query}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        placeholder={placeholder}
        disabled={disabled}
        icon={
          loading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Search className="w-4 h-4" />
          )
        }
      />

      {/* Hint text for single-character queries */}
      {query.length === 1 && (
        <p className="mt-1 text-xs text-frame-textMuted">
          Type at least 2 characters
        </p>
      )}

      {/* Dropdown */}
      {showDropdown && (
        <ul className="absolute z-50 mt-1 w-full bg-frame-card border border-frame-border rounded-xl shadow-lg overflow-hidden max-h-64 overflow-y-auto">
          {results.length > 0
            ? results.map((u) => (
                <li
                  key={u.id}
                  onMouseDown={() => handleSelect(u)}
                  className="px-4 py-2.5 cursor-pointer hover:bg-frame-cardHover flex items-center gap-3"
                >
                  <Avatar name={u.name} size="sm" />
                  <div className="min-w-0">
                    <p className="text-sm text-white truncate">{u.name}</p>
                    <p className="text-xs text-frame-textMuted truncate">{u.email}</p>
                  </div>
                </li>
              ))
            : showNoResults && (
                <li className="px-4 py-3 text-sm text-frame-textMuted">
                  No users found
                </li>
              )}
        </ul>
      )}
    </div>
  );
}
