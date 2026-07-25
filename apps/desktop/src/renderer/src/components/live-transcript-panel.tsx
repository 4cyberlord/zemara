/**
 * LiveTranscriptPanel — pewbeam-style live mic transcript for the Bible Verse
 * tab. Streams the raw caption lines (partials highlighted as "hearing…",
 * settled lines normal), pulses the mic dot as audio frames arrive, and
 * offers a one-tap "Start listening" when the caption pipeline is asleep, so
 * the operator never has to leave the tab to wake the mic.
 */

import { Microphone, MicrophoneSlash, WarningCircle } from '@phosphor-icons/react'
import { useEffect, useRef, useState, type ReactElement } from 'react'

import { useAdminBackendContext } from '@/components/admin-backend-provider'
import { Button } from '@/components/ui/button'
import { useStudioCore } from '@/hooks/use-studio'
import { captionLineIdentity, captionsStatusIsActive } from '@/lib/captions-ui'
import { cn } from '@/lib/utils'

/** Keep the tail of the stream visible; older lines scroll away. */
const VISIBLE_LINES = 40

export function LiveTranscriptPanel(): ReactElement {
  const { captionLines, captionsStatus, captionsCommandPending, captureConfig, setCaptureConfig } =
    useStudioCore()
  const { isLiveDetectionEnabled, setLiveDetectionEnabled } = useAdminBackendContext()

  const captionsEnabled = captureConfig.captions.enabled
  const statusActive = captionsStatusIsActive(captionsStatus)
  const listening = captionsEnabled && statusActive

  // Honest failure surface: captions enabled but the backend stayed idle (the
  // start attempt failed — e.g. sign-in required) must not spin "Waking…"
  // forever. A short debounce hides the normal start transient.
  const enabledButIdle =
    captionsEnabled && captionsStatus.state === 'idle' && !captionsCommandPending
  const [startStalled, setStartStalled] = useState(false)
  useEffect(() => {
    if (!enabledButIdle) {
      setStartStalled(false)
      return
    }
    const timer = setTimeout(() => setStartStalled(true), 1500)
    return () => clearTimeout(timer)
  }, [enabledButIdle])

  // Retrying flips the persisted consent off and back on — the scope change
  // resets the studio's attempt guard, so the intent effect tries once more.
  const retryStart = (): void => {
    setCaptureConfig((current) => ({
      ...current,
      captions: { ...current.captions, enabled: false }
    }))
    setTimeout(() => {
      setCaptureConfig((current) => ({
        ...current,
        captions: { ...current.captions, enabled: true }
      }))
    }, 300)
  }

  // Mic-awake pulse: the backend counts audio frames as they arrive — any
  // change means the microphone is really picking sound up right now.
  const framesSeen = captionsStatus.audioFramesSeen ?? 0
  const [hearing, setHearing] = useState(false)
  const prevFramesRef = useRef(framesSeen)
  useEffect(() => {
    if (framesSeen === prevFramesRef.current) return
    prevFramesRef.current = framesSeen
    setHearing(true)
    const timer = setTimeout(() => setHearing(false), 900)
    return () => clearTimeout(timer)
  }, [framesSeen])

  // Auto-scroll to the newest line.
  const scrollRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [captionLines])

  const startListening = (): void => {
    setLiveDetectionEnabled(true)
    if (!captionsEnabled) {
      setCaptureConfig((current) => ({
        ...current,
        captions: { ...current.captions, enabled: true }
      }))
    }
  }

  const statusLabel = !captionsEnabled
    ? 'Mic asleep'
    : captionsStatus.state === 'error' || captionsStatus.state === 'blocked'
      ? 'Mic error'
      : startStalled
        ? "Mic didn't start"
        : listening
          ? hearing
            ? 'Hearing you…'
            : 'Listening'
          : 'Waking the mic…'

  const lines = captionLines.slice(-VISIBLE_LINES)
  const lastLine = lines[lines.length - 1]

  return (
    <div className="flex flex-col border-b border-border">
      <div className="flex items-center gap-2 px-3 pt-2.5 pb-1.5">
        <span className="relative flex size-2 shrink-0">
          {listening ? (
            <span
              className={cn(
                'absolute inline-flex size-full animate-ping rounded-full opacity-60',
                hearing ? 'bg-emerald-400' : 'bg-sky-400'
              )}
            />
          ) : null}
          <span
            className={cn(
              'relative inline-flex size-2 rounded-full',
              !captionsEnabled
                ? 'bg-muted-foreground/40'
                : captionsStatus.state === 'error' ||
                    captionsStatus.state === 'blocked' ||
                    startStalled
                  ? 'bg-red-400'
                  : hearing
                    ? 'bg-emerald-400'
                    : listening
                      ? 'bg-sky-400'
                      : 'bg-amber-400'
            )}
          />
        </span>
        <span className="text-[0.625rem] font-medium uppercase tracking-wider text-muted-foreground">
          Live transcript
        </span>
        <span
          className={cn(
            'text-[0.625rem] font-medium',
            hearing
              ? 'text-emerald-400'
              : listening
                ? 'text-sky-400'
                : captionsStatus.state === 'error' ||
                    captionsStatus.state === 'blocked' ||
                    startStalled
                  ? 'text-red-400'
                  : 'text-muted-foreground/70'
          )}
        >
          {statusLabel}
        </span>
        {isLiveDetectionEnabled ? (
          <Microphone weight="fill" className="ml-auto size-3.5 shrink-0 text-primary" />
        ) : (
          <MicrophoneSlash className="ml-auto size-3.5 shrink-0 text-muted-foreground/50" />
        )}
      </div>

      <div ref={scrollRef} className="h-24 overflow-y-auto px-3 pb-2.5">
        {!captionsEnabled ? (
          <div className="flex h-full flex-col items-center justify-center gap-1.5 text-center">
            <p className="text-xs text-muted-foreground">
              Turn on Live mic to hear your sermon and catch citations as you speak.
            </p>
            <Button
              size="sm"
              variant="outline"
              disabled={captionsCommandPending}
              onClick={startListening}
            >
              <Microphone className="size-3.5" />
              Start listening
            </Button>
          </div>
        ) : captionsStatus.state === 'error' || captionsStatus.state === 'blocked' ? (
          <div className="flex h-full flex-col items-center justify-center gap-1 text-center">
            <WarningCircle weight="fill" className="size-4 text-red-400" />
            <p className="text-xs text-muted-foreground">
              {captionsStatus.message ?? 'The caption service could not start.'}
            </p>
            <p className="text-[0.625rem] text-muted-foreground/60">
              Check your AI transcription settings, then toggle Live mic again.
            </p>
          </div>
        ) : startStalled ? (
          <div className="flex h-full flex-col items-center justify-center gap-1.5 text-center">
            <WarningCircle weight="fill" className="size-4 text-red-400" />
            <p className="text-xs text-muted-foreground">
              The mic didn&rsquo;t start. The on-device speech engine in Settings → Bible Verse
              works with no account — check the engine setting, then try again.
            </p>
            <Button
              size="sm"
              variant="outline"
              disabled={captionsCommandPending}
              onClick={retryStart}
            >
              Try again
            </Button>
          </div>
        ) : lines.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-xs text-muted-foreground/70">
              {listening
                ? 'Listening… say a reference like "John chapter 3 verse 16".'
                : 'Waking the mic…'}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            {lines.map((line) => {
              const isPartial = line.kind === 'partial' && line === lastLine
              return (
                <p
                  key={captionLineIdentity(line)}
                  className={cn(
                    'text-xs leading-relaxed transition-colors',
                    isPartial ? 'text-foreground' : 'text-muted-foreground'
                  )}
                >
                  {isPartial ? (
                    <span className="mr-1.5 inline-block size-1.5 animate-pulse rounded-full bg-emerald-400 align-middle" />
                  ) : null}
                  {line.text}
                  {isPartial ? <span className="text-muted-foreground/60"> …</span> : null}
                </p>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
