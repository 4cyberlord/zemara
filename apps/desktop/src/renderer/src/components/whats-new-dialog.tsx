import type { ReactElement } from 'react'

import logoUrl from '@/assets/zemara-logo.png'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { openVideorcWebLink, releaseNotesUrl } from '@/lib/videorc-web-links'
import { formatChangelogVersion, type ChangelogEntry } from '@/lib/whats-new'

// The changelog highlights body, shared by the first-run welcome gate (as the
// whole window content, Apple-first-run style) and the post-update overlay
// dialog for existing users.
export function WhatsNewPanel({
  entry,
  onClose
}: {
  entry: ChangelogEntry
  onClose: () => void
}): ReactElement {
  return (
    <div className="flex min-h-0 w-full flex-1 flex-col gap-4">
      <div className="flex items-start gap-3">
        <img alt="" className="size-10 shrink-0 rounded-xl" src={logoUrl} />
        <div className="flex flex-col gap-1.5">
          <h2 className="text-base font-semibold text-foreground" id="zemara-welcome-title">
            Welcome to Zemara {formatChangelogVersion(entry.version)}
          </h2>
          <p className="text-sm text-muted-foreground">{entry.summary}</p>
        </div>
      </div>
      <ul className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto">
        {entry.highlights.map((highlight) => (
          <li key={highlight} className="flex gap-2.5 text-sm text-muted-foreground">
            <span aria-hidden="true" className="mt-2 size-1 shrink-0 rounded-full bg-foreground" />
            <span>{highlight}</span>
          </li>
        ))}
      </ul>
      <div className="mt-auto flex items-center justify-between gap-2">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => openVideorcWebLink(releaseNotesUrl(entry.version))}
        >
          Full release notes
        </Button>
        <Button size="sm" onClick={onClose}>
          Continue
        </Button>
      </div>
    </div>
  )
}

// Post-update changelog highlights. Chrome stays monochrome per the design
// language — the glass Dialog primitive carries the styling.
export function WhatsNewDialog({
  entry,
  open,
  onClose
}: {
  entry: ChangelogEntry | null
  open: boolean
  onClose: () => void
}): ReactElement | null {
  if (!entry) {
    return null
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          onClose()
        }
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            What&apos;s new in Zemara {formatChangelogVersion(entry.version)}
          </DialogTitle>
          <DialogDescription>{entry.summary}</DialogDescription>
        </DialogHeader>
        <ul className="flex flex-col gap-2.5">
          {entry.highlights.map((highlight) => (
            <li key={highlight} className="flex gap-2.5 text-sm text-muted-foreground">
              <span
                aria-hidden="true"
                className="mt-2 size-1 shrink-0 rounded-full bg-foreground"
              />
              <span>{highlight}</span>
            </li>
          ))}
        </ul>
        <DialogFooter>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => openVideorcWebLink(releaseNotesUrl(entry.version))}
          >
            Full release notes
          </Button>
          <Button size="sm" onClick={onClose}>
            Continue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
