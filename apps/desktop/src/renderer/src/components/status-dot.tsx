import type { ReactElement } from 'react'

import { cn } from '@/lib/utils'

export type StatusDotTone = 'good' | 'warn' | 'error' | 'neutral'

const toneClass: Record<StatusDotTone, string> = {
  good: 'bg-success',
  warn: 'bg-warning',
  error: 'bg-live',
  neutral: 'bg-muted-foreground'
}

/** Ambient status: a small dot (optionally pulsing) + label. Replaces the loud header badges. */
export function StatusDot({
  tone = 'neutral',
  label,
  pulse = false,
  className
}: {
  tone?: StatusDotTone
  label?: string
  pulse?: boolean
  className?: string
}): ReactElement {
  return (
    <span
      className={cn('inline-flex items-center gap-1.5 text-xs text-muted-foreground', className)}
    >
      <span className="relative flex size-2 shrink-0">
        {pulse ? (
          <span
            className={cn(
              'absolute inline-flex size-full animate-ping rounded-full opacity-60',
              toneClass[tone]
            )}
          />
        ) : null}
        <span className={cn('relative inline-flex size-2 rounded-full', toneClass[tone])} />
      </span>
      {label ? <span className="truncate capitalize">{label}</span> : null}
    </span>
  )
}
