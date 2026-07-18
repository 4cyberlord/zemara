import type { ReactElement } from 'react'

import { cn } from '@/lib/utils'

/**
 * Loading placeholder — ported from reui.io's Skeleton component
 * (github.com/keenthemes/reui, registry/bases/radix/ui/skeleton.tsx): a
 * single pulsing block. Composed per-section into shapes that mirror the
 * real content (see skeleton-rows.tsx) instead of a generic spinner, so a
 * loading list already looks like the list it's about to become.
 */
export function Skeleton({ className, ...props }: React.ComponentProps<'div'>): ReactElement {
  return (
    <div
      data-slot="skeleton"
      className={cn('animate-pulse rounded-md bg-muted', className)}
      {...props}
    />
  )
}
