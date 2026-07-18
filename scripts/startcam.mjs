// Start the Cam Link camera on an ALREADY-RUNNING app via the backend RPC, then
// validate the YUV->BGRA capture path (fps + a real frame for colour). Env: H P T.
import { request as httpRequest } from 'node:http'
import { createWriteStream } from 'node:fs'
import { connectBackend, request } from './smoke-recording-session.mjs'

const H = process.env.H, P = Number(process.env.P), T = process.env.T
const timeoutMs = 30000
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const W = Number(process.env.CAMW ?? 3840)
const HH = Number(process.env.CAMH ?? 2160)

const layout = {
  layoutPreset: 'camera-only', cameraTransformMode: 'preset', cameraTransform: null,
  cameraCorner: 'bottom-right', cameraSize: 'medium', cameraShape: 'rectangle', cameraMargin: 32,
  cameraFit: 'fill', cameraMirror: false, cameraZoom: 100, cameraOffsetX: 0, cameraOffsetY: 0,
  sideBySideSplit: '70-30', sideBySideCameraSide: 'right'
}
const video = { preset: 'custom', width: W, height: HH, fps: 30, bitrateKbps: 6000 }

function fetchToFile(path, out) {
  return new Promise((res) => {
    const sep = path.includes('?') ? '&' : '?'
    const req = httpRequest({ hostname: H, port: P, path: `${path}${sep}token=${encodeURIComponent(T)}`, method: 'GET' }, (r) => {
      if (r.statusCode !== 200) { res({ ok: false, status: r.statusCode }); r.resume(); return }
      const ws = createWriteStream(out); let b = 0; r.on('data', (c) => (b += c.length)); r.pipe(ws); ws.on('finish', () => res({ ok: true, bytes: b, out }))
    })
    req.on('error', (e) => res({ err: String(e?.message ?? e) })); req.end()
  })
}

const ws = await connectBackend({ host: H, port: P, token: T }, timeoutMs)
try {
  const ffmpegPath = process.env.VIDEORC_SMOKE_FFMPEG_PATH ?? '/opt/homebrew/bin/ffmpeg'
  const devs = await request(ws, timeoutMs, 'devices.list', { ffmpegPath })
  const cam = (devs.devices ?? []).find(
    (d) => d.kind === 'camera' && d.id.includes('avfoundation-native') && /cam link/i.test(d.name)
  )
  if (!cam) { console.log('No Cam Link found'); }
  else {
    console.log(`Starting ${cam.name} at ${W}x${HH}...`)
    const sources = { screenId: null, windowId: null, cameraId: cam.id, microphoneId: null, testPattern: false }
    const started = await request(ws, timeoutMs, 'preview.camera.start', {
      sources,
      layout,
      video,
      ffmpegPath
    })
    console.log('start ->', JSON.stringify({ state: started.state, width: started.width, height: started.height, message: started.message }))
    for (let i = 0; i < 14; i += 1) {
      await sleep(1000)
      const st = await request(ws, timeoutMs, 'preview.camera.status')
      const d = await request(ws, timeoutMs, 'diagnostics.stats')
      console.log(`t${i}`, JSON.stringify({ camFps: Math.round(st.sourceFps ?? 0), camAge: st.frameAgeMs, frames: st.framesCaptured, bufCount: d.previewSourceFrameBufferCount, presentFps: Math.round(d.previewPresentFps ?? 0), presentLatMs: d.previewInputToPresentLatencyMs, compLag: d.previewCompositorFrameLag }))
    }
    console.log('frame ->', JSON.stringify(await fetchToFile('/preview/camera/live.png', '/tmp/vrc_yuv_camera.png')))
  }
} finally {
  try { ws.close() } catch { /* ignore */ }
  console.log('=== startcam done ===')
}
