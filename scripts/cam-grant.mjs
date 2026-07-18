// One-time camera-permission trigger for the automation's host process.
//
// The macOS camera grant attaches to the *responsible* process. A grant done in
// the user's own terminal does not transfer to apps this automation spawns. The
// camera status is NotDetermined, so actually starting the camera here raises the
// system prompt (attributed to the automation host). Once the user clicks Allow,
// the grant persists and every future spawned app inherits it.

import { launchDevApp } from './lib/app-launcher.mjs'
import { connectBackend, request } from './smoke-recording-session.mjs'

const timeoutMs = 120000
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const layout = {
  layoutPreset: 'camera-only',
  cameraTransformMode: 'preset',
  cameraTransform: null,
  cameraCorner: 'bottom-right',
  cameraSize: 'medium',
  cameraShape: 'rectangle',
  cameraMargin: 32,
  cameraFit: 'fill',
  cameraMirror: false,
  cameraZoom: 100,
  cameraOffsetX: 0,
  cameraOffsetY: 0,
  sideBySideSplit: '70-30',
  sideBySideCameraSide: 'right'
}
const video = { preset: 'custom', width: 1280, height: 720, fps: 30, bitrateKbps: 6000 }

const launched = await launchDevApp({
  requiredMarkers: ['backend-ready'],
  timeoutMs,
  env: { VIDEORC_SMOKE_PRINT_BACKEND_READY: '1', VIDEORC_SMOKE_COMMAND_SERVER: '1' },
  onLine: (l) => {
    if (/camera|permission|avfoundation|denied|author/i.test(l)) console.log('APP>', l)
  }
})
const backend = launched.connections['backend-ready']

let ws
try {
  ws = await connectBackend(backend, timeoutMs)
  const ffmpegPath = process.env.VIDEORC_SMOKE_FFMPEG_PATH ?? '/opt/homebrew/bin/ffmpeg'
  const devices = await request(ws, timeoutMs, 'devices.list', { ffmpegPath })
  const all = devices.devices ?? []
  const cams = all.filter((d) => d.kind === 'camera')
  console.log('CAMERAS:', JSON.stringify(cams.map((c) => ({ id: c.id, name: c.name, status: c.status }))))
  const cam = cams.find((c) => String(c.id).includes('avfoundation-native')) ?? cams[0]
  if (!cam) {
    console.log('NO CAMERA FOUND in devices.list')
  } else {
    const sources = { screenId: null, windowId: null, cameraId: cam.id, microphoneId: null, testPattern: false }
    console.log(`\n>>> Starting camera "${cam.name}" — a macOS camera prompt should appear now. CLICK ALLOW. <<<\n`)
    try {
      const started = await request(ws, timeoutMs, 'preview.camera.start', {
        sources,
        layout,
        video,
        ffmpegPath
      })
      console.log('preview.camera.start ->', JSON.stringify({ state: started.state, permission: started.permission, message: started.message }))
    } catch (e) {
      console.log('preview.camera.start error:', String(e?.message ?? e))
    }
    for (let i = 0; i < 30; i += 1) {
      await sleep(2000)
      let st
      try {
        st = await request(ws, timeoutMs, 'preview.camera.status', {})
      } catch (e) {
        console.log(`status[${i}] err`, String(e?.message ?? e))
        continue
      }
      console.log(
        `status[${i}]`,
        JSON.stringify({ state: st.state, permission: st.permission, captureFps: st.captureFps ?? st.fps, frameAgeMs: st.frameAgeMs, message: st.message })
      )
      if (st.state === 'live') {
        console.log('\n✅ CAMERA LIVE — permission granted and capturing.\n')
        break
      }
    }
    const devices2 = await request(ws, timeoutMs, 'devices.list', { ffmpegPath })
    const cams2 = (devices2.devices ?? []).filter((d) => d.kind === 'camera')
    const cam2 = cams2.find((c) => c.id === cam.id)
    console.log('Camera status after:', JSON.stringify(cam2 ? { name: cam2.name, status: cam2.status } : 'not found'))
  }
} finally {
  try {
    ws?.close()
  } catch {
    /* ignore */
  }
  await launched.stop()
  console.log('=== cam-grant done ===')
}
