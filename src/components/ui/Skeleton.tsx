type Props = { className?: string };

export function Skeleton({ className = '' }: Props) {
  return <div className={`animate-pulse bg-neutral-800/50 rounded-md ${className}`} />;
}
