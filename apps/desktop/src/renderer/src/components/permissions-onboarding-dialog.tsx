import { ArrowRight, CircleNotch } from '@phosphor-icons/react'
import { useEffect, useState, type ReactElement } from 'react'

import logoUrl from '@/assets/zemara-logo.png'
import { StatusBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { useStudioAudio, useStudioCore } from '@/hooks/use-studio'
import type { MediaAccessStatus } from '@/lib/backend'
import { isWindowsPlatform, osSettingsName } from '@/lib/platform'
import {
  mediaAccessToState,
  systemAccessAction,
  systemAccessRows,
  type SystemAccessAction,
  type SystemAccessRow
} from '@/lib/system-access'

// Permissions onboarding: the ONE thing a fresh install needs is macOS
// grants, so this is the whole flow — three rows sharing the exact state
// derivation Settings' System access section uses (system-access.ts, never
// guessed), with the grant action each permission actually supports. As a
// first-run gate it renders as the whole window (GateSurface); from Settings
// it renders inside a Dialog over the app.
//
// Gate mode (`screenAccess` set): the backend is intentionally NOT running
// yet (no device access may prompt before this screen), so the screen row
// comes from Electron's own TCC preflight and every Enable/Open button talks
// to main-process IPC directly instead of the backend orchestration.
export function PermissionsOnboardingPanel({
  onComplete,
  titleId,
  screenAccess
}: {
  onComplete: () => void
  titleId?: string
  screenAccess?: { status: MediaAccessStatus; refresh: () => Promise<void> }
}): ReactElement {
  const {
    deviceList,
    refreshBackend,
    handleSystemPermission,
    openSystemPermissionSettings,
    runtimeInfo,
    mediaAccess,
    refreshMediaAccess
  } = useStudioCore()
  const { audioMeter } = useStudioAudio()
  const [pending, setPending] = useState<SystemAccessRow['id'] | null>(null)
  const gateMode = screenAccess !== undefined

  // Grants flip in System Settings or the native prompt at any moment — often
  // while this window isn't focused (macOS keeps the Settings pane in front).
  // Re-enumerate on focus AND on a gentle poll so a fresh grant turns its row
  // green immediately, without the user having to click back into the app.
  useEffect(() => {
    const refresh = (): void => {
      if (!gateMode) {
        void refreshBackend()
      }
      void refreshMediaAccess()
      void screenAccess?.refresh()
    }
    window.addEventListener('focus', refresh)
    const timer = window.setInterval(refresh, 2500)
    return () => {
      window.removeEventListener('focus', refresh)
      window.clearInterval(timer)
    }
  }, [gateMode, refreshBackend, refreshMediaAccess, screenAccess])

  const rows = systemAccessRows({
    deviceList,
    audioMeter,
    platform: runtimeInfo?.platform,
    mediaAccess
  }).map((row) => {
    if (!gateMode) {
      return row
    }
    // Gate mode: the backend is down by design, so device-health refinement
    // is impossible — the exact TCC decision IS the row state (a grant shows
    // Granted the moment macOS records it, never a phantom "device issue").
    if (row.id === 'camera' || row.id === 'microphone') {
      const status = mediaAccess?.[row.id]
      return {
        ...row,
        state: mediaAccessToState(status),
        detail:
          status === 'not-determined'
            ? 'macOS asks the moment you click Enable.'
            : status === 'granted'
              ? 'Permission granted.'
              : row.detail
      }
    }
    return {
      ...row,
      state: mediaAccessToState(screenAccess.status),
      detail:
        screenAccess.status === 'not-determined'
          ? 'macOS asks the moment you click Enable.'
          : row.detail
    }
  })
  const allPermissionsResolved = rows.every(
    (row) => row.state === 'granted' || row.state === 'device-issue'
  )
  const isWindows = isWindowsPlatform(runtimeInfo?.platform)
  const deviceNoun = isWindows ? 'PC' : 'Mac'
  const settingsName = osSettingsName(runtimeInfo?.platform)

  const rowAction = (row: SystemAccessRow): SystemAccessAction => {
    if (gateMode && row.id === 'screen-recording' && row.state === 'first-use') {
      // The permissions screen owns the screen-capture ask: Enable triggers
      // the macOS prompt on demand (it never fires at app boot anymore).
      return 'request-media-access'
    }
    return systemAccessAction({
      pane: row.id,
      state: row.state,
      platform: runtimeInfo?.platform,
      mediaAccessStatus:
        row.id === 'camera' || row.id === 'microphone' ? mediaAccess?.[row.id] : undefined
    })
  }

  const runPermissionAction = async (pane: SystemAccessRow['id']): Promise<void> => {
    setPending(pane)
    try {
      if (gateMode) {
        if (pane === 'screen-recording') {
          const status = await window.videorc.requestScreenAccess()
          if (status !== 'granted') {
            await openSystemPermissionSettings(pane)
          }
          await screenAccess.refresh()
        } else if (pane === 'camera' || pane === 'microphone') {
          const status = mediaAccess?.[pane]
          if (status === 'denied' || status === 'restricted') {
            await openSystemPermissionSettings(pane)
          } else {
            await window.videorc.requestMediaAccess(pane)
          }
          await refreshMediaAccess()
        }
      } else {
        await handleSystemPermission(pane)
      }
    } finally {
      setPending(null)
    }
  }

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col gap-4">
      <div className="flex items-center gap-3">
        <img alt="Zemara" className="size-14 object-contain" src={logoUrl} />
        <div className="flex flex-col gap-1">
          <h2 className="text-base font-semibold text-foreground" id={titleId}>
            Let Zemara capture your {deviceNoun}
          </h2>
          <p className="text-sm text-muted-foreground">
            {isWindows
              ? `Turn on camera and microphone access in ${settingsName}. You can change any of this later in Settings.`
              : 'macOS asks once per permission. Grant what you need — you can change any of this later in Settings.'}
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-1">
        {rows.map((row) => (
          <PermissionRow
            key={row.id}
            action={rowAction(row)}
            pending={pending === row.id}
            row={row}
            onAction={() => void runPermissionAction(row.id)}
          />
        ))}
      </div>

      {isWindows ? (
        <p className="text-xs text-muted-foreground">
          Zemara runs as a desktop app, so it won’t appear by name in {settingsName}. In each
          privacy page, turn on the main access toggle and “Let desktop apps access your camera /
          microphone.”
        </p>
      ) : null}

      <div className="mt-auto flex items-center justify-between gap-3">
        <span className="text-xs text-muted-foreground">
          Recordings stay on this {deviceNoun}. Cloud AI only runs after you opt in.
        </span>
        <Button onClick={onComplete}>
          {allPermissionsResolved ? 'Continue' : 'Continue without granting'}
          <ArrowRight data-icon="inline-end" />
        </Button>
      </div>
    </div>
  )
}

