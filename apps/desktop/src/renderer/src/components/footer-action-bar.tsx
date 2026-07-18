import type { ReactElement, ReactNode } from 'react'

import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'

/**
 * Footer action bar (videorc-design): the hairline-separated strip at a
 * panel's bottom edge — leading glyph/context on the left, actions with key
 * chips on the right. Compose actions from ghost Buttons + Kbd chips and
 * divide them with <FooterActionDivider />.
 */
export function FooterActionBar({
  leading,
  className,
  children
}: {
  /** Left side: app glyph button or contextual hint (tertiary). */
  leading?: ReactNode
  className?: string
  /** Right side: ghost-button actions with their Kbd chips. */
  children?: ReactNode
}): ReactElement {
  return (
    <div
      data-slot="footer-action-bar"
      className={cn(
        // min-h (not fixed h) + flex-wrap so the actions reflow onto a second
        // row when the window is too narrow to hold them, instead of overflowing
        // off the right edge out of sight.
        'flex min-h-11 shrink-0 flex-wrap items-center gap-x-2 gap-y-1 border-t border-border px-3 py-1.5',
        className
      )}
    >
      {/* F-026: at narrow widths the actions need every pixel — the contextual
          label yields first so the bar stays on one row longer. */}
      <div className="hidden items-center gap-2 text-[13px] text-subtle md:flex">{leading}</div>
      <div className="ml-auto flex flex-wrap items-center gap-1.5">{children}</div>
    </div>
  )
}

/** Hairline vertical divider between footer actions. */
export function FooterActionDivider(): ReactElement {
  return <Separator orientation="vertical" className="mx-1 h-4!" />
}
