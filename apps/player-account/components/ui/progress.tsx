interface ProgressProps {
  readonly className?: string;
  readonly label: string;
  readonly value: number;
}

export function Progress({ className = "", label, value }: ProgressProps) {
  const bounded = Math.max(0, Math.min(100, value));
  return (
    <div aria-label={label} aria-valuemax={100} aria-valuemin={0} aria-valuenow={bounded} className={`h-2 w-full overflow-hidden rounded-full bg-secondary ${className}`} role="progressbar">
      <div className="h-full rounded-full bg-gradient-to-r from-primary to-[#7c5cff] transition-[width]" style={{ width: `${bounded}%` }} />
    </div>
  );
}