export function PermissionsOnboardingDialog({
  open,
  onComplete
}: {
  open: boolean
  onComplete: () => void
}): ReactElement {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onComplete()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="sr-only">Permissions setup</DialogTitle>
          <DialogDescription className="sr-only">
            Grant the permissions Zemara needs to capture your screen, camera, and microphone.
          </DialogDescription>
        </DialogHeader>
        <PermissionsOnboardingPanel onComplete={onComplete} />
        <DialogFooter className="sr-only" />
      </DialogContent>
    </Dialog>
  )
}

function PermissionRow({
  row,
  action,
  pending,
  onAction
}: {
  row: SystemAccessRow
  action: SystemAccessAction
  pending: boolean
  onAction: () => void
}): ReactElement {
  const actionButton =
    action === 'request-media-access' ? (
      <Button disabled={pending} size="xs" variant="outline" onClick={onAction}>
        {pending ? <CircleNotch className="animate-spin" data-icon="inline-start" /> : null}
        Enable
      </Button>
    ) : action === 'open-settings' ? (
      <Button disabled={pending} size="xs" variant="outline" onClick={onAction}>
        Open settings
      </Button>
    ) : null

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-row border bg-muted/30 px-3 py-2.5 text-sm">
      <span className="w-36 shrink-0 font-medium">{row.label}</span>
      <StatusBadge
        tone={
          row.state === 'granted'
            ? 'good'
            : row.state === 'not-granted' || row.state === 'device-issue'
              ? 'warn'
              : 'neutral'
        }
        value={
          row.state === 'granted'
            ? 'Granted'
            : row.state === 'not-granted'
              ? 'Not granted'
              : row.state === 'device-issue'
                ? 'Device issue'
                : 'Checked on first use'
        }
      />
      <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground" title={row.detail}>
        {row.purpose}
      </span>
      {actionButton}
    </div>
  )
}
