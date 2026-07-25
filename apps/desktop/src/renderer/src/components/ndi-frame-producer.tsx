import { useEffect, useRef, type ReactElement } from 'react'

import { useAdminBackendContext } from '@/components/admin-backend-provider'
import { renderNdiVerseFrame } from '@/lib/ndi-verse-renderer'
import { NDI_RESOLUTION_DIMENSIONS } from '@/lib/backend'

/**
 * Headless NDI frame pump — pewbeam's cadence, replicated deliberately:
 * a burst of 3 frames (0 / 150 / 300 ms) whenever the verse, theme, or
 * config changes so receivers refresh immediately, plus a 2 s keepalive so
 * receivers never time out, plus an in-flight guard so a slow backend never
 * gets frames queued faster than it can transmit them. NDI receivers hold
 * the last frame, so continuous fps streaming would only waste CPU.
 */

const BURST_DELAYS_MS = [0, 150, 300]
const KEEPALIVE_MS = 2000
const BASE64_CHUNK = 0x8000

function rgbaToBase64(bytes: Uint8ClampedArray): string {
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += BASE64_CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + BASE64_CHUNK))
  }
  return btoa(binary)
}

export function NdiFrameProducer(): ReactElement | null {
  const { livingTextOutputTheme, livingTextLiveVerse, ndiConfig, ndiStatus, ndiSendFrame } =
    useAdminBackendContext()

  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const backgroundImageRef = useRef<HTMLImageElement | null>(null)
  const backgroundImagePathRef = useRef<string | null>(null)
  const inFlightRef = useRef(false)
  const timersRef = useRef<number[]>([])
  // Latest render inputs, so timer callbacks always draw the current verse.
  const latestRef = useRef({ livingTextOutputTheme, livingTextLiveVerse, ndiConfig })
  latestRef.current = { livingTextOutputTheme, livingTextLiveVerse, ndiConfig }

  const active = ndiStatus?.active === true

  // Load (and cache by path) the theme background image off the main thread
  // of the render loop; a missing image simply falls back to solid black.
  const backgroundImagePath =
    livingTextOutputTheme.backgroundType === 'image'
      ? livingTextOutputTheme.backgroundImagePath
      : null
  useEffect(() => {
    if (!backgroundImagePath || backgroundImagePath === backgroundImagePathRef.current) return
    let cancelled = false
    const image = new Image()
    image.onload = () => {
      if (cancelled) return
      backgroundImageRef.current = image
      backgroundImagePathRef.current = backgroundImagePath
    }
    image.onerror = () => {
      if (cancelled) return
      backgroundImageRef.current = null
      backgroundImagePathRef.current = backgroundImagePath
    }
    image.src = backgroundImagePath
    return () => {
      cancelled = true
    }
  }, [backgroundImagePath])

  useEffect(() => {
    if (!active) return

    console.info('[ndi] producer active — starting frame pump')

    const sendFrame = (): void => {
      if (inFlightRef.current) return
      const {
        livingTextOutputTheme: theme,
        livingTextLiveVerse: verse,
        ndiConfig: config
      } = latestRef.current
      const { width, height } = NDI_RESOLUTION_DIMENSIONS[config.resolution]

      let canvas = canvasRef.current
      if (!canvas) {
        canvas = document.createElement('canvas')
        canvasRef.current = canvas
      }
      if (canvas.width !== width) canvas.width = width
      if (canvas.height !== height) canvas.height = height

      renderNdiVerseFrame(canvas, {
        theme,
        verse,
        backgroundImage: backgroundImageRef.current,
        alphaMode: config.alphaMode
      })

      const ctx = canvas.getContext('2d')
      if (!ctx) return
      const pixels = ctx.getImageData(0, 0, width, height)

      inFlightRef.current = true
      void ndiSendFrame(width, height, rgbaToBase64(pixels.data))
        .catch((error) => {
          // A dropped frame is not fatal — the next burst/keepalive retries,
          // but the reason must be visible, never silent.
          console.warn('[ndi] frame send failed', error)
        })
        .finally(() => {
          inFlightRef.current = false
        })
    }

    const clearTimers = (): void => {
      for (const timer of timersRef.current) window.clearTimeout(timer)
      timersRef.current = []
    }

    // Content-change burst.
    clearTimers()
    timersRef.current = BURST_DELAYS_MS.map((delay) => window.setTimeout(sendFrame, delay))

    // Keepalive so receivers hold the source open between changes.
    const keepalive = window.setInterval(sendFrame, KEEPALIVE_MS)

    return () => {
      clearTimers()
      window.clearInterval(keepalive)
    }
    // livingTextLiveVerse/Theme/config identity changes re-trigger the burst;
    // `active` gates the whole pump; ndiSendFrame is stable.
  }, [active, livingTextLiveVerse, livingTextOutputTheme, ndiConfig, ndiSendFrame])

  return null
}
