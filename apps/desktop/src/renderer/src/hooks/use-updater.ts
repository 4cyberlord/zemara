import { useCallback, useEffect, useState } from 'react'

import type { UpdateStatus } from '@/lib/backend'

export interface UseUpdater {
  status: UpdateStatus
  /** Check the feed; if an update is available, downloading starts automatically. */
  check: () => void
  /** Manually (re)start the download — rarely needed since `check` auto-downloads. */
  download: () => void
  /** Quit, install, and relaunch. Callers must block this while a capture is live. */
  install: () => void
}

// Renderer-side view of the main-process update state machine (src/main/updater.ts).
// Seeds from the cached status and subscribes to live transitions.
export function useUpdater(): UseUpdater {
  const [status, setStatus] = useState<UpdateStatus>({ phase: 'idle' })

  useEffect(() => {
    let active = true

    void window.videorc?.getUpdateStatus?.().then((initial) => {
      if (active && initial) {
        setStatus(initial)
      }
    })

    const unsubscribe = window.videorc?.onUpdateStatus?.((next) => setStatus(next))
    return () => {
      active = false
      unsubscribe?.()
    }
  }, [])

  const check = useCallback(() => {
    void window.videorc?.checkForUpdates?.().then((next) => {
      if (next) {
        setStatus(next)
      }
    })
  }, [])

  const download = useCallback(() => {
    void window.videorc?.downloadUpdate?.().then((next) => {
      if (next) {
        setStatus(next)
      }
    })
  }, [])

  const install = useCallback(() => {
    void window.videorc?.installUpdate?.()
  }, [])

  return { status, check, download, install }
}
