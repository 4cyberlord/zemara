import { ArrowClockwise, Broadcast, WarningCircle } from '@phosphor-icons/react'
import { useEffect, useMemo, type ReactElement } from 'react'
import { toast } from 'sonner'

import { useAdminBackendContext } from '@/components/admin-backend-provider'
import { AppSelect } from '@/components/ui/app-select'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import type { NdiAlphaMode, NdiFrameRate, NdiResolution } from '@/lib/backend'

/**
 * NDI broadcast settings — streams the verse output as a native NDI source
 * (the pewbeam OBS workflow: Add Source → NDI Source → MACHINE (name)), with
 * two deliberate improvements over pewbeam: the config persists across
 * launches (theirs resets), and SDK/session failures are surfaced here
 * instead of being silent-caught.
 */
export function NdiBroadcastDialog({
  open,
  onClose
}: {
  open: boolean
  onClose: () => void
}): ReactElement {
  const {
    ndiConfig,
    setNdiConfig,
    ndiStatus,
    ndiError,
    ndiBusy,
    ndiStart,
    ndiStop,
    ndiRefreshStatus
  } = useAdminBackendContext()

  const active = ndiStatus?.active === true

  // Config edits apply on the next start; while broadcasting, offer an
  // explicit restart instead of churning the session on every keystroke.
  const dirty =
    active &&
    ndiStatus !== null &&
    (ndiStatus.sourceName !== ndiConfig.sourceName ||
      ndiStatus.width !== resolutionWidth(ndiConfig.resolution) ||
      ndiStatus.fps !== frameRateFps(ndiConfig.frameRate))

  useEffect(() => {
    if (open) void ndiRefreshStatus()
  }, [open, ndiRefreshStatus])

  const toggle = async (enabled: boolean): Promise<void> => {
    try {
      if (enabled) {
        await ndiStart()
        toast.success('NDI broadcast started', {
          description: `In OBS: Add Source → NDI Source → “${ndiConfig.sourceName}”`
        })
      } else {
        await ndiStop()
        toast.info('NDI broadcast stopped')
      }
    } catch (error) {
      toast.error('NDI broadcast failed', {
        description: error instanceof Error ? error.message : String(error)
      })
    }
  }

  const restart = async (): Promise<void> => {
    try {
      await ndiStop()
      await ndiStart()
      toast.success('NDI broadcast restarted with the new settings')
    } catch (error) {
      toast.error('NDI restart failed', {
        description: error instanceof Error ? error.message : String(error)
      })
    }
  }

  const statusLine = useMemo(() => {
    if (!ndiStatus) return 'Checking NDI status…'
    if (ndiStatus.active) {
      return `Broadcasting as “${ndiStatus.sourceName ?? ''}” · ${ndiStatus.width}×${ndiStatus.height} @ ${ndiStatus.fps} fps · ${ndiStatus.frameCount.toLocaleString()} frames sent`
    }
    return 'Off — enable the broadcast to appear as an NDI source in OBS.'
  }, [ndiStatus])

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? undefined : onClose())}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Broadcast className="size-4 text-primary" />
            NDI Broadcast
          </DialogTitle>
          <DialogDescription>
            Streams the verse output as a native NDI source on your network. In OBS: Add Source →
            NDI Source → this machine&rsquo;s source name.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-md border border-border bg-muted/30 px-3 py-2.5">
            <Label htmlFor="ndi-enable" className="flex flex-col gap-0.5">
              <span className="text-xs font-medium text-foreground">Broadcast</span>
              <span className="text-[0.625rem] font-normal text-muted-foreground">
                {active ? 'Live on the network' : 'Off'}
              </span>
            </Label>
            <div className="flex items-center gap-2">
              {ndiBusy ? (
                <ArrowClockwise className="size-3.5 animate-spin text-muted-foreground" />
              ) : null}
              <Switch
                id="ndi-enable"
                checked={active}
                disabled={ndiBusy}
                onCheckedChange={(enabled) => void toggle(enabled)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ndi-source-name" className="text-xs text-muted-foreground">
              Source name
            </Label>
            <Input
              id="ndi-source-name"
              value={ndiConfig.sourceName}
              maxLength={128}
              onChange={(event) =>
                setNdiConfig((current) => ({ ...current, sourceName: event.target.value }))
              }
              placeholder="Zemara Bible Verse"
            />
            <p className="text-[0.625rem] text-muted-foreground/80">
              Appears in OBS as “{ndiConfig.sourceName || 'Zemara Bible Verse'}” on this machine.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Resolution</Label>
              <AppSelect
                value={ndiConfig.resolution}
                onValueChange={(value) =>
                  setNdiConfig((current) => ({
                    ...current,
                    resolution: value as NdiResolution
                  }))
                }
                options={[
                  { value: 'r1080p', label: '1080p · 1920×1080' },
                  { value: 'r720p', label: '720p · 1280×720' },
                  { value: 'r4k', label: '4K · 3840×2160' }
                ]}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Frame rate</Label>
              <AppSelect
                value={ndiConfig.frameRate}
                onValueChange={(value) =>
                  setNdiConfig((current) => ({ ...current, frameRate: value as NdiFrameRate }))
                }
                options={[
                  { value: 'fps30', label: '30 fps' },
                  { value: 'fps24', label: '24 fps' },
                  { value: 'fps60', label: '60 fps' }
                ]}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Alpha mode</Label>
            <AppSelect
              value={ndiConfig.alphaMode}
              onValueChange={(value) =>
                setNdiConfig((current) => ({ ...current, alphaMode: value as NdiAlphaMode }))
              }
              options={[
                {
                  value: 'straightAlpha',
                  label: 'Straight alpha — transparent lower-third surround'
                },
                { value: 'noneOpaque', label: 'None — opaque background' }
              ]}
            />
            <p className="text-[0.625rem] text-muted-foreground/80">
              Straight alpha lets OBS overlay a lower-third without color-keying; the surround stays
              transparent. Use None for fullscreen backgrounds.
            </p>
          </div>

          {dirty ? (
            <div className="flex items-center justify-between rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2">
              <span className="text-[0.6875rem] text-amber-200">
                Settings changed — restart to apply.
              </span>
              <Button size="sm" variant="outline" disabled={ndiBusy} onClick={() => void restart()}>
                Restart
              </Button>
            </div>
          ) : null}

          {ndiStatus?.unavailableReason ? (
            <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2">
              <WarningCircle className="mt-0.5 size-3.5 shrink-0 text-destructive" />
              <span className="text-[0.6875rem] leading-snug text-destructive">
                NDI SDK unavailable: {ndiStatus.unavailableReason}
              </span>
            </div>
          ) : null}
          {ndiError ? (
            <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2">
              <WarningCircle className="mt-0.5 size-3.5 shrink-0 text-destructive" />
              <span className="text-[0.6875rem] leading-snug text-destructive">{ndiError}</span>
            </div>
          ) : null}

          <p className="border-t border-border pt-3 text-[0.6875rem] leading-snug text-muted-foreground">
            {statusLine}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function resolutionWidth(resolution: NdiResolution): number {
  return resolution === 'r720p' ? 1280 : resolution === 'r4k' ? 3840 : 1920
}

function frameRateFps(frameRate: NdiFrameRate): number {
  return frameRate === 'fps24' ? 24 : frameRate === 'fps60' ? 60 : 30
}
