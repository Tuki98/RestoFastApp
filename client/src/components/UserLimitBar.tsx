import { cn } from '@/lib/utils'

export function UserLimitBar({
  users,
  max,
  className,
}: {
  users: number
  max: number | null
  className?: string
}) {
  const over = max != null && users > max
  const pct = max != null && max > 0 ? Math.min(100, (users / max) * 100) : 0

  return (
    <div className={className}>
      <div className="flex items-baseline gap-1 text-sm">
        <span className="font-semibold tabular-nums">{users}</span>
        <span className="text-xs text-muted-foreground">
          {max != null ? `/ ${max} usuarios` : 'usuarios'}
        </span>
      </div>
      {max != null && (
        <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={cn(
              'h-full rounded-full transition-all',
              over
                ? 'bg-destructive'
                : pct >= 90
                  ? 'bg-amber-500'
                  : 'bg-primary',
            )}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
    </div>
  )
}
