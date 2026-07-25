#!/usr/bin/env node
/**
 * dev-with-admin-backend.mjs — boots the prophet-roja-admin Next.js backend
 * (the `/api/admin/*` REST API Zemara reads/writes through) when it is not
 * already serving, then launches the desktop dev server.
 *
 * Why: the desktop app fails with "Could not reach the admin API" whenever
 * the admin backend was never started — nothing else reminds you it is a
 * separate process. This script makes `pnpm dev:all` the one command that
 * brings up both sides.
 *
 * Assumptions (override via env):
 *   PROPHET_ADMIN_DIR  — checkout of prophet-roja-admin.
 *                        Default: sibling directory ../prophet-roja-admin.
 *   PROPHET_ADMIN_PORT — port its dev server listens on. Default: 3000.
 *
 * Modes:
 *   (default)        ensure the admin backend is healthy, then exec the
 *                    desktop dev server in the foreground.
 *   --check          only ensure the admin backend is healthy, then exit.
 *                    Used by tests and CI verification.
 *
 * The admin backend keeps running after this script exits — it is a shared
 * local service, not a child we want to reap.
 */
import { spawn } from 'node:child_process'
import { existsSync, openSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const adminDir = process.env.PROPHET_ADMIN_DIR ?? path.resolve(repoRoot, '..', 'prophet-roja-admin')
const adminPort = Number(process.env.PROPHET_ADMIN_PORT ?? 3000)
const healthUrl = `http://127.0.0.1:${adminPort}/api/health`
const logPath = path.join(os.tmpdir(), 'prophet-roja-admin-dev.log')
const npmBin = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const pnpmBin = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'

const HEALTH_TIMEOUT_MS = 90_000

async function isAdminHealthy() {
  try {
    const response = await fetch(healthUrl, { signal: AbortSignal.timeout(1_500) })
    return response.ok
  } catch {
    return false
  }
}

async function waitForHealth(timeoutMs) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await isAdminHealthy()) return true
    await new Promise((resolve) => setTimeout(resolve, 1_000))
  }
  return false
}

async function ensureAdminBackend() {
  if (await isAdminHealthy()) {
    console.log(`[dev:all] admin backend already healthy at ${healthUrl}`)
    return
  }
  if (!existsSync(path.join(adminDir, 'package.json'))) {
    console.error(
      `[dev:all] prophet-roja-admin checkout not found at ${adminDir}.\n` +
        '          Set PROPHET_ADMIN_DIR to its location and retry.'
    )
    process.exit(1)
  }
  console.log(`[dev:all] starting admin backend in ${adminDir} (log: ${logPath})`)
  const logFd = openSync(logPath, 'a')
  const child = spawn(npmBin, ['run', 'dev'], {
    cwd: adminDir,
    detached: true,
    stdio: ['ignore', logFd, logFd],
    env: process.env
  })
  child.unref()
  console.log(`[dev:all] waiting for ${healthUrl} …`)
  if (!(await waitForHealth(HEALTH_TIMEOUT_MS))) {
    console.error(
      `[dev:all] admin backend did not become healthy within ${HEALTH_TIMEOUT_MS / 1000}s.\n` +
        `          Inspect the log: ${logPath}`
    )
    process.exit(1)
  }
  console.log('[dev:all] admin backend is healthy')
}

const checkOnly = process.argv.includes('--check')
await ensureAdminBackend()
if (checkOnly) process.exit(0)

console.log('[dev:all] launching desktop dev server…')
const desktop = spawn(pnpmBin, ['--filter', '@videorc/desktop', 'dev'], {
  cwd: repoRoot,
  stdio: 'inherit',
  env: process.env
})
desktop.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal)
  process.exit(code ?? 0)
})
