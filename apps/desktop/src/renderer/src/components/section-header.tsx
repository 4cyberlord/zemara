import type { ReactElement, ReactNode } from 'react'

import { cn } from '@/lib/utils'

/**
 * Section label (videorc-design): tertiary-gray, small, with the standard
 * 16px-above / 8px-below rhythm. The only allowed list section treatment.
 */
export function SectionHeader({
  className,
  children
}: {
  className?: string
  children: ReactNode
}): ReactElement {
  return (
    <div
      data-slot="section-header"
      className={cn('px-3 pt-4 pb-2 text-[12.5px] leading-none font-medium text-subtle', className)}
    >
      {children}
    </div>
  )
}
