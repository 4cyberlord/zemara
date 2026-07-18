import { Pause, Play, SpeakerHigh, SpeakerX } from '@phosphor-icons/react'
import { useEffect, useRef, useState, type ReactElement } from 'react'

import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Slider } from '@/components/ui/slider'
import { cn } from '@/lib/utils'

/** Playback state pushed up from the loopback bridge page (see main process
 *  `youtubeBridgeHtml`) — kept in sync with the fields it actually posts. */
interface YoutubeBridgeStateMessage {
  source: 'videorc-youtube-bridge'
  type: 'state'
  playing?: boolean
  muted?: boolean
  volume?: number
  currentTime?: number
  duration?: number
}

function isYoutubeBridgeStateMessage(data: unknown): data is YoutubeBridgeStateMessage {
  return (
    typeof data === 'object' &&
    data !== null &&
    (data as { source?: unknown }).source === 'videorc-youtube-bridge' &&
    (data as { type?: unknown }).type === 'state'
  )
}

function extractYouTubeId(url: string): string | null {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }
  const host = parsed.hostname.replace(/^www\.|^m\./, '')
  if (host === 'youtu.be') {
    return parsed.pathname.slice(1) || null
  }
  if (host === 'youtube.com' || host === 'music.youtube.com') {
    if (parsed.pathname === '/watch') return parsed.searchParams.get('v')
    if (parsed.pathname.startsWith('/embed/')) return parsed.pathname.slice('/embed/'.length) || null
    if (parsed.pathname.startsWith('/shorts/')) return parsed.pathname.slice('/shorts/'.length) || null
  }
  return null
}

function formatTime(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return '0:00'
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = Math.floor(totalSeconds % 60)
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

type PlaybackState = {
  playing: boolean
  muted: boolean
  volume: number // 0-1
  currentTime: number
  duration: number
}

const INITIAL_STATE: PlaybackState = {
  playing: false,
  muted: false,
  volume: 1,
  currentTime: 0,
  duration: 0
}

type PlayerControls = {
  togglePlay: () => void
  toggleMute: () => void
  setVolume: (volume: number) => void
  seekTo: (seconds: number) => void
}

/** Drives a plain HTML5 <video> element for direct/external file sources.
 *  `authoritativeDurationSeconds` — the duration the admin backend already
 *  fetched from the YouTube Data API and stored on the video/sermon record
 *  — wins over whatever the live element reports, when present. Some
 *  sources briefly report a stale/incorrect `duration` before their real
 *  metadata is fully loaded; trusting our own stored value keeps the
 *  displayed total accurate from the first frame instead of chasing it. */
function useFilePlayer(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  authoritativeDurationSeconds: number | null
): {
  state: PlaybackState
  controls: PlayerControls
} {
  const [state, setState] = useState<PlaybackState>({
    ...INITIAL_STATE,
    duration: authoritativeDurationSeconds ?? 0
  })

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    const sync = (): void => {
      setState({
        playing: !video.paused && !video.ended,
        muted: video.muted,
        volume: video.volume,
        currentTime: video.currentTime,
        duration:
          authoritativeDurationSeconds ?? (Number.isFinite(video.duration) ? video.duration : 0)
      })
    }
    sync()
    video.addEventListener('play', sync)
    video.addEventListener('pause', sync)
    video.addEventListener('volumechange', sync)
    video.addEventListener('timeupdate', sync)
    video.addEventListener('loadedmetadata', sync)
    video.addEventListener('ended', sync)
    return () => {
      video.removeEventListener('play', sync)
      video.removeEventListener('pause', sync)
      video.removeEventListener('volumechange', sync)
      video.removeEventListener('timeupdate', sync)
      video.removeEventListener('loadedmetadata', sync)
      video.removeEventListener('ended', sync)
    }
  }, [videoRef, authoritativeDurationSeconds])

  const controls: PlayerControls = {
    togglePlay: () => {
      const video = videoRef.current
      if (!video) return
      if (video.paused) void video.play()
      else video.pause()
    },
    toggleMute: () => {
      const video = videoRef.current
      if (video) video.muted = !video.muted
    },
    setVolume: (volume) => {
      const video = videoRef.current
      if (!video) return
      video.volume = volume
      video.muted = volume === 0
    },
    seekTo: (seconds) => {
      const video = videoRef.current
      if (video) video.currentTime = seconds
    }
  }

  return { state, controls }
}

