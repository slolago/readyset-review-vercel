import { cn } from '@/lib/utils';

const STATUS_META: Record<string, { label: string; className: string }> = {
  approved: {
    label: 'Approved',
    className: 'bg-emerald-500/15 text-emerald-400',
  },
  needs_revision: {
    label: 'Needs Revision',
    className: 'bg-yellow-500/15 text-yellow-400',
  },
  in_review: {
    label: 'In Review',
    className: 'bg-blue-500/15 text-blue-400',
  },
};

export function ReviewStatusBadge({ status }: { status?: string }) {
  if (!status || !STATUS_META[status]) return null;
  const { label, className } = STATUS_META[status];
  return (
    <span
      className={cn(
        'inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium leading-tight',
        className
      )}
    >
      {label}
    </span>
  );
}
