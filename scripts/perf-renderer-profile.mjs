// Renderer CPU + allocation attribution probe.
//
// Launches an isolated app instance with remote debugging enabled, attaches
// to the main window's renderer over CDP, and records (1) a sampling CPU
// profile and (2) a sampling allocation profile while the synthetic live
// preview runs. Prints the top self-time functions and top allocation sites —
// the ground truth for renderer de-churn work, instead of guessing from code.
//
// Usage: node scripts/perf-renderer-profile.mjs
// Env knobs: VIDEORC_PERF_PROFILE_SECONDS=12, VIDEORC_PROBE_TIMEOUT_MS=180000

import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { request as httpRequest } from 'node:http'

import { launchDevApp } from './lib/app-launcher.mjs'

const timeoutMs = Number(process.env.VIDEORC_PROBE_TIMEOUT_MS ?? 180000)
const profileSeconds = Number(process.env.VIDEORC_PERF_PROFILE_SECONDS ?? 12)
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
      this.pending.set(id, { resolve: resolveSend, reject: rejectSend })
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

function shortUrl(url) {
  if (!url) return '(anonymous)'
  const tail = url.split('/').slice(-2).join('/')
  return tail.length > 48 ? `…${tail.slice(-47)}` : tail
}

function topCpuEntries(profile, limit) {
  // Self time per node = hitCount × average sample interval.
  const totalHits = profile.nodes.reduce((sum, node) => sum + (node.hitCount ?? 0), 0)
  const totalMicros = profile.endTime - profile.startTime
  const microsPerHit = totalHits > 0 ? totalMicros / totalHits : 0
  const byFunction = new Map()
  for (const node of profile.nodes) {
    if (!node.hitCount) continue
    const frame = node.callFrame
    const key = `${frame.functionName || '(anonymous)'} @ ${shortUrl(frame.url)}:${frame.lineNumber + 1}`
    byFunction.set(key, (byFunction.get(key) ?? 0) + node.hitCount * microsPerHit)
  }
  return [...byFunction.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([key, micros]) => ({
      key,
      ms: micros / 1000,
      pct: totalMicros > 0 ? ((micros / totalMicros) * 100).toFixed(1) : '0'
    }))
}

function flattenAllocationNodes(node, out) {
  if (node.selfSize > 0) {
    const frame = node.callFrame
    const key = `${frame.functionName || '(anonymous)'} @ ${shortUrl(frame.url)}:${(frame.lineNumber ?? 0) + 1}`
    out.set(key, (out.get(key) ?? 0) + node.selfSize)
  }
  for (const child of node.children ?? []) {
    flattenAllocationNodes(child, out)
  }
}

let devtoolsUrl = null
const userDataDir = mkdtempSync(join(tmpdir(), 'videorc-perf-userdata-'))

const launched = await launchDevApp({
  requiredMarkers: ['backend-ready', 'preview-motion-ready'],
  timeoutMs,
  env: {
    VIDEORC_SMOKE_PREVIEW_MOTION: '1',
    VIDEORC_USER_DATA_DIR: userDataDir,
    VIDEORC_REMOTE_DEBUG_PORT: '0'
  },
  onLine: (line) => {
    const match = /DevTools listening on (ws:\/\/[^\s]+)/.exec(line)
    if (match) {
      devtoolsUrl = match[1]
    }
  }
})

try {
  if (!devtoolsUrl) {
    throw new Error('Never saw "DevTools listening" line; remote debugging not active.')
  }
  // ws://127.0.0.1:PORT/devtools/browser/<id> — list page targets over HTTP.
  const { host } = new URL(devtoolsUrl.replace('ws://', 'http://'))
  console.log('devtools endpoint:', host)

  // Let the studio mount and the synthetic preview pipeline spin up fully.
  await sleep(10000)
  const targets = await fetchJson(`http://${host}/json/list`)
  const mainWindowTarget = targets.find(
    (target) => target.type === 'page' && /^https?:\/\/localhost/.test(target.url ?? '')
  )
  if (!mainWindowTarget) {
    console.log('targets seen:', JSON.stringify(targets.map((t) => ({ type: t.type, url: t.url }))))
    throw new Error('No main-window renderer target found.')
  }
  console.log('profiling renderer:', mainWindowTarget.url)

  const cdp = await CdpClient.connect(mainWindowTarget.webSocketDebuggerUrl)
  try {
    await cdp.send('Profiler.enable')
    await cdp.send('Profiler.setSamplingInterval', { interval: 200 })
    await cdp.send('HeapProfiler.enable')

    const heapBefore = await cdp.send('Runtime.getHeapUsage')
    await cdp.send('HeapProfiler.startSampling', { samplingInterval: 16384 })
    await cdp.send('Profiler.start')
    console.log(`profiling for ${profileSeconds}s...`)
    await sleep(profileSeconds * 1000)
    const { profile } = await cdp.send('Profiler.stop')
    const { profile: allocationProfile } = await cdp.send('HeapProfiler.stopSampling')
    const heapAfter = await cdp.send('Runtime.getHeapUsage')

    const profilePath = join(tmpdir(), `videorc-renderer-${Date.now()}.cpuprofile`)
    writeFileSync(profilePath, JSON.stringify(profile))
    console.log(`raw cpuprofile: ${profilePath}`)

    console.log(`\n=== heap: ${(heapBefore.usedSize / 1048576).toFixed(0)}MB -> ${(heapAfter.usedSize / 1048576).toFixed(0)}MB used ===`)

    console.log(`\n=== top CPU self-time over ${profileSeconds}s ===`)
    for (const entry of topCpuEntries(profile, 22)) {
      console.log(`${entry.pct.padStart(5)}%  ${entry.ms.toFixed(0).padStart(6)}ms  ${entry.key}`)
    }

    console.log('\n=== top allocation sites (sampled bytes) ===')
    const allocators = new Map()
    flattenAllocationNodes(allocationProfile.head, allocators)
    const totalAllocated = [...allocators.values()].reduce((a, b) => a + b, 0)
    for (const [key, bytes] of [...allocators.entries()].sort((a, b) => b[1] - a[1]).slice(0, 18)) {
      console.log(
        `${((bytes / Math.max(1, totalAllocated)) * 100).toFixed(1).padStart(5)}%  ${(bytes / 1048576).toFixed(1).padStart(7)}MB  ${key}`
      )
    }
    console.log(`total sampled allocations: ${(totalAllocated / 1048576).toFixed(0)}MB over ${profileSeconds}s`)
  } finally {
    cdp.close()
  }
} finally {
  await launched.stop()
}