/**
 * Drives YouTube playback via a loopback-only bridge page (main process,
 * `youtube-bridge:get-embed-url`) embedded in an <iframe>, instead of
 * running the YouTube IFrame Player API directly in this document.
 *
 * Why: the IFrame API computes its origin handshake from document.location.
 * The packaged app's document is file://, an opaque origin with no host —
 * YouTube rejects that outright with an undocumented "Error 153 /
 * configuration error", regardless of what origin value is passed in
 * playerVars (confirmed: overriding it doesn't help, since the mismatch is
 * with the actual request's Referer/Origin headers, not the JS parameter).
 * The bridge page runs on a real http://127.0.0.1 origin instead, where the
 * handshake succeeds normally, and relays commands/state to this document
 * over postMessage.
 */
function useYouTubePlayer(
  iframeRef: React.RefObject<HTMLIFrameElement | null>,
  videoId: string,
  authoritativeDurationSeconds: number | null
): { state: PlaybackState; controls: PlayerControls; embedUrl: string | null } {
  const [state, setState] = useState<PlaybackState>({
    ...INITIAL_STATE,
    duration: authoritativeDurationSeconds ?? 0
  })
  const [embedUrl, setEmbedUrl] = useState<string | null>(null)
  const bridgeOriginRef = useRef<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setEmbedUrl(null)
    bridgeOriginRef.current = null
    void window.videorc?.getYoutubeEmbedUrl(videoId).then((url) => {
      if (cancelled) return
      bridgeOriginRef.current = new URL(url).origin
      setEmbedUrl(url)
    })
    return () => {
      cancelled = true
    }
  }, [videoId])

  useEffect(() => {
    if (!embedUrl) return
    const listener = (event: MessageEvent<unknown>): void => {
      if (event.origin !== bridgeOriginRef.current || !isYoutubeBridgeStateMessage(event.data)) {
        return
      }
      const message = event.data
      setState((current) => ({
        playing: message.playing ?? current.playing,
        muted: message.muted ?? current.muted,
        volume: message.volume ?? current.volume,
        currentTime: message.currentTime ?? current.currentTime,
        duration: authoritativeDurationSeconds ?? message.duration ?? current.duration
      }))
    }
    window.addEventListener('message', listener)
    return () => window.removeEventListener('message', listener)
  }, [embedUrl, authoritativeDurationSeconds])

  const sendCommand = (func: string, args: unknown[] = []): void => {
    const target = iframeRef.current?.contentWindow
    const origin = bridgeOriginRef.current
    if (!target || !origin) return
    target.postMessage({ source: 'videorc-youtube-bridge', type: 'command', func, args }, origin)
  }

  const controls: PlayerControls = {
    togglePlay: () => sendCommand(state.playing ? 'pauseVideo' : 'playVideo'),
    toggleMute: () => sendCommand(state.muted ? 'unMute' : 'mute'),
    setVolume: (volume) => {
      sendCommand('setVolume', [Math.round(volume * 100)])
      sendCommand(volume === 0 ? 'mute' : 'unMute')
    },
    seekTo: (seconds) => sendCommand('seekTo', [seconds, true])
  }

  return { state, controls, embedUrl }
}

/** Glass control bar shared by both player backends. */
function PlayerControls({
  state,
  controls
}: {
  state: PlaybackState
  controls: PlayerControls
}): ReactElement {
  return (
    <div className="absolute inset-x-0 bottom-0 flex flex-col gap-2 rounded-b-panel border-t border-white/10 bg-black/40 px-4 py-3 backdrop-blur-xl">
      <Slider
        className="cursor-pointer"
        max={Math.max(state.duration, 0.01)}
        min={0}
        step={0.1}
        value={[state.currentTime]}
        onValueChange={([value]) => value !== undefined && controls.seekTo(value)}
      />
      <div className="flex items-center gap-3">
        <button
          aria-label={state.playing ? 'Pause' : 'Play'}
          className="flex size-8 shrink-0 items-center justify-center rounded-full border border-white/25 bg-white/15 text-white shadow-md backdrop-blur-md transition-colors hover:bg-white/25"
          type="button"
          onClick={controls.togglePlay}
        >
          {state.playing ? (
            <Pause className="size-4" weight="fill" />
          ) : (
            <Play className="ml-0.5 size-4" weight="fill" />
          )}
        </button>
        <button
          aria-label={state.muted || state.volume === 0 ? 'Unmute' : 'Mute'}
          className="flex size-8 shrink-0 items-center justify-center rounded-full border border-white/25 bg-white/15 text-white shadow-md backdrop-blur-md transition-colors hover:bg-white/25"
          type="button"
          onClick={controls.toggleMute}
        >
          {state.muted || state.volume === 0 ? (
            <SpeakerX className="size-4" weight="fill" />
          ) : (
            <SpeakerHigh className="size-4" weight="fill" />
          )}
        </button>
        <Slider
          className="w-24 cursor-pointer"
          max={1}
          min={0}
          step={0.01}
          value={[state.muted ? 0 : state.volume]}
          onValueChange={([value]) => value !== undefined && controls.setVolume(value)}
        />
        <span className="ml-auto font-mono text-xs text-white/80">
          {formatTime(state.currentTime)} / {formatTime(state.duration)}
        </span>
      </div>
    </div>
  )
}

