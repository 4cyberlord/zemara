import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'

import {
  fetchChangelogEntries,
  resolveWhatsNewAction,
  WHATS_NEW_STORAGE_KEY,
  type ChangelogEntry
} from '@/lib/whats-new'

// Post-update "What's new": when the app version changed since the last seen
// one, fetch the changelog entries published in between and surface the newest
// in a dialog. First run initializes silently; a failed fetch retries on the
// next launch (last-seen is only advanced on a good answer or dismissal).
export function useWhatsNew(version: string | undefined): {
  entry: ChangelogEntry | null
  open: boolean
  dismiss: () => void
  showLatest: () => Promise<void>
} {
  const [entry, setEntry] = useState<ChangelogEntry | null>(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const action = resolveWhatsNewAction({
      version,
      lastSeen: localStorage.getItem(WHATS_NEW_STORAGE_KEY)
    })
    if (action === 'idle' || !version) {
      return
    }
    if (action === 'initialize') {
      localStorage.setItem(WHATS_NEW_STORAGE_KEY, version)
      return
    }

    let cancelled = false
    void fetchChangelogEntries({
      since: localStorage.getItem(WHATS_NEW_STORAGE_KEY) ?? undefined
    }).then((entries) => {
      if (cancelled || entries === null) {
        return
      }
      if (entries.length === 0) {
        localStorage.setItem(WHATS_NEW_STORAGE_KEY, version)
        return
      }
      setEntry(entries[0])
      setOpen(true)
    })
    return () => {
      cancelled = true
    }
  }, [version])

  const dismiss = useCallback(() => {
    if (version) {
      localStorage.setItem(WHATS_NEW_STORAGE_KEY, version)
    }
    setOpen(false)
  }, [version])

  // Manual entry point (Settings → About & updates, and the fresh-install
  // welcome shown right after the terms gate): always shows the latest
  // release, independent of the last-seen gate. Returns a promise so a
  // first-run gate can know when to stop waiting, whether or not anything
  // was actually available to show.
  const showLatest = useCallback(async () => {
    const entries = await fetchChangelogEntries()
    if (entries === null || entries.length === 0) {
      toast.info('Release notes are not available right now.')
      return
    }
    setEntry(entries[0])
    setOpen(true)
  }, [])

  return { entry, open, dismiss, showLatest }
}
