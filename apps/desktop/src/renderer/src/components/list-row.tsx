import type { ComponentProps, ReactElement, ReactNode } from 'react'

import { cn } from '@/lib/utils'

/**
 * The shared row (videorc-design): every icon+title+meta list renders through
 * this one anatomy — 24px rounded-square icon tile, primary title, inline
 * secondary context, optional alias chips, spring space, right-aligned status
 * icons and secondary meta label. Selection is the theme's 8% block.
 */
export function ListRow({
  icon,
  title,
  context,
  alias,
  statusIcons,
  meta,
  selected = false,
  interactive = true,
  className,
  children,
  ...props
}: {
  /** 24px rounded-square tile content (app/source icon — the colorful slot). */
  icon?: ReactNode
  title: ReactNode
  /** Inline secondary-gray context after the title (platform, owner, kind). */
  context?: ReactNode
  /** Optional key chips right after the context (e.g. an alias). */
  alias?: ReactNode
  /** Small status icons just before the meta label. */
  statusIcons?: ReactNode
  /** Right-aligned secondary-gray metadata ("Command", "Connected"). */
  meta?: ReactNode
  selected?: boolean
  /** Render hover/active affordances; rows inside cmdk manage their own. */
  interactive?: boolean
  children?: ReactNode
} & ComponentProps<'div'>): ReactElement {
  return (
    <div
      data-slot="list-row"
      data-selected={selected || undefined}
      className={cn(
        'flex h-11 items-center gap-3 rounded-row px-3 text-sm',
        interactive && 'cursor-default transition-colors duration-100 hover:bg-accent',
        selected && 'bg-accent',
        className
      )}
      {...props}
    >
      {icon ? (
        <span
          data-slot="list-row-icon"
          className="flex size-6 shrink-0 items-center justify-center overflow-hidden rounded-chip [&_svg:not([class*='size-'])]:size-5"
        >
          {icon}
        </span>
      ) : null}
      <span className="flex min-w-0 items-baseline gap-2">
        <span data-slot="list-row-title" className="truncate font-medium text-foreground">
          {title}
        </span>
        {context ? (
          <span data-slot="list-row-context" className="truncate text-muted-foreground">
            {context}
          </span>
        ) : null}
        {alias}
      </span>
      <span className="ml-auto flex shrink-0 items-center gap-2">
        {children}
        {statusIcons ? (
          <span className="flex items-center gap-1.5 text-muted-foreground [&_svg:not([class*='size-'])]:size-4">
            {statusIcons}
          </span>
        ) : null}
        {meta ? (
          <span data-slot="list-row-meta" className="text-[13px] text-muted-foreground">
            {meta}
          </span>
        ) : null}
      </span>
    </div>
  )
}
