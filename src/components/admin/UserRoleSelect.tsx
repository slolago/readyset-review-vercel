'use client';

interface UserRoleSelectProps {
  userId: string;
  currentRole: 'admin' | 'user';
  disabled?: boolean;
  onRoleChange: (userId: string, role: 'admin' | 'user') => void;
}

export function UserRoleSelect({
  userId,
  currentRole,
  disabled,
  onRoleChange,
}: UserRoleSelectProps) {
  return (
    <select
      value={currentRole}
      onChange={(e) => onRoleChange(userId, e.target.value as 'admin' | 'user')}
      disabled={disabled}
      className="bg-frame-bg border border-frame-border rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-frame-accent transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
    >
      <option value="user">User</option>
      <option value="admin">Admin</option>
    </select>
  );
}
