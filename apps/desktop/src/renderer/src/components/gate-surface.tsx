import type { ReactElement, ReactNode } from 'react'

import logoUrl from '@/assets/zemara-logo.png'

// First-run gate surface: while a first-run gate (terms, welcome, permissions)
// is up, this IS the whole window — laid out like a native macOS installer
// pane (header at the top, body filling the middle, actions pinned to the
// bottom), never a small card floating in dead space, and never the real app
// behind a dimmed overlay. The shell keeps the window small
// (GATE_WINDOW_SIZE) and only mounts the workspace after every gate has
// completed, so nothing — sidebar, preview, dialogs — can leak into view.
export function GateSurface({
  children,
  labelledBy
}: {
  children: ReactNode
  labelledBy?: string
}): ReactElement {
  return (
    <div
      aria-labelledby={labelledBy}
      className="flex min-h-screen flex-col bg-background text-foreground"
      role="dialog"
    >
      <div className="flex items-center gap-2 px-6 pt-12 pb-2 text-xs text-muted-foreground">
        <img alt="" className="size-4 rounded-md" src={logoUrl} />
        <span>Zemara</span>
      </div>
      <div className="flex min-h-0 flex-1 flex-col px-6 pt-4 pb-6">{children}</div>
    </div>
  )
}
