// Does the performance timeline grow unboundedly while the app idles?
//
// React 19's dev build logs component renders onto the performance timeline
// (performance.measure entries with devtools detail). Those entries live in
// Blink — outside the V8 heap — so if something re-renders continuously, the
// timeline buffer is a renderer-process leak that heap snapshots cannot see.
// This probe samples entry counts twice, 30s apart, in an isolated instance.
//
// Usage: node scripts/perf-timeline-count-probe.mjs

import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { request as httpRequest } from 'node:http'

import { launchDevApp } from './lib/app-launcher.mjs'

const timeoutMs = Number(process.env.VIDEORC_PROBE_TIMEOUT_MS ?? 180000)
const windowSeconds = Number(process.env.VIDEORC_TIMELINE_WINDOW_SECONDS ?? 30)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function fetchJson(url) {
  return new Promise((resolveFetch, rejectFetch) => {
    const req = httpRequest(url, { method: 'GET' }, (res) => {
      let text = ''
      res.setEncoding('utf8')
      res.on('data', (c) => (text += c))
      res.on('end', () => {
        try {
          resolveFetch(JSON.parse(text))
        } catch (e) {
          rejectFetch(e)
        }
      })
    })
    req.on('error', rejectFetch)
    req.end()
  })
}

class CdpClient {
  constructor(ws) {
    this.ws = ws
    this.serial = 0
    this.pending = new Map()
    ws.addEventListener('message', (event) => {
      const message = JSON.parse(event.data)
      if (message.id && this.pending.has(message.id)) {
        const { resolve, reject } = this.pending.get(message.id)
        this.pending.delete(message.id)
        if (message.error) reject(new Error(message.error.message))
        else resolve(message.result)
      }
    })
  }

  static connect(url) {
    return new Promise((resolveConnect, rejectConnect) => {
      const ws = new WebSocket(url)
      ws.addEventListener('open', () => resolveConnect(new CdpClient(ws)))
      ws.addEventListener('error', () => rejectConnect(new Error(`CDP connect failed: ${url}`)))
    })
  }

  send(method, params = {}) {
    const id = ++this.serial
    return new Promise((resolveSend, rejectSend) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        rejectSend(new Error(`CDP ${method} timed out`))
      }, 10000)
      this.pending.set(id, {
        resolve: (value) => {
          clearTimeout(timer)
          resolveSend(value)
        },
        reject: (error) => {
          clearTimeout(timer)
          rejectSend(error)
        }
      })
      this.ws.send(JSON.stringify({ id, method, params }))
    })
  }

  close() {
    try {
      this.ws.close()
    } catch {
      /* ignore */
    }
  }
}

const SAMPLE = `JSON.stringify({
  measures: performance.getEntriesByType('measure').length,
  marks: performance.getEntriesByType('mark').length,
  all: performance.getEntries().length,
  sampleMeasure: String(performance.getEntriesByType('measure').slice(-1)[0]?.name ?? '')
})`

const userDataDir = mkdtempSync(join(tmpdir(), 'videorc-timeline-userdata-'))
let devtoolsUrl = null
const launched = await launchDevApp({
  requiredMarkers: ['backend-ready', 'preview-motion-ready'],
  timeoutMs,
  env: {
    VIDEORC_SMOKE_PREVIEW_MOTION: '1',
    VIDEORC_USER_DATA_DIR: userDataDir,
    VIDEORC_DATABASE_PATH: join(userDataDir, 'videorc.sqlite3'),
    VIDEORC_REMOTE_DEBUG_PORT: '0'
  },
  onLine: (line) => {
    const devtools = /DevTools listening on (ws:\/\/[^\s]+)/.exec(line)
    if (devtools) devtoolsUrl = devtools[1]
  }
})

try {
  if (!devtoolsUrl) throw new Error('no DevTools endpoint observed')
  await sleep(12000)
  const { host } = new URL(devtoolsUrl.replace('ws://', 'http://'))
  const targets = await fetchJson(`http://${host}/json/list`)
  const mainTarget = targets.find(
    (target) => target.type === 'page' && /^https?:\/\/localhost/.test(target.url ?? '')
  )
  if (!mainTarget) throw new Error('main window target not found')
  const cdp = await CdpClient.connect(mainTarget.webSocketDebuggerUrl)

  const readCounts = async () => {
    const result = await cdp.send('Runtime.evaluate', {
      expression: SAMPLE,
      returnByValue: true
    })
    return JSON.parse(result.result.value)
  }

  const before = await readCounts()
  console.log('t0   ', before)
  await sleep(windowSeconds * 1000)
  const after = await readCounts()
  console.log(`t+${windowSeconds}s`, after)
  console.log(
    `\nmeasure entries: ${((after.measures - before.measures) / windowSeconds).toFixed(1)}/s   ` +
      `marks: ${((after.marks - before.marks) / windowSeconds).toFixed(1)}/s   ` +
      `all entries: ${((after.all - before.all) / windowSeconds).toFixed(1)}/s`
  )
  cdp.close()
} finally {
  await launched.stop()
}
