import type { UpdateStatus } from '@/lib/backend'

// Installing a downloaded update quits and relaunches Zemara, so it must never
// fire while a capture is live — never interrupt a recording. An update is
// installable only once it is fully downloaded AND nothing is recording or
// streaming.
export function isUpdateInstallable(status: UpdateStatus, captureActive: boolean): boolean {
  return status.phase === 'downloaded' && !captureActive
}

/**
 * Sidebar update chip content (post-0.9.4 fix batch F6): the chip renders
 * ONLY when an update is genuinely in flight or ready — never for idle,
 * up-to-date, error, or dev builds (those states live in Settings → About).
 * `install` becomes a jump to Settings while a capture is live (installing
 * quits the app).
 */
export function updateChip(
  status: UpdateStatus,
  captureActive: boolean
): { label: string; action: 'install' | 'settings' } | null {
  switch (status.phase) {
    case 'available':
      return { label: `Update ${status.version} available`, action: 'settings' }
    case 'downloading':
      return {
        label: `Downloading update… ${Math.round(status.percent)}%`,
        action: 'settings'
      }
    case 'downloaded':
      return {
        label: `Restart to update to ${status.version}`,
        action: captureActive ? 'settings' : 'install'
      }
    default:
      return null
  }
}
