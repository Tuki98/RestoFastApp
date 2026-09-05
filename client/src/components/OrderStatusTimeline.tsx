import { Fragment, useEffect, useState } from 'react'
import type { Order } from '@/lib/api'
import { ORDER_STATUS_LABEL } from '@/lib/orderStatus'
import { formatDuration } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'

const TICK_MS = 30_000

export function OrderStatusTimeline({
  order,
  compact = false,
}: {
  order: Order
  compact?: boolean
}) {
  const [, setNow] = useState(0)

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), TICK_MS)
    return () => clearInterval(id)
  }, [])

  const times = order.statusTimes ?? []
  if (times.length === 0) return null

  const currentTime = Date.now()

  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-x-2 gap-y-1',
        compact ? 'text-xs' : 'text-sm',
      )}
      aria-label="Tiempos por estado de la comanda"
    >
      {times.map((t, i) => {
        const isCurrent = t.endedAt === null
        const liveMs = isCurrent
          ? Math.max(0, currentTime - new Date(t.startedAt).getTime())
          : t.durationMs
        return (
          <Fragment key={`${t.status}-${i}`}>
            {i > 0 && <span className="text-muted-foreground">→</span>}
            <span className="flex items-center gap-1">
              <Badge variant={isCurrent ? 'default' : 'secondary'}>
                {ORDER_STATUS_LABEL[t.status]}
              </Badge>
              <span
                className={cn(
                  'tabular-nums',
                  isCurrent ? 'font-semibold' : 'text-muted-foreground',
                )}
              >
                {formatDuration(liveMs)}
              </span>
            </span>
          </Fragment>
        )
      })}
    </div>
  )
}
