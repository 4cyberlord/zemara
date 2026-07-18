import * as React from 'react'

import { cn } from '@/lib/utils'

/**
 * Key chip (videorc-design): small rounded rect, 10% foreground fill, hairline
 * border, secondary-gray glyph. Used beside every primary action ("⌘", "K",
 * "↵", aliases like "st").
 */
function Kbd({ className, ...props }: React.ComponentProps<'kbd'>) {
  return (
    <kbd
      data-slot="kbd"
      className={cn(
        'inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-chip border border-border bg-foreground/10 px-1 font-sans text-[11px] font-medium text-muted-foreground select-none',
        className
      )}
      {...props}
    />
  )
}

/** Lays out a sequence of key chips ("⌘ K") with the standard gap. */
function KbdGroup({ className, ...props }: React.ComponentProps<'span'>) {
  return (
    <span
      data-slot="kbd-group"
      className={cn('inline-flex items-center gap-1', className)}
      {...props}
    />
  )
}

export { Kbd, KbdGroup }