function YouTubeSurface({
  videoId,
  durationSeconds
}: {
  videoId: string
  durationSeconds: number | null
}): ReactElement {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const { state, controls, embedUrl } = useYouTubePlayer(iframeRef, videoId, durationSeconds)
  return (
    <>
      {embedUrl ? (
        <iframe
          ref={iframeRef}
          allow="autoplay; encrypted-media"
          className="size-full border-0"
          src={embedUrl}
          title="YouTube player"
        />
      ) : null}
      <PlayerControls controls={controls} state={state} />
    </>
  )
}

function FileSurface({
  url,
  durationSeconds
}: {
  url: string
  durationSeconds: number | null
}): ReactElement {
  const videoRef = useRef<HTMLVideoElement>(null)
  const { state, controls } = useFilePlayer(videoRef, durationSeconds)
  return (
    <>
      <video
        ref={videoRef}
        autoPlay
        className="size-full object-contain"
        src={url}
        onClick={controls.togglePlay}
      />
      <PlayerControls controls={controls} state={state} />
    </>
  )
}

/**
 * The in-app glass video player (videorc-design glass recipe: translucent
 * fill + backdrop-blur + hairline border) — plays Sermons/Videos content
 * without leaving the app. YouTube sources drive the real YouTube IFrame
 * Player API so the glass bar controls actual playback; anything else plays
 * through a plain <video> element.
 */
export function VideoPlayerDialog({
  open,
  onOpenChange,
  url,
  title,
  durationSeconds = null
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  url: string | null
  title: string
  /** The duration the admin backend fetched from the YouTube Data API and
   *  stored on the video/sermon record, if any — see useFilePlayer's doc
   *  comment for why this wins over the live player's self-reported value. */
  durationSeconds?: number | null
}): ReactElement {
  const youtubeId = url ? extractYouTubeId(url) : null

  // Scoped strictly to while this dialog is open — see the
  // body[data-video-player-open] rule in styles.css. Stamped/cleared here
  // rather than left permanently on so every other page keeps its normal
  // scrollbar; only suppressed for the moment a background page's overlay
  // scrollbar would otherwise bleed through this dialog's translucent backdrop.
  useEffect(() => {
    if (!open) return
    document.body.dataset.videoPlayerOpen = 'true'
    return () => {
      delete document.body.dataset.videoPlayerOpen
    }
  }, [open])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          // The base dialog styling (dialog.tsx) caps every dialog at
          // sm:max-w-md (28rem) — since this app's window is never narrower
          // than the sm breakpoint, that responsive rule always wins over a
          // plain max-w-[...] override, which is why earlier "make it
          // bigger" passes never actually changed the rendered size.
          // max-w-none (at both the unprefixed and sm: tiers) removes that
          // cap; width is then computed directly so the player always fills
          // up to 92% of the viewport width or 85% of the viewport height —
          // whichever is smaller — so it can never overflow the window
          // (which was producing a stray scrollbar) while staying as large
          // as the screen allows.
          'aspect-video w-[min(92vw,151.11vh)] max-w-none gap-0 overflow-hidden border-white/10 bg-black p-0 shadow-2xl sm:max-w-none'
        )}
        showCloseButton
      >
        <DialogTitle className="sr-only">{title}</DialogTitle>
        <div className="relative size-full">
          {!url ? null : youtubeId ? (
            <YouTubeSurface durationSeconds={durationSeconds} key={youtubeId} videoId={youtubeId} />
          ) : (
            <FileSurface durationSeconds={durationSeconds} key={url} url={url} />
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
