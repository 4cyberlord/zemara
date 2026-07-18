import type { ReactElement } from 'react'

import { Skeleton } from '@/components/ui/skeleton'

/** Thumbnail + title/subtitle row — mirrors the Sermons and Videos list rows. */
export function MediaRowSkeleton(): ReactElement {
  return (
    <div className="flex items-center gap-4 rounded-2xl border bg-card p-3">
      <Skeleton className="size-20 shrink-0 rounded-xl" />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <Skeleton className="h-4 w-3/5" />
        <Skeleton className="h-3.5 w-2/5" />
      </div>
    </div>
  )
}

/** Avatar + name/contact/columns row — mirrors the Members list row. */
export function MemberRowSkeleton(): ReactElement {
  return (
    <div className="flex items-center gap-4 rounded-2xl border bg-card p-3">
      <Skeleton className="size-10 shrink-0 rounded-full" />
      <div className="flex min-w-0 flex-[1.4] flex-col gap-2">
        <Skeleton className="h-4 w-2/5" />
        <Skeleton className="h-3.5 w-3/5" />
      </div>
      <Skeleton className="hidden h-3.5 w-20 shrink-0 md:block" />
      <Skeleton className="hidden h-3.5 w-16 shrink-0 lg:block" />
      <Skeleton className="hidden h-3.5 w-24 shrink-0 lg:block" />
      <Skeleton className="h-5 w-16 shrink-0 rounded-chip" />
    </div>
  )
}

/** Title/badges + body + tags row — mirrors the Alerts campaign row. */
export function CampaignRowSkeleton(): ReactElement {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border bg-card p-4">
      <div className="flex items-center gap-2">
        <Skeleton className="h-4 w-2/5" />
        <Skeleton className="h-5 w-16 rounded-chip" />
      </div>
      <Skeleton className="h-3.5 w-4/5" />
      <div className="flex gap-3">
        <Skeleton className="h-3.5 w-20" />
        <Skeleton className="h-3.5 w-24" />
      </div>
    </div>
  )
}

/** Image + date badge + title/meta row — mirrors the Events list row. */
export function EventRowSkeleton(): ReactElement {
  return (
    <div className="flex flex-col items-stretch gap-4 rounded-2xl border bg-card p-4 md:flex-row">
      <Skeleton className="h-[110px] w-full shrink-0 rounded-xl md:w-[180px]" />
      <div className="flex flex-1 gap-4">
        <Skeleton className="h-16 w-14 shrink-0 rounded-xl" />
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <Skeleton className="h-4 w-2/5" />
          <Skeleton className="h-3.5 w-1/3" />
          <Skeleton className="h-3.5 w-3/5" />
        </div>
      </div>
    </div>
  )
}
